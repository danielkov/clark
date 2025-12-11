/**
 * Resend Webhook Handler
 * 
 * Processes incoming Resend webhook events for email replies from candidates.
 * Uses Resend SDK (via Svix) for signature verification.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 10.1, 10.3, 10.4, 10.5
 */

import { NextRequest, NextResponse } from 'next/server';
import { getResendClient, verifyWebhookSignature } from '@/lib/resend/client';
import { 
  parseReplyToAddress, 
  cleanEmailContent, 
  formatEmailCommentWithMetadata 
} from '@/lib/resend/email-threading';
import { getOrgConfig } from '@/lib/redis';
import { createLinearClient } from '@/lib/linear/client';
import { config } from '@/lib/config';
import { logger, generateCorrelationId } from '@/lib/datadog/logger';
import { emitSecurityEvent, emitWebhookFailure } from '@/lib/datadog/events';
import { trackWebhookProcessing, createSpan } from '@/lib/datadog/metrics';
import { withRetry } from '@/lib/utils/retry';

/**
 * Resend webhook event types
 * Resend uses Svix for webhook delivery
 * 
 * For inbound emails (candidate replies), Resend forwards the email to our webhook
 * with the full email content including headers, body, and attachments.
 */
interface ResendWebhookEvent {
  type: 'email.sent' | 'email.delivered' | 'email.delivery_delayed' | 'email.complained' | 'email.bounced' | 'email.opened' | 'email.clicked';
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    html?: string;
    text?: string;
    reply_to?: string[];
    // Additional fields for specific event types
  };
}

/**
 * Resend inbound email event
 * This is sent when a candidate replies to an email
 */
export interface ResendInboundWebhookAttachment {
  id: string;
  filename: string;
  content_type: string;
  content_disposition: string;
  content_id?: string;
}

export interface ResendInboundWebhookData {
  email_id: string;
  created_at: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  message_id?: string;
  subject: string | null;
  attachments: ResendInboundWebhookAttachment[];
}

export interface ResendInboundEmailEvent {
  type: "email.received";
  created_at: string;
  data: ResendInboundWebhookData;
}


/**
 * Handle email.received event (candidate reply)
 * 
 * When a candidate replies to an email, Resend delivers it via webhook.
 * We extract the Linear org and issue ID from the "to" address (our dynamic reply-to),
 * clean the email content, and add it as a system comment to the Linear Issue.
 */
async function handleEmailReceived(event: ResendInboundEmailEvent, correlationId: string): Promise<void> {
  const { data } = event;
  
  logger.info('Processing email.received event', {
    from: data.from,
    to: data.to,
    subject: data.subject,
    correlationId,
  });
  
  // Extract the "to" address which should be our dynamic reply-to address
  const toAddress = data.to;
  
  if (!toAddress) {
    logger.error('No recipient address in email.received event', undefined, {
      from: data.from,
      correlationId,
    });
    return;
  }
  
  const ourReplyAddress = toAddress.find((address) => address.includes(config.resend.replyDomain));
  if (!ourReplyAddress) {
    logger.error('Failed to find our reply address', undefined, {
      toAddress,
      from: data.from,
      subject: data.subject,
      correlationId,
    });

    emitWebhookFailure(
      'resend:reply_not_found',
      new Error('Cannot match email to Linear Issue'),
      {
        toAddress,
        from: data.from,
        correlationId,
      }
    );
    
    return;
  }
  // Parse the "to" address to extract Linear org and issue ID
  const parsed = parseReplyToAddress(ourReplyAddress);
  
  if (!parsed) {
    // This is an orphaned email - cannot match to a Linear Issue
    logger.error('Failed to parse to address - orphaned email', undefined, {
      toAddress,
      from: data.from,
      subject: data.subject,
      correlationId,
    });
    
    // Emit event for monitoring/alerting
    emitWebhookFailure(
      'resend:orphaned_email',
      new Error('Cannot match email to Linear Issue'),
      {
        toAddress,
        from: data.from,
        correlationId,
      }
    );
    
    return;
  }
  
  const { linearOrg, issueId } = parsed;
  
  logger.info('Parsed to address', {
    linearOrg,
    issueId,
    from: data.from,
    correlationId,
  });
  
  // Get organization config from Redis
  const orgConfig = await getOrgConfig(linearOrg);
  
  if (!orgConfig) {
    logger.error('Organization config not found in Redis - orphaned email', undefined, {
      linearOrg,
      issueId,
      from: data.from,
      correlationId,
    });
    
    // Emit event for monitoring/alerting
    emitWebhookFailure(
      'resend:orphaned_email',
      new Error('Organization config not found'),
      {
        linearOrg,
        issueId,
        from: data.from,
        correlationId,
      }
    );
    
    return;
  }
  
  // Create Linear client with org access token
  const linearClient = createLinearClient(orgConfig.accessToken);
  
  // Verify the issue exists
  let issue;
  try {
    issue = await linearClient.issue(issueId);
    
    if (!issue) {
      logger.error('Linear Issue not found - orphaned email', undefined, {
        linearOrg,
        issueId,
        from: data.from,
        correlationId,
      });
      
      // Emit event for monitoring/alerting
      emitWebhookFailure(
        'resend:orphaned_email',
        new Error('Linear Issue not found'),
        {
          linearOrg,
          issueId,
          from: data.from,
          correlationId,
        }
      );
      
      return;
    }
  } catch (error) {
    logger.error('Error fetching Linear Issue', error as Error, {
      linearOrg,
      issueId,
      from: data.from,
      correlationId,
    });
    
    // Emit event for monitoring/alerting
    emitWebhookFailure(
      'resend:issue_fetch_error',
      error as Error,
      {
        linearOrg,
        issueId,
        from: data.from,
        correlationId,
      }
    );
    
    // Return 500 for retry
    throw error;
  }

  let rawContent;
  try {
    const client = getResendClient();
    const data = await withRetry(
      () => client.emails.receiving.get(event.data.email_id).then(({ data, error }) => {
        if (error) {
          throw error;
        }
        return data;
      }),
      {
        // Resend emails might take a while to process, so we keep trying
        maxAttempts: 10,
        initialDelayMs: 500,
        shouldRetry: () => true,
      }
    );
    
    if (!data) {
      logger.error('Email not found', undefined, {
        id: event.data.email_id,
        data: event.data,
      });
      throw new Error('Email not found');
    }

    rawContent = data?.text;
  } catch (error) {
    logger.error('Error reading received email', error as Error, {
      issueId: issue.id,
      from: data.from,
      correlationId,
    });
    return;
  }
  
  if (!rawContent) {
    logger.warn('Email has no content', {
      from: data.from,
      issueId,
      correlationId,
    });
    return;
  }
  
  // Clean email content (remove quotes, formatting, etc.)
  const cleanedContent = cleanEmailContent(rawContent);
  
  // Extract sender name from "from" address
  // Format: "Name <email@example.com>" or just "email@example.com"
  const senderMatch = data.from.match(/^(.+?)\s*<.+>$/);
  const senderName = senderMatch ? senderMatch[1].trim() : data.from;
  
  // Generate a unique message ID for this email
  // Use the from address and timestamp to create a pseudo-message-id
  const messageId = `${data.from.replace(/[^a-z0-9]/gi, '')}_${Date.now()}`;
  
  // Format comment with metadata footer
  const commentBody = formatEmailCommentWithMetadata(
    cleanedContent,
    senderName,
    messageId
  );
  
  // Add comment to Linear Issue
  try {
    await linearClient.createComment({
      issueId: issue.id,
      body: commentBody,
    });
    
    logger.info('Added email reply as comment to Linear Issue', {
      issueId: issue.id,
      from: data.from,
      senderName,
      correlationId,
    });
  } catch (error) {
    logger.error('Error adding comment to Linear Issue', error as Error, {
      issueId: issue.id,
      from: data.from,
      correlationId,
    });
    
    // Emit event for monitoring/alerting
    emitWebhookFailure(
      'resend:comment_creation_error',
      error as Error,
      {
        issueId: issue.id,
        from: data.from,
        correlationId,
      }
    );
    
    // Return 500 for retry
    throw error;
  }
}

/**
 * Route webhook events to appropriate handlers
 */
async function routeWebhookEvent(event: ResendWebhookEvent | ResendInboundEmailEvent, correlationId: string): Promise<void> {
  const eventType = event.type;
  
  switch (eventType) {
    case 'email.received':
      // This is a candidate reply - process it
      await handleEmailReceived(event as ResendInboundEmailEvent, correlationId);
      break;
      
    case 'email.sent':
    case 'email.delivered':
    case 'email.delivery_delayed':
    case 'email.complained':
    case 'email.bounced':
    case 'email.opened':
    case 'email.clicked':
      // These events are informational - log but don't process
      logger.info('Received informational webhook event', {
        eventType,
        correlationId,
      });
      break;
      
    default:
      logger.info('Unhandled webhook event type', { 
        eventType,
        correlationId,
      });
  }
}

/**
 * POST /api/webhooks/resend
 * 
 * Receives and processes Resend webhook events
 * Resend uses Svix for webhook delivery with signature verification
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();
  let eventType = 'unknown';
  let success = false;
  let errorType: string | undefined;
  
  const workflowSpan = createSpan('resend_webhook_processing', {
    'workflow.name': 'resend_webhook',
    'correlation_id': correlationId,
  });
  
  try {
    // Get raw body for signature verification
    const body = await request.text();
    
    // Get Svix headers (Resend uses Svix for webhooks)
    const svixId = request.headers.get('svix-id');
    const svixTimestamp = request.headers.get('svix-timestamp');
    const svixSignature = request.headers.get('svix-signature');
    
    if (!svixId || !svixTimestamp || !svixSignature) {
      logger.error('Missing webhook headers', undefined, {
        correlationId,
        hasSvixId: !!svixId,
        hasSvixTimestamp: !!svixTimestamp,
        hasSvixSignature: !!svixSignature,
      });
      
      errorType = 'MissingHeaders';
      
      emitSecurityEvent(
        'Resend Webhook Missing Headers',
        'Received webhook request without required Svix headers',
        { 
          errorType,
          correlationId,
        }
      );
      
      trackWebhookProcessing({
        eventType: 'resend:unknown',
        duration: Date.now() - startTime,
        success,
        errorType,
      });
      
      workflowSpan.setError(new Error('Missing webhook headers'));
      workflowSpan.finish();
      
      return NextResponse.json(
        { error: 'Missing webhook headers' },
        { status: 401 }
      );
    }
    
    // Verify webhook signature using Resend SDK
    let event: ResendWebhookEvent | ResendInboundEmailEvent;
    try {
      event = verifyWebhookSignature(
        body,
        {
          id: svixId,
          timestamp: svixTimestamp,
          signature: svixSignature,
        },
        config.resend.webhookSecret
      ) as ResendWebhookEvent | ResendInboundEmailEvent;
    } catch (error) {
      logger.error('Invalid webhook signature', error as Error, {
        correlationId,
        svixId,
      });
      
      errorType = 'InvalidSignature';
      
      emitSecurityEvent(
        'Resend Webhook Signature Verification Failed',
        'Webhook signature verification failed - possible tampering attempt',
        { 
          errorType,
          correlationId,
          svixId,
        }
      );
      
      trackWebhookProcessing({
        eventType: 'resend:unknown',
        duration: Date.now() - startTime,
        success,
        errorType,
      });
      
      workflowSpan.setError(error as Error);
      workflowSpan.finish();
      
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    
    eventType = `resend:${event.type}`;
    
    logger.info('Processing Resend webhook event', { 
      eventType,
      correlationId,
    });
    
    // Route to appropriate handler
    await routeWebhookEvent(event, correlationId);
    
    success = true;
    
    // Track successful webhook processing
    trackWebhookProcessing({
      eventType,
      duration: Date.now() - startTime,
      success,
    });
    
    workflowSpan.finish();
    
    return NextResponse.json({ success });
  } catch (error) {
    success = false;
    const err = error instanceof Error ? error : new Error(String(error));
    errorType = err.name;
    
    logger.error('Resend webhook processing error', err, {
      eventType,
      correlationId,
      errorType,
      errorMessage: err.message,
      errorStack: err.stack,
    });
    
    // Emit critical failure event
    emitWebhookFailure(eventType, err, {
      duration: Date.now() - startTime,
      correlationId,
      errorType,
    });
    
    // Track failed webhook processing
    trackWebhookProcessing({
      eventType,
      duration: Date.now() - startTime,
      success,
      errorType,
    });
    
    workflowSpan.setError(err);
    workflowSpan.finish();
    
    // Determine if error is retryable (Requirement 10.5)
    // Return 500 for transient errors (network, timeout, etc.) to trigger retry
    // Return 400 for permanent errors (validation, etc.) to prevent retry
    const isTransientError = 
      err.message.includes('timeout') ||
      err.message.includes('network') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('ETIMEDOUT') ||
      err.message.includes('service unavailable');
    
    if (isTransientError) {
      logger.info('Returning 500 for transient error to allow retry', {
        eventType,
        correlationId,
        errorType,
      });
      
      return NextResponse.json(
        { error: 'Internal server error', retryable: true },
        { status: 500 }
      );
    }
    
    // Permanent error - return 400 to prevent retry
    logger.info('Returning 400 for permanent error to prevent retry', {
      eventType,
      correlationId,
      errorType,
    });
    
    return NextResponse.json(
      { error: 'Bad request', retryable: false },
      { status: 400 }
    );
  }
}
