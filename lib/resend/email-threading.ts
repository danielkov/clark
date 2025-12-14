/**
 * Email Threading Utilities
 * 
 * Provides utility functions for email threading without database storage.
 * All metadata is encoded in email addresses and headers.
 * 
 * Threading Strategy:
 * 1. Dynamic Reply-To Addresses: Encode Linear org and issue ID in the reply-to email address
 * 2. Email Headers: Use Message-ID, In-Reply-To, and References headers for proper threading
 * 3. Comment Metadata: Store Message-ID in Linear comments for future replies
 * 4. Content Cleaning: Strip reply quotes and formatting before adding to Linear
 * 
 * Note: Actual email sending is handled by lib/resend/templates.ts
 */

import { config } from '@/lib/config';
import { logger } from '@/lib/datadog/logger';

/**
 * Generate a dynamic reply-to address that encodes issue metadata
 *
 * Format: <org>+<issue_id>+<comment_id>@domain.com
 * Example: acme+issue_abc123+comment_xyz@replies.yourdomain.com
 *
 * This allows us to route replies back to the correct Linear Issue and thread
 * without maintaining a database mapping.
 *
 * @param linearOrg - Linear organization identifier
 * @param issueId - Linear Issue ID
 * @param commentId - Linear Comment ID for threading
 * @returns Dynamic reply-to email address
 */
export function generateReplyToAddress(linearOrg: string, issueId: string, commentId: string): string {
  // Sanitize inputs to ensure valid email format
  const sanitizedOrg = linearOrg.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const sanitizedIssueId = issueId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const sanitizedCommentId = commentId.toLowerCase().replace(/[^a-z0-9-]/g, '');

  return `${sanitizedOrg}+${sanitizedIssueId}+${sanitizedCommentId}@${config.resend.replyDomain}`;
}

/**
 * Parse reply-to address to extract metadata
 *
 * Extracts Linear org, issue ID, and comment ID from the email address format:
 * <org>+<issue_id>+<comment_id>@domain.com
 *
 * @param email - Email address to parse
 * @returns Object with linearOrg, issueId, and commentId, or null if parsing fails
 */
export function parseReplyToAddress(email: string): { linearOrg: string; issueId: string; commentId: string } | null {
  try {
    // Extract from format: <org>+<issue_id>+<comment_id>@domain.com
    const match = email.match(/^([^+]+)\+([^+@]+)\+([^@]+)@/);

    if (!match) {
      logger.warn('Failed to parse reply-to address', {
        email,
        reason: 'Invalid format - expected format: org+issueId+commentId@domain',
      });
      return null;
    }

    const linearOrg = match[1];
    const issueId = match[2];
    const commentId = match[3];

    if (!linearOrg || !issueId || !commentId) {
      logger.warn('Failed to parse reply-to address', {
        email,
        reason: 'Missing org, issue ID, or comment ID',
      });
      return null;
    }

    return {
      linearOrg,
      issueId,
      commentId,
    };
  } catch (error) {
    logger.error('Error parsing reply-to address', error as Error, {
      email,
    });
    return null;
  }
}

/**
 * Extract Message-ID from email comment for threading
 * 
 * Parses Linear comment to find Message-ID footer.
 * Format: "---\nFrom: Candidate Name\nMessage-ID: <msg_id>"
 * 
 * @param commentBody - Linear comment body text
 * @returns Message-ID string or null if not found
 */
export function extractMessageIdFromComment(commentBody: string): string | null {
  try {
    // Parse comment to find Message-ID footer
    // Format: "---\nFrom: Candidate Name\nMessage-ID: <msg_id>"
    const match = commentBody.match(/Message-ID:\s*<?([^>\s]+)>?/i);
    
    if (!match) {
      return null;
    }
    
    return match[1];
  } catch (error) {
    logger.error('Error extracting Message-ID from comment', error as Error, {
      commentBody: commentBody.substring(0, 100), // Log first 100 chars for context
    });
    return null;
  }
}

/**
 * Strip email formatting and reply quotes
 * 
 * Cleans email content by:
 * - Removing quoted text (lines starting with >)
 * - Removing "On [date], [person] wrote:" patterns
 * - Removing excessive whitespace
 * - Stripping basic HTML tags
 * 
 * @param emailBody - Raw email body content
 * @returns Cleaned email content
 */
export function cleanEmailContent(emailBody: string): string {
  try {
    let cleaned = emailBody;
    
    // Remove quoted text (lines starting with >)
    cleaned = cleaned.replace(/^>.*$/gm, '');
    
    // Remove "On [date], [person] wrote:" patterns
    // Matches various formats like:
    // - "On Mon, Jan 1, 2024 at 10:00 AM, John Doe wrote:"
    // - "On 1/1/2024, John Doe <john@example.com> wrote:"
    cleaned = cleaned.replace(/On .+? wrote:/gi, '');
    
    // Remove email signature separators
    cleaned = cleaned.replace(/^--\s*$/gm, '');
    
    // Remove excessive whitespace (3+ newlines -> 2 newlines)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    // Strip basic HTML tags if present
    cleaned = cleaned.replace(/<[^>]*>/g, '');
    
    // Trim leading and trailing whitespace
    cleaned = cleaned.trim();
    
    return cleaned;
  } catch (error) {
    logger.error('Error cleaning email content', error as Error, {
      emailBody: emailBody.substring(0, 100),
    });
    // Return original content if cleaning fails
    return emailBody;
  }
}

/**
 * Format email comment with metadata footer
 * 
 * Adds a footer to the email content with sender information and Message-ID
 * for future threading. This allows us to maintain conversation context
 * without a database.
 * 
 * Format:
 * ```
 * [email body]
 * 
 * ---
 * 
 * From: Sender Name
 * Message-ID: msg_abc123
 * ```
 * 
 * @param emailBody - Cleaned email body content
 * @param senderName - Name of the email sender
 * @param messageId - Message-ID from the email
 * @returns Formatted comment with metadata footer
 */
export function formatEmailCommentWithMetadata(
  emailBody: string,
  senderName: string,
  messageId: string
): string {
  return `${emailBody}\n\n---\n\nFrom: ${senderName}\nMessage-ID: ${messageId}`;
}

/**
 * Build threading references array from comment history
 * 
 * Extracts all Message-IDs from Linear Issue comments to build the References
 * header for email threading. This maintains the full conversation chain.
 * 
 * @param comments - Array of Linear Issue comment bodies
 * @returns Array of Message-IDs in chronological order
 */
export function buildThreadReferences(comments: string[]): string[] {
  const messageIds: string[] = [];
  
  for (const comment of comments) {
    const messageId = extractMessageIdFromComment(comment);
    if (messageId) {
      messageIds.push(messageId);
    }
  }
  
  return messageIds;
}

/**
 * Get the last Message-ID from comment history
 * 
 * Finds the most recent Message-ID from Linear Issue comments to use
 * as the In-Reply-To header for the next email in the thread.
 * 
 * @param comments - Array of Linear Issue comment bodies (newest first)
 * @returns Most recent Message-ID or null if none found
 */
export function getLastMessageId(comments: string[]): string | null {
  for (const comment of comments) {
    const messageId = extractMessageIdFromComment(comment);
    if (messageId) {
      return messageId;
    }
  }
  
  return null;
}
