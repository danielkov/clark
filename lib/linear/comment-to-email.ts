/**
 * Comment-to-Email Handler
 * 
 * Handles the conversion of Linear Issue comments to emails sent to candidates.
 * Implements the comment-to-email flow with proper threading and benefit checks.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { createLinearClient } from './client';
import { checkEmailCommunicationBenefit } from '@/lib/polar/benefits';
import { sendCommentEmail } from '@/lib/resend/templates';
import { 
  generateReplyToAddress, 
  getLastMessageId, 
  buildThreadReferences 
} from '@/lib/resend/email-threading';
import { addIssueComment } from './state-management';
import { withRetry, isRetryableError } from '../utils/retry';
import { logger } from '@/lib/datadog/logger';

/**
 * Check if a comment is a system message
 * 
 * System messages are identified by:
 * - Comments created by the bot user ("Clark (bot)")
 * - Comments containing system metadata (Message-ID footer)
 * - Comments with system formatting (starting with *)
 * 
 * @param commentBody - The comment body text
 * @param userId - The user ID who created the comment (if available)
 * @returns True if the comment is a system message
 */
function isSystemComment(commentBody: string, userId?: string): boolean {
  // Check if comment contains Message-ID footer (indicates it's from an email reply)
  if (commentBody.includes('Message-ID:')) {
    return true;
  }
  
  // Check if comment starts with system formatting (italic text with *)
  // System messages typically start with "*" like "*Confirmation email sent*"
  const trimmedBody = commentBody.trim();
  if (trimmedBody.startsWith('*') && trimmedBody.includes('*', 1)) {
    return true;
  }
  
  // Check if comment contains system markers
  const systemMarkers = [
    'This candidate was automatically added',
    'AI Pre-screening Result',
    'Confirmation email sent',
    'Failed to send confirmation email',
    'Comment email sent',
  ];
  
  if (systemMarkers.some(marker => commentBody.includes(marker))) {
    return true;
  }
  
  return false;
}

/**
 * Extract candidate email from issue description
 * 
 * The issue description contains the candidate's application data,
 * including their email address.
 * 
 * @param issueDescription - The issue description text
 * @returns Candidate email or null if not found
 */
function extractCandidateEmail(issueDescription: string): string | null {
  // Look for email in the format "Email: email@example.com"
  const emailMatch = issueDescription.match(/Email:\s*([^\s\n]+@[^\s\n]+)/i);
  
  if (emailMatch && emailMatch[1]) {
    return emailMatch[1].trim();
  }
  
  // Fallback: look for any email-like pattern
  const genericEmailMatch = issueDescription.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  
  if (genericEmailMatch && genericEmailMatch[1]) {
    return genericEmailMatch[1].trim();
  }
  
  return null;
}

/**
 * Extract candidate name from issue description
 * 
 * @param issueDescription - The issue description text
 * @returns Candidate name or "Candidate" as fallback
 */
function extractCandidateName(issueDescription: string): string {
  // Look for name in the format "Name: John Doe"
  const nameMatch = issueDescription.match(/Name:\s*([^\n]+)/i);
  
  if (nameMatch && nameMatch[1]) {
    return nameMatch[1].trim();
  }
  
  // Fallback to generic name
  return 'Candidate';
}

/**
 * Handle comment-to-email conversion
 * 
 * This function:
 * 1. Fetches the comment and issue details
 * 2. Checks if the comment is from a user (not system)
 * 3. Verifies the organization has email communication benefit
 * 4. Extracts threading information from previous comments
 * 5. Sends the comment as an email to the candidate
 * 6. Adds a note to the issue documenting the email sent
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 * 
 * @param linearAccessToken - Linear API access token
 * @param commentId - Linear Comment ID
 * @param issueId - Linear Issue ID
 * @param atsContainerInitiativeId - ATS Container Initiative ID
 * @param linearOrgId - Linear organization UUID (for Polar integration)
 * @param linearOrgSlug - Linear organization slug/urlKey (for email threading)
 */
export async function handleCommentToEmail(
  linearAccessToken: string,
  commentId: string,
  issueId: string,
  atsContainerInitiativeId: string,
  linearOrgId: string,
  linearOrgSlug: string
): Promise<void> {
  const client = createLinearClient(linearAccessToken);
  
  try {
    // Fetch the comment
    const comment = await withRetry(
      () => client.comment({ id: commentId }),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );
    
    if (!comment) {
      logger.error('Comment not found', undefined, { commentId });
      return;
    }
    
    // Get comment details
    const commentBody = comment.body || '';
    const commentUser = await comment.user;
    const commentUserId = commentUser?.id;
    const commentUserName = commentUser?.name || 'Team Member';
    
    logger.info('Processing comment', {
      commentId,
      issueId,
      userId: commentUserId,
      userName: commentUserName,
      bodyPreview: commentBody.substring(0, 100),
    });
    
    // Check if this is a system comment (Requirement 2.2)
    if (isSystemComment(commentBody, commentUserId)) {
      logger.info('Skipping system comment', {
        commentId,
        issueId,
        reason: 'System message detected',
      });
      return;
    }
    
    // Fetch the issue
    const issue = await withRetry(
      () => client.issue(issueId),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );
    
    if (!issue) {
      logger.error('Issue not found', undefined, { issueId });
      return;
    }
    
    // Get the project to verify it belongs to ATS Container
    const project = await issue.project;
    
    if (!project) {
      logger.info('Issue has no associated project, skipping comment-to-email', { issueId });
      return;
    }
    
    // Verify the Project belongs to the ATS Container Initiative
    const projectInitiatives = await project.initiatives();
    const belongsToAtsContainer = projectInitiatives.nodes.some(
      (initiative) => initiative.id === atsContainerInitiativeId
    );

    if (!belongsToAtsContainer) {
      logger.info('Project does not belong to ATS Container Initiative, skipping comment-to-email', { issueId });
      return;
    }
    
    // Check email communication benefit (Requirement 2.4)
    const hasEmailBenefit = await checkEmailCommunicationBenefit(linearOrgId);
    
    if (!hasEmailBenefit) {
      logger.info('Organization does not have email communication benefit, skipping comment-to-email', {
        issueId,
        linearOrgId,
      });
      return;
    }
    
    // Extract candidate information from issue
    const issueDescription = issue.description || '';
    const candidateEmail = extractCandidateEmail(issueDescription);
    
    if (!candidateEmail) {
      logger.error('Could not extract candidate email from issue', undefined, {
        issueId,
        descriptionPreview: issueDescription.substring(0, 100),
      });
      return;
    }
    
    const candidateName = extractCandidateName(issueDescription);
    const positionTitle = project.name;
    
    // Generate reply-to address for threading
    const replyToAddress = generateReplyToAddress(linearOrgSlug, issue.id);
    
    // Get all comments for threading
    const issueComments = await issue.comments();
    const commentBodies = issueComments.nodes.map(c => c.body || '');
    
    // Extract threading information
    const lastMessageId = getLastMessageId(commentBodies);
    const references = buildThreadReferences(commentBodies);
    
    logger.info('Sending comment as email', {
      commentId,
      issueId,
      candidateEmail,
      candidateName,
      positionTitle,
      hasThreading: !!lastMessageId,
      referencesCount: references.length,
    });
    
    // Send comment as email (Requirement 2.1)
    try {
      const emailResult = await sendCommentEmail({
        to: candidateEmail,
        candidateName,
        positionTitle,
        commenterName: commentUserName,
        commentBody,
        replyTo: replyToAddress,
        inReplyTo: lastMessageId || undefined,
        references: references.length > 0 ? references : undefined,
      });
      
      // Add note to Linear Issue documenting email sent (Requirement 2.3)
      const messageId = emailResult?.id || 'unknown';
      const noteBody = `*Comment email sent to ${candidateEmail} by ${commentUserName}*\n\n---\n\nMessage-ID: ${messageId}`;
      
      await addIssueComment(
        linearAccessToken,
        issue.id,
        noteBody
      );
      
      logger.info('Comment email sent and documented', {
        commentId,
        issueId,
        emailId: messageId,
        candidateEmail,
      });
    } catch (emailError) {
      // Log error but don't throw - we want the webhook to succeed
      logger.error('Failed to send comment email', emailError instanceof Error ? emailError : new Error(String(emailError)), {
        commentId,
        issueId,
        candidateEmail,
      });
      
      // Add comment noting the failure
      try {
        await addIssueComment(
          linearAccessToken,
          issue.id,
          `*Failed to send comment email to ${candidateEmail}. Error: ${emailError instanceof Error ? emailError.message : 'Unknown error'}*`
        );
      } catch (commentError) {
        logger.error('Failed to add email failure comment', commentError instanceof Error ? commentError : new Error(String(commentError)), {
          commentId,
          issueId,
        });
      }
    }
  } catch (error) {
    logger.error('Error in comment-to-email handler', error instanceof Error ? error : new Error(String(error)), {
      commentId,
      issueId,
    });
    throw error;
  }
}
