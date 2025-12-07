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
import { withRetry, isRetryableError } from '../utils/retry';
import { logger } from '@/lib/datadog/logger';

/**
 * State machine labels
 */
export const STATE_LABELS = {
  NEW: 'New',
  PROCESSED: 'Processed',
  PRE_SCREENED: 'Pre-screened',
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
 */
export async function handleIssueUpdate(
  linearAccessToken: string,
  issueId: string,
  atsContainerInitiativeId: string,
  linearOrgId: string
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
  
  // Transition 1: New → Process CV/Cover Letter
  if (stateName === STATE_STATUSES.TODO && labelNames.includes(STATE_LABELS.NEW)) {
    await processDocuments(client, issue, linearOrgId, linearAccessToken);
    return;
  }
  
  // Transition 2: Processed → Run Screening
  if (stateName === STATE_STATUSES.TODO && labelNames.includes(STATE_LABELS.PROCESSED)) {
    await runScreening(client, issue, project, linearOrgId, linearAccessToken);
    return;
  }
}

/**
 * Process CV and cover letter documents
 * Extracts text from attachments and updates issue description
 * CRITICAL: Only performs ONE update operation to avoid infinite webhook loops
 */
async function processDocuments(
  client: ReturnType<typeof createLinearClient>,
  issue: any,
  _linearOrgId: string,
  _linearAccessToken: string
): Promise<void> {
  try {
    logger.info('Processing documents for issue', { issueId: issue.id });
    
    // Get attachments
    const attachments = await issue.attachments();
    
    // Find CV and cover letter attachments
    const cvAttachment = attachments?.nodes.find((a: any) => 
      a.title?.toLowerCase().includes('cv') || a.title?.toLowerCase().includes('resume')
    );
    
    const coverLetterAttachment = attachments?.nodes.find((a: any) => 
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
      .filter((l: any) => l.name !== STATE_LABELS.NEW)
      .map((l: any) => l.id);
    
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
  issue: any,
  project: any,
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
      const states = await team.states();
      const triageState = states.nodes.find((s: any) => s.name === STATE_STATUSES.TRIAGE);
      
      if (!triageState) {
        logger.error('Triage state not found', undefined, { issueId: issue.id });
        return;
      }
      
      // Get current labels and prepare new label set
      const labels = await issue.labels();
      const currentLabelIds = labels.nodes
        .filter((l: any) => l.name !== STATE_LABELS.PROCESSED)
        .map((l: any) => l.id);
      
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
      const states = await team.states();
      const triageState = states.nodes.find((s: any) => s.name === STATE_STATUSES.TRIAGE);
      
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
    const states = await team.states();
    const targetStateObj = states.nodes.find((s: any) => s.name === newStatusName);
    
    if (!targetStateObj) {
      logger.error('Target state not found', undefined, { issueId: issue.id, newStatusName });
      return;
    }
    
    // Get current labels and prepare new label set
    const labels = await issue.labels();
    const currentLabelIds = labels.nodes
      .filter((l: any) => l.name !== STATE_LABELS.PROCESSED)
      .map((l: any) => l.id);
    
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
      const states = await team.states();
      const triageState = states.nodes.find((s: any) => s.name === STATE_STATUSES.TRIAGE);
      
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
    let label = issueLabels.nodes.find((l: any) => l.name === labelName);
    
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
