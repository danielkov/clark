/**
 * Linear Issue State Management
 * 
 * Handles state transitions for candidate Issues based on AI screening results
 * Requirements: 4.3, 4.4, 4.5, 4.6
 */

import { createLinearClient } from './client';
import { ScreeningResult } from '@/types';
import { WorkflowState } from '@linear/sdk';
import { withRetry, isRetryableError } from '../utils/retry';

/**
 * Determine the appropriate Issue state based on AI screening result
 * 
 * @param screeningResult The AI screening result
 * @returns The target state name
 */
export function determineIssueState(screeningResult: ScreeningResult): string {
  return screeningResult.recommendedState;
}

/**
 * Ensure a workflow state exists in a team, creating it if necessary
 * 
 * @param linearAccessToken Linear access token for the organization
 * @param teamId The ID of the team
 * @param stateName The name of the state to ensure exists
 * @returns The workflow state (existing or newly created)
 */
export async function ensureIssueState(
  linearAccessToken: string,
  teamId: string,
  stateName: string
): Promise<WorkflowState | null> {
  try {
    const client = createLinearClient(linearAccessToken);
    
    // Get the team
    const team = await client.team(teamId);
    
    if (!team) {
      console.error('Team not found:', teamId);
      return null;
    }
    
    // Get all workflow states for the team
    const workflowStates = await team.states();
    
    // Check if the state already exists (case-insensitive)
    const existingState = workflowStates.nodes.find(
      (state) => state.name.toLowerCase() === stateName.toLowerCase()
    );
    
    if (existingState) {
      console.log(`Workflow state "${stateName}" already exists for team ${team.name}`);
      return existingState;
    }
    
    // State doesn't exist, create it
    console.log(`Creating workflow state "${stateName}" for team ${team.name}`);
    
    // Determine the state type and color based on the name
    // Common patterns: "Triage", "In Progress", "Done", "Rejected", etc.
    const lowerName = stateName.toLowerCase();
    let stateType: 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled' = 'unstarted';
    let stateColor = '#bec2c8'; // Default gray color
    
    if (lowerName.includes('triage')) {
      stateType = 'triage';
      stateColor = '#f2c94c'; // Yellow for triage
    } else if (lowerName.includes('backlog')) {
      stateType = 'backlog';
      stateColor = '#95a2b3'; // Gray for backlog
    } else if (lowerName.includes('progress') || lowerName.includes('review') || lowerName.includes('interview')) {
      stateType = 'started';
      stateColor = '#5e6ad2'; // Blue for in progress
    } else if (lowerName.includes('done') || lowerName.includes('hired') || lowerName.includes('accepted')) {
      stateType = 'completed';
      stateColor = '#5e6ad2'; // Green for completed
    } else if (lowerName.includes('reject') || lowerName.includes('declined') || lowerName.includes('closed')) {
      stateType = 'canceled';
      stateColor = '#95a2b3'; // Gray for canceled
    }
    
    // Create the workflow state
    const createPayload = await client.createWorkflowState({
      teamId,
      name: stateName,
      type: stateType,
      color: stateColor,
    });
    
    if (!createPayload.success || !createPayload.workflowState) {
      console.error('Failed to create workflow state:', createPayload);
      return null;
    }
    
    const newState = await createPayload.workflowState;
    console.log(`Successfully created workflow state "${stateName}" with type "${stateType}"`);
    
    return newState;
  } catch (error) {
    console.error('Error ensuring workflow state:', error);
    return null;
  }
}

/**
 * Update a Linear Issue to a new workflow state
 * 
 * @param linearAccessToken Linear access token for the organization
 * @param issueId The ID of the Issue to update
 * @param targetStateName The name of the target workflow state
 * @returns True if the state was updated successfully
 */
export async function updateIssueState(
  linearAccessToken: string,
  issueId: string,
  targetStateName: string
): Promise<boolean> {
  try {
    // Create Linear client
    const client = createLinearClient(linearAccessToken);
    
    // Fetch the Issue with retry logic
    const issue = await withRetry(
      () => client.issue(issueId),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );
    
    if (!issue) {
      console.error('Issue not found:', issueId);
      return false;
    }
    
    // Get the team from the Issue
    const team = await issue.team;
    
    if (!team) {
      console.error('Issue has no associated team');
      return false;
    }
    
    // Ensure the target state exists (create if necessary)
    const targetState = await ensureIssueState(
      linearAccessToken,
      team.id,
      targetStateName
    );
    
    if (!targetState) {
      console.error(`Failed to ensure workflow state "${targetStateName}" exists for team ${team.name}`);
      return false;
    }
    
    // Get current state to check if update is needed
    const currentState = await issue.state;
    
    if (currentState?.id === targetState.id) {
      console.log(`Issue ${issueId} is already in state "${targetStateName}"`);
      return true; // Already in target state, consider it successful
    }
    
    // Update the Issue state with retry logic
    const updatePayload = await withRetry(
      () => client.updateIssue(issueId, {
        stateId: targetState.id,
      }),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );
    
    if (!updatePayload.success) {
      console.error('Failed to update Issue state:', updatePayload);
      return false;
    }
    
    console.log(`Successfully updated Issue ${issueId} to state "${targetStateName}"`);
    return true;
  } catch (error) {
    console.error('Error updating Issue state:', error);
    return false;
  }
}

/**
 * Generate a formatted comment explaining AI screening reasoning
 * 
 * @param screeningResult The AI screening result
 * @returns Formatted markdown comment text
 */
export function generateReasoningComment(screeningResult: ScreeningResult): string {
  const { confidence, reasoning, matchedCriteria, concerns } = screeningResult;
  
  // Build the comment with markdown formatting
  let comment = `## 🤖 AI Pre-screening Result\n\n`;
  comment += `**Confidence Level:** ${confidence.toUpperCase()}\n\n`;
  comment += `**Assessment:** ${reasoning}\n\n`;
  
  // Add matched criteria if any
  if (matchedCriteria.length > 0) {
    comment += `### ✅ Matched Criteria\n\n`;
    matchedCriteria.forEach((criterion) => {
      comment += `- ${criterion}\n`;
    });
    comment += `\n`;
  }
  
  // Add concerns if any
  if (concerns.length > 0) {
    comment += `### ⚠️ Concerns\n\n`;
    concerns.forEach((concern) => {
      comment += `- ${concern}\n`;
    });
    comment += `\n`;
  }
  
  comment += `---\n`;
  comment += `*This assessment was generated automatically by the AI pre-screening agent.*`;
  
  return comment;
}

/**
 * Add a comment to a Linear Issue
 * 
 * @param linearAccessToken Linear access token for the organization
 * @param issueId The ID of the Issue to comment on
 * @param commentBody The comment text (supports markdown)
 * @returns True if the comment was added successfully
 */
export async function addIssueComment(
  linearAccessToken: string,
  issueId: string,
  commentBody: string
): Promise<boolean> {
  try {
    // Create Linear client
    const client = createLinearClient(linearAccessToken);
    
    // Create the comment with retry logic
    const commentPayload = await withRetry(
      () => client.createComment({
        issueId,
        body: commentBody,
        createAsUser: "Hiring Team (bot)",
      }),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );
    
    if (!commentPayload.success) {
      console.error('Failed to create comment:', commentPayload);
      return false;
    }
    
    console.log(`Successfully added comment to Issue ${issueId}`);
    return true;
  } catch (error) {
    console.error('Error adding Issue comment:', error);
    return false;
  }
}
