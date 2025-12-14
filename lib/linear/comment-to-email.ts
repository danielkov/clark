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
import { addIssueComment, addThreadedComment, addCommentReaction } from './state-management';
import { withRetry, isRetryableError } from '../utils/retry';
import { logger } from '@/lib/datadog/logger';
import { extractCandidateMetadata } from './candidate-metadata';

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
 * Extract candidate metadata (name and email) from issue description with fallback parsing
 * 
 * @param issueDescription - The issue description text
 * @returns Object with name and email (email can be null if not found)
 */
function extractCandidateMetadataWithFallback(issueDescription: string): { name: string; email: string | null } {
  // First try to extract from metadata
  const metadata = extractCandidateMetadata(issueDescription);
  if (metadata && metadata.name && metadata.email) {
    return metadata;
  }
  
  // Fallback to parsing markdown for backward compatibility
  let name = 'Candidate';
  let email: string | null = null;
  
  // Extract name if not found in metadata
  if (!metadata?.name) {
    const nameMatch = issueDescription.match(/Name:\s*([^\n]+)/i);
    if (nameMatch && nameMatch[1]) {
      name = nameMatch[1].trim();
    }
  } else {
    name = metadata.name;
  }
  
  // Extract email if not found in metadata
  if (!metadata?.email) {
    const emailMatch = issueDescription.match(/\*?\*?Email:\*?\*?\s*([^\s\n]+)/i);
    
    if (emailMatch && emailMatch[1]) {
      let emailCandidate = emailMatch[1].trim();
      
      // Handle markdown link format: [email@example.com](mailto:email@example.com)
      const markdownLinkMatch = emailCandidate.match(/\[([^\]]+@[^\]]+)\]/);
      if (markdownLinkMatch) {
        emailCandidate = markdownLinkMatch[1];
      }
      
      // Validate it's a proper email format
      const emailPatternMatch = emailCandidate.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailPatternMatch) {
        email = emailPatternMatch[1];
      }
    }
    
    // Fallback: look for any email-like pattern in the entire description
    if (!email) {
      const genericEmailMatch = issueDescription.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (genericEmailMatch && genericEmailMatch[1]) {
        email = genericEmailMatch[1].trim();
      }
    }
  } else {
    email = metadata.email;
  }
  
  return { name, email };
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
    const organization = await client.organization;
    const organizationName = organization?.name || 'Our Team';
    
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

    // Check if comment is a threaded reply (has a parent)
    const parentCommentId = comment.parentId;

    if (!parentCommentId) {
      logger.info('Comment is not a threaded reply, skipping comment-to-email', {
        commentId,
        issueId,
      });
      return;
    }

    logger.info('Comment is a threaded reply, checking parent', {
      commentId,
      issueId,
      parentCommentId,
    });

    // Fetch the parent comment to verify it's a system email comment
    let parentComment;
    try {
      parentComment = await withRetry(
        () => client.comment({ id: parentCommentId }),
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
          shouldRetry: isRetryableError,
        }
      );

      if (!parentComment) {
        logger.error('Parent comment not found', undefined, { parentCommentId, commentId, issueId });
        return;
      }
    } catch (error) {
      logger.error('Error fetching parent comment', error instanceof Error ? error : new Error(String(error)), {
        parentCommentId,
        commentId,
        issueId,
      });
      return;
    }

    const parentCommentBody = parentComment.body || '';
    const parentBotActor = await parentComment.botActor;

    const isFromOurBot = parentBotActor?.name === 'Clark (bot)';
    const isEmailSystemComment =
      parentCommentBody.includes('*Confirmation email sent') ||
      parentCommentBody.includes('*Rejection email sent') ||
      parentCommentBody.includes('*AI Screening invitation sent');

    const isSystemEmailComment = isFromOurBot && isEmailSystemComment;

    if (!isSystemEmailComment) {
      logger.info('Parent comment is not a system email comment from our bot, skipping comment-to-email', {
        commentId,
        issueId,
        parentCommentId,
        botActorName: parentBotActor?.name,
        isFromOurBot,
        isEmailSystemComment,
        parentBodyPreview: parentCommentBody.substring(0, 100),
      });
      return;
    }

    logger.info('Parent comment is a system email comment from our bot, proceeding with comment-to-email', {
      commentId,
      issueId,
      parentCommentId,
      botActorName: parentBotActor.name,
    });

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
    const { name: candidateName, email: candidateEmail } = extractCandidateMetadataWithFallback(issueDescription);
    
    if (!candidateEmail) {
      logger.error('Could not extract candidate email from issue', undefined, {
        issueId,
        descriptionPreview: issueDescription.substring(0, 100),
      });
      return;
    }
    const positionTitle = project.name;

    // Generate reply-to address using PARENT comment ID for proper threading
    const replyToAddress = generateReplyToAddress(linearOrgSlug, issue.id, parentCommentId);

    // Get all comments for threading
    const issueComments = await issue.comments();
    const commentBodies = issueComments.nodes.map(c => c.body || '');

    // Extract threading information
    const lastMessageId = getLastMessageId(commentBodies);
    const references = buildThreadReferences(commentBodies);

    logger.info('Sending comment as email', {
      commentId,
      issueId,
      parentCommentId,
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
        organizationName,
      });

      const messageId = emailResult?.id || 'unknown';

      // Add ✉️ reaction to indicate email was sent successfully
      const reactionAdded = await addCommentReaction(
        linearAccessToken,
        commentId,
        '✉️'
      );

      if (!reactionAdded) {
        logger.warn('Failed to add success reaction to comment', {
          commentId,
          issueId,
        });
      }

      logger.info('Comment email sent and reaction added', {
        commentId,
        issueId,
        parentCommentId,
        emailId: messageId,
        candidateEmail,
        reactionAdded,
      });
    } catch (emailError) {
      // Log error but don't throw - we want the webhook to succeed
      logger.error('Failed to send comment email', emailError instanceof Error ? emailError : new Error(String(emailError)), {
        commentId,
        issueId,
        parentCommentId,
        candidateEmail,
      });

      // Add ❌ reaction to indicate failure
      const errorReactionAdded = await addCommentReaction(
        linearAccessToken,
        commentId,
        '❌'
      );

      if (!errorReactionAdded) {
        logger.warn('Failed to add error reaction to comment', {
          commentId,
          issueId,
        });
      }

      // Also create a threaded reply with error details
      const errorMessage = `Failed to send email to candidate. Error: ${emailError instanceof Error ? emailError.message : 'Unknown error'}`;

      const errorCommentId = await addThreadedComment(
        linearAccessToken,
        issueId,
        commentId,
        errorMessage,
        'Clark (bot)'
      );

      logger.error('Failed to send comment email, added error reaction and comment', emailError instanceof Error ? emailError : new Error(String(emailError)), {
        commentId,
        issueId,
        parentCommentId,
        candidateEmail,
        errorReactionAdded,
        errorCommentId,
      });
    }
  } catch (error) {
    logger.error('Error in comment-to-email handler', error instanceof Error ? error : new Error(String(error)), {
      commentId,
      issueId,
    });
    throw error;
  }
}
