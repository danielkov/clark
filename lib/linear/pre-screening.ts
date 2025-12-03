/**
 * AI Pre-screening Workflow
 * 
 * Handles triggering and managing AI pre-screening for candidate Issues
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { createLinearClient } from './client';
import { screenCandidate } from '../cerebras/candidate-screening';
import { ScreeningResult } from '@/types';
import { 
  determineIssueState, 
  updateIssueState, 
  generateReasoningComment, 
  addIssueComment 
} from './state-management';
import { withRetry, isRetryableError } from '../utils/retry';

/**
 * Trigger AI pre-screening for a newly created candidate Issue
 * 
 * @param linearAccessToken Linear access token for the organization
 * @param issueId The ID of the candidate Issue
 * @param atsContainerInitiativeId The ID of the ATS Container Initiative
 * @param linearOrgId Linear organization ID for usage tracking
 * @returns Screening result or null if screening was not triggered
 */
export async function triggerPreScreening(
  linearAccessToken: string,
  issueId: string,
  atsContainerInitiativeId: string,
  linearOrgId: string
): Promise<ScreeningResult | null> {
  try {
    // Create Linear client
    const client = createLinearClient(linearAccessToken);
    
    // Fetch the Issue
    const issue = await client.issue(issueId);
    
    if (!issue) {
      console.error('Issue not found:', issueId);
      return null;
    }
    
    // Get the Project associated with this Issue
    const project = await issue.project;
    
    if (!project) {
      console.log('Issue has no associated project, skipping pre-screening');
      return null;
    }
    
    // Verify the Project belongs to the ATS Container Initiative
    const projectInitiatives = await project.initiatives();
    const belongsToAtsContainer = projectInitiatives.nodes.some(
      (initiative) => initiative.id === atsContainerInitiativeId
    );
    
    if (!belongsToAtsContainer) {
      console.log('Project does not belong to ATS Container Initiative, skipping pre-screening');
      return null;
    }
    
    // Check if the Project has "In Progress" status
    const projectStatus = await project.status;
    
    if (projectStatus?.name !== 'In Progress') {
      console.log('Project is not "In Progress", skipping pre-screening');
      return null;
    }
    
    // Get the Issue description (contains parsed CV text)
    const issueDescription = issue.description || '';
    
    if (!issueDescription) {
      console.error('Issue has no description, cannot perform pre-screening');
      return null;
    }
    
    // Get the Job Description from the Project
    const jobDescription = project.content || project.description || '';
    
    if (!jobDescription) {
      console.error('Project has no content/description, cannot perform pre-screening');
      return null;
    }
    
    console.log('Triggering AI pre-screening for Issue:', issueId);
    
    // Call the AI screening function with retry logic
    const screeningResult = await withRetry(
      () => screenCandidate(issueDescription, jobDescription, linearOrgId, {
        userId: 'webhook',
        resourceId: issueId,
      }),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );
    
    console.log('Pre-screening completed:', {
      issueId,
      confidence: screeningResult.confidence,
      recommendedState: screeningResult.recommendedState,
    });
    
    // Determine the target state based on screening result
    const targetState = determineIssueState(screeningResult);
    
    // Update the Issue state
    const stateUpdated = await updateIssueState(
      linearAccessToken,
      issueId,
      targetState
    );
    
    if (!stateUpdated) {
      console.error('Failed to update Issue state after pre-screening');
    }
    
    // Generate and add AI reasoning comment
    const reasoningComment = generateReasoningComment(screeningResult);
    const commentAdded = await addIssueComment(
      linearAccessToken,
      issueId,
      reasoningComment
    );
    
    if (!commentAdded) {
      console.error('Failed to add reasoning comment to Issue');
    }
    
    return screeningResult;
  } catch (error) {
    console.error('Error in triggerPreScreening:', error);
    
    // Return fallback result on error
    return {
      confidence: 'ambiguous',
      reasoning: 'Pre-screening failed due to system error. Manual review required.',
      matchedCriteria: [],
      concerns: ['System error during pre-screening'],
      recommendedState: 'Triage',
    };
  }
}
