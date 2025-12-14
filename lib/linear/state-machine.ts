/**
 * Application State Machine
 * 
 * Manages candidate application workflow as a state machine driven by Linear issue updates
 * State transitions are triggered by Linear webhook events based on labels and status
 */

import { createLinearClient } from './client';
import { parseCV } from './cv-parser';
import { screenCandidate } from '../cerebras/candidate-screening';
import {
  determineIssueState,
  generateReasoningComment,
  addIssueComment
} from './state-management';
import { checkMeterBalance } from '@/lib/polar/usage-meters';
import { checkEmailCommunicationBenefit, checkAIScreeningBenefit } from '@/lib/polar/benefits';
import { sendConfirmationEmail, sendRejectionEmail, sendScreeningInvitationEmail } from '@/lib/resend/templates';
import {
  generateReplyToAddress,
  getLastMessageId,
  buildThreadReferences
} from '@/lib/resend/email-threading';
import { generateConversationPointers } from '@/lib/cerebras/conversation-pointers';
import { createScreeningSession } from '@/lib/elevenlabs/session-secrets';
import { config } from '@/lib/config';
import { withRetry, isRetryableError } from '../utils/retry';
import { logger } from '@/lib/datadog/logger';
import { Issue, Project } from '@linear/sdk';
import { extractCandidateInfo as extractCandidateInfoFromMetadata } from './candidate-metadata';

/**
 * State machine labels
 */
export const STATE_LABELS = {
  NEW: 'New',
  PROCESSED: 'Processed',
  PRE_SCREENED: 'Pre-screened',
  REJECTION_EMAIL_SENT: 'Rejection-Email-Sent',
  SCREENING_INVITATION_SENT: 'Screening-Invitation-Sent',
} as const;

/**
 * State machine statuses
 */
export const STATE_STATUSES = {
  TODO: 'Todo',
  TRIAGE: 'Triage',
  IN_PROGRESS: 'In Progress',
  DECLINED: 'Declined',
} as const;

/**
 * State status details keyed by display name
 * Contains all necessary information to create states on-demand
 */
const STATE_STATUS_DETAILS: Record<string, {
  color: string;
  type: "unstarted" | "started" | "completed" | "canceled";
  description: string;
}> = {
  "Todo": {
    color: "#4A90E2",
    type: "unstarted",
    description: "Work that has been accepted but not yet started.",
  },

  "Triage": {
    color: "#F2C94C",
    type: "unstarted",
    description: "New or unreviewed work awaiting prioritization or assignment.",
  },

  "In Progress": {
    color: "#5E6AD2",
    type: "started",
    description: "Work actively being worked on.",
  },

  "Declined": {
    color: "#E5484D",
    type: "canceled",
    description: "Work that has been reviewed but will not be pursued.",
  },
};


/**
 * Handle issue update events from Linear webhook
 * Advances the state machine based on current labels and status
 * 
 * @param linearAccessToken - Linear API access token
 * @param issueId - Linear Issue ID
 * @param atsContainerInitiativeId - ATS Container Initiative ID
 * @param linearOrgId - Linear organization UUID (for Polar integration)
 * @param linearOrgSlug - Linear organization slug/urlKey (for Redis and email threading)
 */
export async function handleIssueUpdate(
  linearAccessToken: string,
  issueId: string,
  atsContainerInitiativeId: string,
  linearOrgId: string,
  linearOrgSlug: string
): Promise<void> {
  const client = createLinearClient(linearAccessToken);
  
  // Fetch the issue
  const issue = await client.issue(issueId);
  
  if (!issue) {
    logger.error('Issue not found', undefined, { issueId });
    return;
  }
  
  // Get the project to verify it belongs to ATS Container
  const project = await issue.project;
  
  if (!project) {
    logger.info('Issue has no associated project, skipping state machine', { issueId });
    return;
  }
  
  // Verify the Project belongs to the ATS Container Initiative
  const projectInitiatives = await project.initiatives();
  const belongsToAtsContainer = projectInitiatives.nodes.some(
    (initiative) => initiative.id === atsContainerInitiativeId
  );

  if (!belongsToAtsContainer) {
    logger.info('Project does not belong to ATS Container Initiative, skipping state machine', { issueId });
    return;
  }

  // Get current labels and state
  const labels = await issue.labels();
  const labelNames = labels.nodes.map(l => l.name);
  const state = await issue.state;
  const stateName = state?.name;
  
  // State machine transitions
  
  // Transition 0: New → Send Confirmation Email (if benefit exists)
  // This happens before document processing
  if (stateName === STATE_STATUSES.TODO && labelNames.includes(STATE_LABELS.NEW)) {
    await sendConfirmationEmailIfEnabled(issue, project, linearOrgId, linearOrgSlug, linearAccessToken);
    await processDocuments(client, issue);
    return;
  }
  
  // Transition 1: Processed → Run Screening
  if (stateName === STATE_STATUSES.TODO && labelNames.includes(STATE_LABELS.PROCESSED)) {
    await runScreening(client, issue, project, linearOrgId, linearAccessToken);
    return;
  }
  
  // Transition 2: In Progress + Pre-screened → Send AI Screening Invitation (if benefit exists)
  if (stateName === STATE_STATUSES.IN_PROGRESS && labelNames.includes(STATE_LABELS.PRE_SCREENED)) {
    await sendScreeningInvitationIfEnabled(issue, project, linearOrgId, linearOrgSlug, linearAccessToken);
    return;
  }
  
  // Transition 3: Declined → Send Rejection Email (if benefit exists)
  if (stateName === STATE_STATUSES.DECLINED) {
    await sendRejectionEmailIfEnabled(issue, project, linearOrgId, linearOrgSlug, linearAccessToken);
    return;
  }
}

/**
 * Send confirmation email if organization has email communication benefit
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
async function sendConfirmationEmailIfEnabled(
  issue: Issue,
  project: Project,
  linearOrgId: string,
  linearOrgSlug: string,
  linearAccessToken: string
): Promise<void> {
  try {
    logger.info('Checking email communication benefit for confirmation email', { 
      issueId: issue.id,
      linearOrgId,
      linearOrgSlug,
    });
    
    // Check if organization has email communication benefit
    const hasEmailBenefit = await checkEmailCommunicationBenefit(linearOrgId);
    
    if (!hasEmailBenefit) {
      logger.info('Organization does not have email communication benefit, skipping confirmation email', {
        issueId: issue.id,
        linearOrgId,
        linearOrgSlug,
      });
      return;
    }
    
    // Extract candidate information from issue description
    const candidateInfo = extractCandidateInfo(issue.description || '');
    
    if (!candidateInfo) {
      logger.error('Could not extract candidate info from issue, skipping confirmation email', undefined, {
        issueId: issue.id,
      });
      return;
    }
    
    // Get position title from project
    const positionTitle = project.name || 'Position';
    
    // Get organization name and slug from Linear org
    const team = await issue.team;
    if (!team) {
      logger.error('Issue team not found', undefined, { issueId: issue.id });
      return;
    }
    const organization = await team.organization;
    const organizationName = organization?.name || 'Our Team';

    // Create comment FIRST to get comment ID for threading
    const commentBody = `*Confirmation email sent to ${candidateInfo.email}*\n\nReplies to this email will be added as comments to this issue.\n\n---\n\nMessage-ID: pending`;

    const commentId = await addIssueComment(
      linearAccessToken,
      issue.id,
      commentBody
    );

    if (!commentId) {
      logger.error('Failed to create comment before sending confirmation email', undefined, { issueId: issue.id });
      return;
    }

    // Generate dynamic reply-to address WITH comment ID for threading
    const replyToAddress = generateReplyToAddress(linearOrgSlug, issue.id, commentId);

    logger.info('Sending confirmation email', {
      issueId: issue.id,
      candidateEmail: candidateInfo.email,
      candidateName: candidateInfo.name,
      positionTitle,
      organizationName,
      replyToAddress,
      commentId,
    });

    // Send confirmation email
    try {
      const emailResult = await sendConfirmationEmail({
        to: candidateInfo.email,
        candidateName: candidateInfo.name,
        organizationName,
        positionTitle,
        replyTo: replyToAddress,
      });

      logger.info('Confirmation email sent successfully', {
        issueId: issue.id,
        emailId: emailResult?.id,
        candidateEmail: candidateInfo.email,
        commentId,
      });

      // Update comment with actual Message-ID
      const messageId = emailResult?.id || 'unknown';
      const updatedCommentBody = `*Confirmation email sent to ${candidateInfo.email}*\n\nReplies to this email will be added as comments to this issue.\n\n---\n\nMessage-ID: ${messageId}`;

      const client = createLinearClient(linearAccessToken);
      await client.updateComment(commentId, {
        body: updatedCommentBody,
      });

      logger.info('Updated confirmation email comment with Message-ID', {
        issueId: issue.id,
        messageId,
        commentId,
      });
    } catch (emailError) {
      // Handle email sending failures gracefully - log but don't throw
      // Application processing should continue even if email fails
      logger.error('Failed to send confirmation email', emailError instanceof Error ? emailError : new Error(String(emailError)), {
        issueId: issue.id,
        candidateEmail: candidateInfo.email,
        positionTitle,
      });
      
      // Add comment noting the failure
      try {
        await addIssueComment(
          linearAccessToken,
          issue.id,
          `*Failed to send confirmation email to ${candidateInfo.email}. Error: ${emailError instanceof Error ? emailError.message : 'Unknown error'}*`
        );
      } catch (commentError) {
        logger.error('Failed to add email failure comment', commentError instanceof Error ? commentError : new Error(String(commentError)), {
          issueId: issue.id,
        });
      }
    }
  } catch (error) {
    // Log error but don't throw - we don't want to block application processing
    logger.error('Error in sendConfirmationEmailIfEnabled', error instanceof Error ? error : new Error(String(error)), {
      issueId: issue.id,
      linearOrgId,
    });
  }
}

/**
 * Process CV and cover letter documents
 * Extracts text from attachments and updates issue description
 * CRITICAL: Only performs ONE update operation to avoid infinite webhook loops
 */
async function processDocuments(
  client: ReturnType<typeof createLinearClient>,
  issue: Issue,
): Promise<void> {
  try {
    logger.info('Processing documents for issue', { issueId: issue.id });
    
    // Get attachments
    const attachments = await issue.attachments();
    
    // Find CV and cover letter attachments
    const cvAttachment = attachments?.nodes.find((a) => 
      a.title?.toLowerCase().includes('cv') || a.title?.toLowerCase().includes('resume')
    );
    
    const coverLetterAttachment = attachments?.nodes.find((a) => 
      a.title?.toLowerCase().includes('cover letter')
    );
    
    let parsedContent = '';
    
    // Parse CV
    if (cvAttachment && cvAttachment.url) {
      try {
        const response = await fetch(cvAttachment.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch CV: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const cvBuffer = Buffer.from(arrayBuffer);
        const cvText = await parseCV(cvBuffer, cvAttachment.title || 'cv.pdf');
        parsedContent += `## CV Content\n\n${cvText}\n\n`;
      } catch (error) {
        logger.error('Failed to parse CV', error instanceof Error ? error : new Error(String(error)), {
          issueId: issue.id,
          attachmentTitle: cvAttachment.title,
        });
      }
    }
    
    // Parse cover letter
    if (coverLetterAttachment && coverLetterAttachment.url) {
      try {
        const response = await fetch(coverLetterAttachment.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch cover letter: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const clBuffer = Buffer.from(arrayBuffer);
        const clText = await parseCV(clBuffer, coverLetterAttachment.title || 'cover-letter.pdf');
        parsedContent += `## Cover Letter Content\n\n${clText}\n\n`;
      } catch (error) {
        logger.error('Failed to parse cover letter', error instanceof Error ? error : new Error(String(error)), {
          issueId: issue.id,
          attachmentTitle: coverLetterAttachment.title,
        });
      }
    }
    
    // Prepare the single update operation
    const currentDescription = issue.description || '';
    const updatedDescription = parsedContent 
      ? `${currentDescription}\n\n---\n\n${parsedContent}`
      : currentDescription;
    
    // Get current labels and prepare new label set
    const labels = await issue.labels();
    const currentLabelIds = labels.nodes
      .filter((l) => l.name !== STATE_LABELS.NEW)
      .map((l) => l.id);
    
    // Ensure "Processed" label exists
    const processedLabelId = await ensureLabel(client, STATE_LABELS.PROCESSED);
    
    // SINGLE UPDATE: Update description and labels in one operation
    await client.updateIssue(issue.id, {
      description: updatedDescription,
      labelIds: [...currentLabelIds, processedLabelId],
    });
    
    logger.info('Document processing completed', { issueId: issue.id });
  } catch (error) {
    logger.error('Error processing documents', error instanceof Error ? error : new Error(String(error)), {
      issueId: issue.id,
    });
  }
}

/**
 * Run AI screening process
 * Checks meter balance and runs screening if available
 * CRITICAL: Only performs ONE update operation to avoid infinite webhook loops
 */
async function runScreening(
  client: ReturnType<typeof createLinearClient>,
  issue: Issue,
  project: Project,
  linearOrgId: string,
  linearAccessToken: string
): Promise<void> {
  try {
    logger.info('Running screening for issue', { issueId: issue.id });
    
    // Check meter balance
    const balanceCheck = await checkMeterBalance(linearOrgId, 'candidate_screenings');
    
    // If balance is 0, move to Triage (with comment added separately - not a state change)
    if (!balanceCheck.allowed && !balanceCheck.unlimited) {
      logger.warn('Insufficient balance for screening, moving to Triage', {
        issueId: issue.id,
        balance: balanceCheck.balance,
      });

      // Get team and ensure Triage state exists
      const team = await issue.team;
      if (!team) {
        logger.error('Issue team not found', undefined, { issueId: issue.id });
        return;
      }

      const triageStateId = await ensureState(client, team.id, STATE_STATUSES.TRIAGE, STATE_STATUSES.TODO);

      if (!triageStateId) {
        logger.error('Failed to ensure Triage or Todo state', undefined, { issueId: issue.id });
        return;
      }

      // Get current labels and prepare new label set
      const labels = await issue.labels();
      const currentLabelIds = labels.nodes
        .filter((l) => l.name !== STATE_LABELS.PROCESSED)
        .map((l) => l.id);

      // Ensure "Pre-screened" label exists
      const prescreenedLabelId = await ensureLabel(client, STATE_LABELS.PRE_SCREENED);

      // SINGLE UPDATE: Update state and labels in one operation
      await client.updateIssue(issue.id, {
        stateId: triageStateId,
        labelIds: [...currentLabelIds, prescreenedLabelId],
      });

      // Add comment separately (doesn't trigger webhook)
      await addIssueComment(
        linearAccessToken,
        issue.id,
        '*Candidate screening skipped due to insufficient balance. Manual review required.*'
      );

      return;
    }
    
    // Get issue description and job description
    const issueDescription = issue.description || '';
    const jobDescription = project.content || project.description || '';
    
    if (!issueDescription || !jobDescription) {
      logger.error('Missing content for screening', undefined, {
        issueId: issue.id,
        hasIssueDescription: !!issueDescription,
        hasJobDescription: !!jobDescription,
      });

      // Get team and ensure Triage state exists
      const team = await issue.team;
      if (!team) {
        logger.error('Issue team not found', undefined, { issueId: issue.id });
        return;
      }

      const triageStateId = await ensureState(client, team.id, STATE_STATUSES.TRIAGE, STATE_STATUSES.TODO);

      if (triageStateId) {
        await client.updateIssue(issue.id, {
          stateId: triageStateId,
        });
      }
      return;
    }
    
    // Run AI screening
    const screeningResult = await withRetry(
      () => screenCandidate(issueDescription, jobDescription, linearOrgId, {
        userId: 'webhook',
        resourceId: issue.id,
      }),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );
    
    logger.info('Screening completed', {
      issueId: issue.id,
      confidence: screeningResult.confidence,
      recommendedState: screeningResult.recommendedState,
    });
    
    // Determine target state based on screening result
    const targetState = determineIssueState(screeningResult);

    // Map to state machine statuses
    let newStatusName: string;
    if (targetState === 'In Progress') {
      newStatusName = STATE_STATUSES.IN_PROGRESS;
    } else if (targetState === 'Declined') {
      newStatusName = STATE_STATUSES.DECLINED;
    } else {
      newStatusName = STATE_STATUSES.TRIAGE;
    }

    // Get state details for on-demand creation
    const stateDetails = STATE_STATUS_DETAILS[newStatusName];
    
    // Get team and find target state
    const team = await issue.team;
    if (!team) {
      logger.error('Issue team not found', undefined, { issueId: issue.id });
      return;
    }
    const states = await team.states();
    let targetStateObj = states.nodes.find((s) => s.name === newStatusName);

    if (!targetStateObj) {
      logger.warn('Target state not found, creating it', { issueId: issue.id, newStatusName });

      if (!stateDetails) {
        logger.error('State details not found for state name', undefined, { issueId: issue.id, newStatusName });
        return;
      }

      const result = await client.createWorkflowState({
        teamId: team.id,
        name: newStatusName,
        type: stateDetails.type,
        color: stateDetails.color,
        description: stateDetails.description,
      });
      targetStateObj = await result.workflowState;

      if (!targetStateObj) {
        logger.error('Failed to create target state', undefined, { issueId: issue.id, newStatusName });
        return;
      }

      logger.info('Target state created successfully', { issueId: issue.id, newStatusName, stateId: targetStateObj.id });
    }
    
    // Get current labels and prepare new label set
    const labels = await issue.labels();
    const currentLabelIds = labels.nodes
      .filter((l) => l.name !== STATE_LABELS.PROCESSED)
      .map((l) => l.id);
    
    // Ensure "Pre-screened" label exists
    const prescreenedLabelId = await ensureLabel(client, STATE_LABELS.PRE_SCREENED);
    
    // SINGLE UPDATE: Update state and labels in one operation
    await client.updateIssue(issue.id, {
      stateId: targetStateObj.id,
      labelIds: [...currentLabelIds, prescreenedLabelId],
    });
    
    // Add reasoning comment separately (doesn't trigger webhook)
    const reasoningComment = generateReasoningComment(screeningResult);
    await addIssueComment(linearAccessToken, issue.id, reasoningComment);
    
    logger.info('Screening workflow completed', { issueId: issue.id, newStatus: newStatusName });
  } catch (error) {
    logger.error('Error running screening', error instanceof Error ? error : new Error(String(error)), {
      issueId: issue.id,
    });

    // Move to Triage on error
    try {
      const team = await issue.team;
      if (!team) {
        logger.error('Issue team not found', undefined, { issueId: issue.id });
        return;
      }

      const triageStateId = await ensureState(client, team.id, STATE_STATUSES.TRIAGE, STATE_STATUSES.TODO);

      if (triageStateId) {
        await client.updateIssue(issue.id, {
          stateId: triageStateId,
        });
      }
    } catch (updateError) {
      logger.error('Failed to move to Triage on error', updateError instanceof Error ? updateError : new Error(String(updateError)), {
        issueId: issue.id,
      });
    }
  }
}

/**
 * Send rejection email if organization has email communication benefit
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
async function sendRejectionEmailIfEnabled(
  issue: Issue,
  project: Project,
  linearOrgId: string,
  linearOrgSlug: string,
  linearAccessToken: string
): Promise<void> {
  try {
    logger.info('Checking email communication benefit for rejection email', { 
      issueId: issue.id,
      linearOrgId,
    });
    
    // Check if organization has email communication benefit (Requirement 4.3)
    const hasEmailBenefit = await checkEmailCommunicationBenefit(linearOrgId);
    
    if (!hasEmailBenefit) {
      logger.info('Organization does not have email communication benefit, skipping rejection email', {
        issueId: issue.id,
        linearOrgId,
      });
      return;
    }
    
    // Check if rejection email already sent using label (idempotence - Requirement 4.5)
    const labels = await issue.labels();
    const labelNames = labels.nodes.map(l => l.name);
    const rejectionEmailAlreadySent = labelNames.includes(STATE_LABELS.REJECTION_EMAIL_SENT);
    
    if (rejectionEmailAlreadySent) {
      logger.info('Rejection email already sent (label present), skipping duplicate', {
        issueId: issue.id,
      });
      return;
    }
    
    // Extract candidate information from issue description
    const candidateInfo = extractCandidateInfo(issue.description || '');
    
    if (!candidateInfo) {
      logger.error('Could not extract candidate info from issue, skipping rejection email', undefined, {
        issueId: issue.id,
      });
      return;
    }
    
    // Get position title from project (Requirement 4.4)
    const positionTitle = project.name || 'Position';
    
    // Get organization name from Linear org
    const team = await issue.team;
    if (!team) {
      logger.error('Issue team not found', undefined, { issueId: issue.id });
      return;
    }
    const organization = await team.organization;
    const organizationName = organization?.name || 'Our Team';

    // Create comment FIRST to get comment ID for threading
    const commentBody = `*Rejection email sent to ${candidateInfo.email}*\n\nThis candidate has been notified of the decision.\n\n---\n\nMessage-ID: pending`;

    const commentId = await addIssueComment(
      linearAccessToken,
      issue.id,
      commentBody
    );

    if (!commentId) {
      logger.error('Failed to create comment before sending rejection email', undefined, { issueId: issue.id });
      return;
    }

    // Generate dynamic reply-to address WITH comment ID for threading
    const replyToAddress = generateReplyToAddress(linearOrgSlug, issue.id, commentId);

    // Get all comments for threading
    const issueComments = await issue.comments();
    const commentBodies = issueComments.nodes.map(c => c.body || '');

    // Extract threading information from previous comments
    const lastMessageId = getLastMessageId(commentBodies);
    const references = buildThreadReferences(commentBodies);

    logger.info('Sending rejection email', {
      issueId: issue.id,
      candidateEmail: candidateInfo.email,
      candidateName: candidateInfo.name,
      positionTitle,
      organizationName,
      replyToAddress,
      commentId,
      hasThreading: !!lastMessageId,
      referencesCount: references.length,
    });

    // Send rejection email (Requirement 4.1)
    // Use issue ID as idempotency key to prevent duplicate sends
    const idempotencyKey = `rejection-${issue.id}`;

    try {
      const emailResult = await sendRejectionEmail({
        to: candidateInfo.email,
        candidateName: candidateInfo.name,
        positionTitle,
        organizationName,
        replyTo: replyToAddress,
        inReplyTo: lastMessageId || undefined,
        references: references.length > 0 ? references : undefined,
        idempotencyKey,
      });

      logger.info('Rejection email sent successfully', {
        issueId: issue.id,
        emailId: emailResult?.id,
        candidateEmail: candidateInfo.email,
        commentId,
        idempotencyKey,
      });

      // Get the client to add the label
      const client = createLinearClient(linearAccessToken);

      // Ensure "Rejection-Email-Sent" label exists
      const rejectionEmailSentLabelId = await ensureLabel(client, STATE_LABELS.REJECTION_EMAIL_SENT);

      // Get current labels
      const currentLabels = await issue.labels();
      const currentLabelIds = currentLabels.nodes.map(l => l.id);

      // Add the "Rejection-Email-Sent" label to mark idempotency
      await client.updateIssue(issue.id, {
        labelIds: [...currentLabelIds, rejectionEmailSentLabelId],
      });

      // Update comment with actual Message-ID
      const messageId = emailResult?.id || 'unknown';
      const updatedCommentBody = `*Rejection email sent to ${candidateInfo.email}*\n\nThis candidate has been notified of the decision.\n\n---\n\nMessage-ID: ${messageId}`;

      await client.updateComment(commentId, {
        body: updatedCommentBody,
      });

      logger.info('Updated rejection email comment with Message-ID and added label', {
        issueId: issue.id,
        messageId,
        commentId,
      });
    } catch (emailError) {
      // Handle email sending failures gracefully - log but don't throw
      logger.error('Failed to send rejection email', emailError instanceof Error ? emailError : new Error(String(emailError)), {
        issueId: issue.id,
        candidateEmail: candidateInfo.email,
        positionTitle,
      });
      
      // Add comment noting the failure
      try {
        await addIssueComment(
          linearAccessToken,
          issue.id,
          `*Failed to send rejection email to ${candidateInfo.email}. Error: ${emailError instanceof Error ? emailError.message : 'Unknown error'}*`
        );
      } catch (commentError) {
        logger.error('Failed to add email failure comment', commentError instanceof Error ? commentError : new Error(String(commentError)), {
          issueId: issue.id,
        });
      }
    }
  } catch (error) {
    // Log error but don't throw - we don't want to block issue processing
    logger.error('Error in sendRejectionEmailIfEnabled', error instanceof Error ? error : new Error(String(error)), {
      issueId: issue.id,
      linearOrgId,
    });
  }
}

/**
 * Send screening invitation email if organization has AI screening benefit
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5
 */
async function sendScreeningInvitationIfEnabled(
  issue: Issue,
  project: Project,
  linearOrgId: string,
  linearOrgSlug: string,
  linearAccessToken: string
): Promise<void> {
  try {
    logger.info('Checking AI screening benefit for screening invitation', { 
      issueId: issue.id,
      linearOrgId,
    });
    
    // Check if organization has AI screening benefit (Requirement 5.3)
    const hasAIScreeningBenefit = await checkAIScreeningBenefit(linearOrgId);
    
    if (!hasAIScreeningBenefit) {
      logger.info('Organization does not have AI screening benefit, skipping screening invitation', {
        issueId: issue.id,
        linearOrgId,
      });
      return;
    }
    
    // Check if screening invitation already sent using label (idempotence)
    const labels = await issue.labels();
    const labelNames = labels.nodes.map(l => l.name);
    const screeningInvitationAlreadySent = labelNames.includes(STATE_LABELS.SCREENING_INVITATION_SENT);
    
    if (screeningInvitationAlreadySent) {
      logger.info('Screening invitation already sent (label present), skipping duplicate', {
        issueId: issue.id,
      });
      return;
    }
    
    // Extract candidate information from issue description
    const candidateInfo = extractCandidateInfo(issue.description || '');
    
    if (!candidateInfo) {
      logger.error('Could not extract candidate info from issue, skipping screening invitation', undefined, {
        issueId: issue.id,
      });
      return;
    }
    
    // Get position title from project (Requirement 5.4)
    const positionTitle = project.name || 'Position';
    
    // Get organization name from Linear org (Requirement 6.1)
    const team = await issue.team;
    if (!team) {
      logger.error('Issue team not found', undefined, { issueId: issue.id });
      return;
    }
    const organization = await team.organization;
    const organizationName = organization?.name || 'Our Team';
    
    // Get job description from project content (Requirement 6.3)
    const jobDescription = project.content || project.description || '';
    
    if (!jobDescription) {
      logger.error('Job description not found in project, skipping screening invitation', undefined, {
        issueId: issue.id,
        projectId: project.id,
      });
      return;
    }
    
    // Get candidate application from issue description (Requirement 6.2)
    const candidateApplication = issue.description || '';
    
    if (!candidateApplication) {
      logger.error('Candidate application not found in issue, skipping screening invitation', undefined, {
        issueId: issue.id,
      });
      return;
    }
    
    // Extract candidate's first name (Requirement 6.5)
    const candidateFirstName = candidateInfo.name.split(' ')[0] || candidateInfo.name;
    
    logger.info('Generating conversation pointers for screening', {
      issueId: issue.id,
      linearOrgId,
      jobDescriptionLength: jobDescription.length,
      candidateApplicationLength: candidateApplication.length,
    });
    
    // Generate conversation pointers using Cerebras (Requirement 6.4)
    let conversationPointers: string;
    try {
      const pointersResult = await generateConversationPointers(
        jobDescription,
        candidateApplication,
        linearOrgId
      );
      
      // Format pointers as a bulleted list
      conversationPointers = pointersResult.pointers
        .map((pointer, index) => `${index + 1}. ${pointer}`)
        .join('\n');
      
      logger.info('Conversation pointers generated successfully', {
        issueId: issue.id,
        pointerCount: pointersResult.pointers.length,
      });
    } catch (pointersError) {
      // Log error and notify administrators (Requirement 5.5)
      logger.error('Failed to generate conversation pointers', pointersError instanceof Error ? pointersError : new Error(String(pointersError)), {
        issueId: issue.id,
        linearOrgId,
      });
      
      // Add comment noting the failure
      try {
        await addIssueComment(
          linearAccessToken,
          issue.id,
          `*Failed to generate conversation pointers for AI screening. Error: ${pointersError instanceof Error ? pointersError.message : 'Unknown error'}*`
        );
      } catch (commentError) {
        logger.error('Failed to add conversation pointers failure comment', commentError instanceof Error ? commentError : new Error(String(commentError)), {
          issueId: issue.id,
        });
      }
      
      return;
    }
    
    logger.info('Creating secure screening session', {
      issueId: issue.id,
      candidateName: candidateFirstName,
      organizationName,
    });
    
    // Create secure screening session with secret (Requirements 6.1-6.5)
    let secret: string;
    try {
      secret = await createScreeningSession({
        linearOrg: linearOrgSlug,
        issueId: issue.id,
        candidateName: candidateInfo.name,
        candidateEmail: candidateInfo.email,
        companyName: organizationName,
        jobDescription,
        candidateApplication,
        conversationPointers,
      });
      
      // Construct the interview URL
      const sessionLink = `${config.app.url}/interview/${secret}`;
      
      logger.info('Screening session created successfully', {
        issueId: issue.id,
        secret: secret.substring(0, 8) + '...',
        sessionLink,
      });
    } catch (sessionError) {
      // Log error and notify administrators (Requirement 5.5)
      logger.error('Failed to create screening session', sessionError instanceof Error ? sessionError : new Error(String(sessionError)), {
        issueId: issue.id,
      });
      
      // Add comment noting the failure
      try {
        await addIssueComment(
          linearAccessToken,
          issue.id,
          `*Failed to create AI screening session. Error: ${sessionError instanceof Error ? sessionError.message : 'Unknown error'}*`
        );
      } catch (commentError) {
        logger.error('Failed to add session creation failure comment', commentError instanceof Error ? commentError : new Error(String(commentError)), {
          issueId: issue.id,
        });
      }
      
      return;
    }
    
    // Construct the interview URL
    const sessionLink = `${config.app.url}/interview/${secret}`;

    // Create comment FIRST to get comment ID for threading
    const commentBody = `*AI Screening invitation sent to ${candidateInfo.email}*\n\nThe candidate has been invited to complete an AI-powered screening interview.\n\nSecret: ${secret.substring(0, 8)}...\n\n---\n\nMessage-ID: pending`;

    const commentId = await addIssueComment(
      linearAccessToken,
      issue.id,
      commentBody
    );

    if (!commentId) {
      logger.error('Failed to create comment before sending screening invitation', undefined, { issueId: issue.id });
      return;
    }

    // Generate dynamic reply-to address WITH comment ID for threading
    const replyToAddress = generateReplyToAddress(linearOrgSlug, issue.id, commentId);

    // Get all comments for threading
    const issueComments = await issue.comments();
    const commentBodies = issueComments.nodes.map(c => c.body || '');

    // Extract threading information from previous comments
    const lastMessageId = getLastMessageId(commentBodies);
    const references = buildThreadReferences(commentBodies);

    logger.info('Sending screening invitation email', {
      issueId: issue.id,
      candidateEmail: candidateInfo.email,
      candidateName: candidateInfo.name,
      positionTitle,
      organizationName,
      replyToAddress,
      commentId,
      hasThreading: !!lastMessageId,
      referencesCount: references.length,
    });

    // Send screening invitation email (Requirement 5.1)
    try {
      const emailResult = await sendScreeningInvitationEmail({
        to: candidateInfo.email,
        candidateName: candidateInfo.name,
        organizationName,
        positionTitle,
        sessionLink,
        replyTo: replyToAddress,
        inReplyTo: lastMessageId || undefined,
        references: references.length > 0 ? references : undefined,
      });

      logger.info('Screening invitation email sent successfully', {
        issueId: issue.id,
        emailId: emailResult?.id,
        candidateEmail: candidateInfo.email,
        commentId,
        secret: secret.substring(0, 8) + '...',
      });

      // Get the client to add the label
      const client = createLinearClient(linearAccessToken);

      // Ensure "Screening-Invitation-Sent" label exists
      const screeningInvitationSentLabelId = await ensureLabel(client, STATE_LABELS.SCREENING_INVITATION_SENT);

      // Get current labels
      const currentLabels = await issue.labels();
      const currentLabelIds = currentLabels.nodes.map(l => l.id);

      // Add the "Screening-Invitation-Sent" label to mark idempotency
      await client.updateIssue(issue.id, {
        labelIds: [...currentLabelIds, screeningInvitationSentLabelId],
      });

      // Update comment with actual Message-ID
      const messageId = emailResult?.id || 'unknown';
      const updatedCommentBody = `*AI Screening invitation sent to ${candidateInfo.email}*\n\nThe candidate has been invited to complete an AI-powered screening interview.\n\nSecret: ${secret.substring(0, 8)}...\n\n---\n\nMessage-ID: ${messageId}`;

      await client.updateComment(commentId, {
        body: updatedCommentBody,
      });

      logger.info('Updated screening invitation comment with Message-ID and added label', {
        issueId: issue.id,
        messageId,
        commentId,
        secret: secret.substring(0, 8) + '...',
      });
    } catch (emailError) {
      // Handle email sending failures gracefully - log but don't throw
      logger.error('Failed to send screening invitation email', emailError instanceof Error ? emailError : new Error(String(emailError)), {
        issueId: issue.id,
        candidateEmail: candidateInfo.email,
        positionTitle,
      });
      
      // Add comment noting the failure
      try {
        await addIssueComment(
          linearAccessToken,
          issue.id,
          `*Failed to send AI screening invitation email to ${candidateInfo.email}. Error: ${emailError instanceof Error ? emailError.message : 'Unknown error'}*`
        );
      } catch (commentError) {
        logger.error('Failed to add email failure comment', commentError instanceof Error ? commentError : new Error(String(commentError)), {
          issueId: issue.id,
        });
      }
    }
  } catch (error) {
    // Log error but don't throw - we don't want to block issue processing
    logger.error('Error in sendScreeningInvitationIfEnabled', error instanceof Error ? error : new Error(String(error)), {
      issueId: issue.id,
      linearOrgId,
    });
  }
}

/**
 * Ensure a label exists and return its ID
 * Creates the label if it doesn't exist
 */
async function ensureLabel(
  client: ReturnType<typeof createLinearClient>,
  labelName: string
): Promise<string> {
  try {
    // Get or create the label
    const issueLabels = await client.issueLabels();
    let label = issueLabels.nodes.find((l) => l.name === labelName);
    
    if (!label) {
      // Create the label if it doesn't exist
      const createResult = await client.createIssueLabel({
        name: labelName,
        color: '#5E6AD2', // Linear purple
      });
      
      if (createResult.success && createResult.issueLabel) {
        label = await createResult.issueLabel;
      }
    }
    
    if (!label) {
      throw new Error(`Failed to ensure label: ${labelName}`);
    }
    
    return label.id;
  } catch (error) {
    logger.error('Error ensuring label', error instanceof Error ? error : new Error(String(error)), {
      labelName,
    });
    throw error;
  }
}

/**
 * Ensure a workflow state exists and return its ID
 * Creates the state if it doesn't exist, with fallback to Todo
 */
async function ensureState(
  client: ReturnType<typeof createLinearClient>,
  teamId: string,
  stateName: string,
  fallbackStateName: string = STATE_STATUSES.TODO
): Promise<string | null> {
  try {
    const team = await client.team(teamId);
    const states = await team.states();

    let state = states.nodes.find((s) => s.name === stateName);

    if (!state) {
      logger.info('State not found, attempting to create', { teamId, stateName });

      const stateDetails = STATE_STATUS_DETAILS[stateName];

      if (!stateDetails) {
        logger.warn('No state details found for state name', { stateName });
        const fallbackState = states.nodes.find((s) => s.name === fallbackStateName);
        return fallbackState?.id || null;
      }

      try {
        const createResult = await client.createWorkflowState({
          teamId,
          name: stateName,
          type: stateDetails.type,
          color: stateDetails.color,
          description: stateDetails.description,
        });

        if (createResult.success && createResult.workflowState) {
          state = await createResult.workflowState;
          logger.info('State created successfully', { stateName, stateId: state.id });
        }
      } catch (createError) {
        logger.error('Failed to create state, using fallback', createError instanceof Error ? createError : new Error(String(createError)), {
          stateName,
          fallbackStateName,
        });

        const fallbackState = states.nodes.find((s) => s.name === fallbackStateName);
        return fallbackState?.id || null;
      }
    }

    return state?.id || null;
  } catch (error) {
    logger.error('Error ensuring state', error instanceof Error ? error : new Error(String(error)), {
      teamId,
      stateName,
    });
    return null;
  }
}

/**
 * Extract candidate information from issue description
 */
function extractCandidateInfo(issueDescription: string): { name: string; email: string } | null {
  return extractCandidateInfoFromMetadata(issueDescription);
}
