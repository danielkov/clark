/**
 * Resend Client Service
 * 
 * Handles all Resend API interactions using the official Resend Node.js SDK.
 * Provides functions for:
 * - Sending emails using templates
 * - Verifying webhook signatures
 * - Managing email delivery
 */

import { Resend } from 'resend';
import { config } from '@/lib/config';
import { logger } from '@/lib/datadog/logger';

// Initialize Resend client
const resend = new Resend(config.resend.apiKey);

/**
 * Email sending parameters
 */
export interface SendEmailParams {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
}

/**
 * Template email parameters
 */
export interface SendTemplateEmailParams {
  to: string;
  subject: string;
  template: {
    id: string;
    variables: Record<string, string>;
  };
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
}

/**
 * Email send response
 */
export interface EmailSendResponse {
  id: string;
}

/**
 * Send email using Resend SDK
 * 
 * @param params - Email parameters
 * @returns Email send response with message ID
 * @throws Error if email sending fails
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailSendResponse> {
  try {
    const { data, error } = await resend.emails.send(params as any);
    
    if (error) {
      logger.error('Email send failed', error as Error, {
        to: params.to,
        subject: params.subject,
      });
      throw new Error(`Email send failed: ${error.message}`);
    }
    
    logger.info('Email sent successfully', {
      emailId: data?.id,
      to: params.to,
      subject: params.subject,
    });
    
    return data as EmailSendResponse;
  } catch (error) {
    logger.error('Email send error', error as Error, {
      to: params.to,
      subject: params.subject,
    });
    throw error;
  }
}

/**
 * Send email using a Resend template
 * 
 * @param params - Template email parameters
 * @returns Email send response with message ID
 * @throws Error if email sending fails
 */
export async function sendTemplateEmail(params: SendTemplateEmailParams): Promise<EmailSendResponse> {
  try {
    const { data, error } = await resend.emails.send({
      from: config.resend.fromEmail,
      to: params.to,
      subject: params.subject,
      react: params.template as any, // Resend SDK expects 'react' for templates
      replyTo: params.replyTo,
      headers: params.headers,
      tags: params.tags,
    });
    
    if (error) {
      logger.error('Template email send failed', error as Error, {
        to: params.to,
        subject: params.subject,
        templateId: params.template.id,
      });
      throw new Error(`Template email send failed: ${error.message}`);
    }
    
    logger.info('Template email sent successfully', {
      emailId: data?.id,
      to: params.to,
      subject: params.subject,
      templateId: params.template.id,
    });
    
    return data as EmailSendResponse;
  } catch (error) {
    logger.error('Template email send error', error as Error, {
      to: params.to,
      subject: params.subject,
      templateId: params.template.id,
    });
    throw error;
  }
}

/**
 * Batch email parameters
 */
export interface BatchEmailParams {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Send batch emails using Resend SDK
 * 
 * @param emails - Array of email parameters
 * @returns Array of email send responses
 * @throws Error if batch send fails
 */
export async function sendBatchEmails(emails: BatchEmailParams[]): Promise<EmailSendResponse[]> {
  try {
    const { data, error } = await resend.batch.send(emails as any);
    
    if (error) {
      logger.error('Batch email send failed', error as Error, {
        count: emails.length,
      });
      throw new Error(`Batch send failed: ${error.message}`);
    }
    
    logger.info('Batch emails sent successfully', {
      count: emails.length,
      emailIds: data?.data?.map((d: any) => d.id),
    });
    
    return (data?.data || []) as EmailSendResponse[];
  } catch (error) {
    logger.error('Batch email send error', error as Error, {
      count: emails.length,
    });
    throw error;
  }
}

/**
 * Webhook headers from Resend (using Svix)
 */
export interface WebhookHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

/**
 * Verify webhook signature using Resend SDK
 * 
 * Resend uses Svix for webhook delivery, which provides automatic signature verification.
 * The webhook events are delivered with svix-* headers for verification.
 * 
 * @param payload - Raw webhook payload string
 * @param headers - Webhook headers (svix-id, svix-timestamp, svix-signature)
 * @param webhookSecret - Webhook secret from Resend dashboard
 * @returns Verified webhook event
 * @throws Error if signature verification fails
 */
export function verifyWebhookSignature(
  payload: string,
  headers: WebhookHeaders,
  webhookSecret: string
): any {
  try {
    const event = resend.webhooks.verify({
      payload,
      headers: {
        id: headers.id,
        timestamp: headers.timestamp,
        signature: headers.signature,
      },
      webhookSecret,
    });
    
    logger.info('Webhook signature verified', {
      eventType: (event as any).type,
      webhookId: headers.id,
    });
    
    return event;
  } catch (error) {
    logger.error('Webhook signature verification failed', error as Error, {
      webhookId: headers.id,
    });
    throw new Error('Invalid webhook signature');
  }
}

/**
 * Get Resend client instance
 * Useful for advanced operations not covered by helper functions
 * 
 * @returns Resend client instance
 */
export function getResendClient(): Resend {
  return resend;
}
