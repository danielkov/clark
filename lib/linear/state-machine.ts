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
import { checkEmailCommunicationBenefit } from '@/lib/polar/benefits';
import { sendConfirmationEmail, sendRejectionEmail } from '@/lib/resend/templates';
import { 
  generateReplyToAddress, 
  getLastMessageId, 
  buildThreadReferences 
} from '@/lib/resend/email-threading';
import { withRetry, isRetryableError } from '../utils/retry';
import { logger } from '@/lib/datadog/logger';
import { Issue, Project } from '@linear/sdk';

/**
 * State machine labels
 */
export const STATE_LABELS = {
  NEW: 'New',
  PROCESSED: 'Processed',
  PRE_SCREENED: 'Pre-screened',
  REJECTION_EMAIL_SENT: 'Rejection-Email-Sent',
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
  
  // Transition 2: Declined → Send Rejection Email (if benefit exists)
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
    });
    
    // Check if organization has email communication benefit
    const hasEmailBenefit = await checkEmailCommunicationBenefit(linearOrgId);
    
    if (!hasEmailBenefit) {
      logger.info('Organization does not have email communication benefit, skipping confirmation email', {
        issueId: issue.id,
        linearOrgId,
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
    
    // Generate dynamic reply-to address using organization slug (not ID)
    const replyToAddress = generateReplyToAddress(linearOrgSlug, issue.id);
    
    logger.info('Sending confirmation email', {
      issueId: issue.id,
      candidateEmail: candidateInfo.email,
      candidateName: candidateInfo.name,
      positionTitle,
      organizationName,
      replyToAddress,
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
      });
      
      // Add comment to Linear Issue documenting the email sent
      // Include Message-ID for future threading
      const messageId = emailResult?.id || 'unknown';
      const commentBody = `*Confirmation email sent to ${candidateInfo.email}*\n\nReplies to this email will be added as comments to this issue.\n\n---\n\nMessage-ID: ${messageId}`;
      
      await addIssueComment(
        linearAccessToken,
        issue.id,
        commentBody
      );
      
      logger.info('Added confirmation email comment to issue', {
        issueId: issue.id,
        messageId,
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
      
      // Get team and find Triage state
      const team = await issue.team;
      if (!team) {
        logger.error('Issue team not found', undefined, { issueId: issue.id });
        return;
      }
      const states = await team.states();
      const triageState = states.nodes.find((s) => s.name === STATE_STATUSES.TRIAGE);
      
      if (!triageState) {
        logger.error('Triage state not found', undefined, { issueId: issue.id });
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
        stateId: triageState.id,
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
      
      // Get team and find Triage state
      const team = await issue.team;
      if (!team) {
        logger.error('Issue team not found', undefined, { issueId: issue.id });
        return;
      }
      const states = await team.states();
      const triageState = states.nodes.find((s) => s.name === STATE_STATUSES.TRIAGE);
      
      if (triageState) {
        // SINGLE UPDATE: Just update state
        await client.updateIssue(issue.id, {
          stateId: triageState.id,
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
    
    // Get team and find target state
    const team = await issue.team;
    if (!team) {
      logger.error('Issue team not found', undefined, { issueId: issue.id });
      return;
    }
    const states = await team.states();
    const targetStateObj = states.nodes.find((s) => s.name === newStatusName);
    
    if (!targetStateObj) {
      logger.error('Target state not found', undefined, { issueId: issue.id, newStatusName });
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
      const states = await team.states();
      const triageState = states.nodes.find((s) => s.name === STATE_STATUSES.TRIAGE);
      
      if (triageState) {
        // SINGLE UPDATE: Just update state
        await client.updateIssue(issue.id, {
          stateId: triageState.id,
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
    
    // Generate dynamic reply-to address using organization slug
    const replyToAddress = generateReplyToAddress(linearOrgSlug, issue.id);
    
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
      
      // Add comment to Linear Issue documenting the rejection email (Requirement 4.2)
      // Include Message-ID for future threading
      const messageId = emailResult?.id || 'unknown';
      const commentBody = `*Rejection email sent to ${candidateInfo.email}*\n\nThis candidate has been notified of the decision.\n\n---\n\nMessage-ID: ${messageId}`;
      
      await addIssueComment(
        linearAccessToken,
        issue.id,
        commentBody
      );
      
      logger.info('Added rejection email comment and label to issue', {
        issueId: issue.id,
        messageId,
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
 * Extract candidate information from issue description
 * Parses the structured description to get name and email
 */
function extractCandidateInfo(issueDescription: string): { name: string; email: string } | null {
  try {
    // Parse the issue description which has format:
    // # Candidate Application
    // **Name:** John Doe
    // **Email:** john@example.com
    
    const nameMatch = issueDescription.match(/\*\*Name:\*\*\s*(.+)/);
    const emailMatch = issueDescription.match(/\*\*Email:\*\*\s*(.+)/);
    
    if (!nameMatch || !emailMatch) {
      logger.warn('Could not extract candidate info from issue description', {
        hasNameMatch: !!nameMatch,
        hasEmailMatch: !!emailMatch,
      });
      return null;
    }
    
    return {
      name: nameMatch[1].trim(),
      email: emailMatch[1].trim(),
    };
  } catch (error) {
    logger.error('Error extracting candidate info', error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}
