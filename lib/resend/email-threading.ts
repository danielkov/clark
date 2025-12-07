/**
 * Email Threading Service
 * 
 * Manages email threading using email headers and dynamic reply addresses.
 * No database storage required - all metadata is encoded in email addresses and headers.
 * 
 * Threading Strategy:
 * 1. Dynamic Reply-To Addresses: Encode Linear org and issue ID in the reply-to email address
 * 2. Email Headers: Use Message-ID, In-Reply-To, and References headers for proper threading
 * 3. Comment Metadata: Store Message-ID in Linear comments for future replies
 * 4. Content Cleaning: Strip reply quotes and formatting before adding to Linear
 */

import { Resend } from 'resend';
import { config } from '@/lib/config';
import { logger } from '@/lib/datadog/logger';

// Lazy initialization of Resend client
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(config.resend.apiKey);
  }
  return resendClient;
}

/**
 * Generate a dynamic reply-to address that encodes issue metadata
 * 
 * Format: <org>+<issue_id>@domain.com
 * Example: acme+issue_abc123@replies.yourdomain.com
 * 
 * This allows us to route replies back to the correct Linear Issue
 * without maintaining a database mapping.
 * 
 * @param linearOrg - Linear organization identifier
 * @param issueId - Linear Issue ID
 * @returns Dynamic reply-to email address
 */
export function generateReplyToAddress(linearOrg: string, issueId: string): string {
  // Sanitize inputs to ensure valid email format
  const sanitizedOrg = linearOrg.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const sanitizedIssueId = issueId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  
  return `${sanitizedOrg}+${sanitizedIssueId}@${config.resend.replyDomain}`;
}

/**
 * Parse reply-to address to extract metadata
 * 
 * Extracts Linear org and issue ID from the email address format:
 * <org>+<issue_id>@domain.com
 * 
 * @param email - Email address to parse
 * @returns Object with linearOrg and issueId, or null if parsing fails
 */
export function parseReplyToAddress(email: string): { linearOrg: string; issueId: string } | null {
  try {
    // Extract from format: <org>+<issue_id>@domain.com
    const match = email.match(/^([^+]+)\+([^@]+)@/);
    
    if (!match) {
      logger.warn('Failed to parse reply-to address', {
        email,
        reason: 'Invalid format',
      });
      return null;
    }
    
    const linearOrg = match[1];
    const issueId = match[2];
    
    if (!linearOrg || !issueId) {
      logger.warn('Failed to parse reply-to address', {
        email,
        reason: 'Missing org or issue ID',
      });
      return null;
    }
    
    return {
      linearOrg,
      issueId,
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
 * Parameters for sending threaded emails
 */
export interface ThreadedEmailParams {
  to: string;
  replyTo: string;
  subject: string;
  template: {
    id: string;
    variables: Record<string, string>;
  };
  inReplyTo?: string; // Message-ID of the email being replied to
  references?: string[]; // Array of Message-IDs in the conversation chain
  tags?: Array<{ name: string; value: string }>;
}

/**
 * Email send response
 */
export interface EmailSendResponse {
  id: string;
}

/**
 * Send email with proper threading headers
 * 
 * Sends an email using Resend with proper threading headers to maintain
 * conversation context in email clients. Uses In-Reply-To and References
 * headers to link emails in a thread.
 * 
 * @param params - Threaded email parameters
 * @returns Email send response with message ID
 * @throws Error if email sending fails
 */
export async function sendThreadedEmail(params: ThreadedEmailParams): Promise<EmailSendResponse> {
  try {
    const headers: Record<string, string> = {};
    
    // Add threading headers if this is a reply
    if (params.inReplyTo) {
      headers['In-Reply-To'] = `<${params.inReplyTo}>`;
    }
    
    if (params.references && params.references.length > 0) {
      // References should be a space-separated list of Message-IDs
      headers['References'] = params.references.map(id => `<${id}>`).join(' ');
    }
    
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: config.resend.fromEmail,
      to: params.to,
      replyTo: params.replyTo,
      subject: params.subject,
      react: params.template as any, // Resend SDK expects 'react' for templates
      headers,
      tags: params.tags,
    });
    
    if (error) {
      logger.error('Threaded email send failed', error as Error, {
        to: params.to,
        subject: params.subject,
        templateId: params.template.id,
        hasInReplyTo: !!params.inReplyTo,
        referencesCount: params.references?.length || 0,
      });
      throw new Error(`Failed to send email: ${error.message}`);
    }
    
    logger.info('Threaded email sent successfully', {
      emailId: data?.id,
      to: params.to,
      subject: params.subject,
      templateId: params.template.id,
      hasInReplyTo: !!params.inReplyTo,
      referencesCount: params.references?.length || 0,
    });
    
    return data as EmailSendResponse;
  } catch (error) {
    logger.error('Threaded email send error', error as Error, {
      to: params.to,
      subject: params.subject,
      templateId: params.template.id,
    });
    throw error;
  }
}
