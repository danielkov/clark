/**
 * Resend Email Templates Service
 * 
 * Uses Resend's built-in template feature for email content.
 * Templates are created and managed in the Resend dashboard.
 * 
 * Each template function sends an email using a pre-configured template
 * with dynamic variables.
 */

import { Resend } from 'resend';
import { config } from '@/lib/config';
import { logger } from '@/lib/datadog/logger';

// Initialize Resend client
const resend = new Resend(config.resend.apiKey);

// Template IDs from configuration
const TEMPLATE_IDS = {
  CONFIRMATION: config.resend.templates.confirmation,
  REJECTION: config.resend.templates.rejection,
  SCREENING_INVITATION: config.resend.templates.screeningInvitation,
  COMMENT: config.resend.templates.comment,
};

/**
 * Confirmation email parameters
 */
export interface ConfirmationEmailParams {
  to: string;
  candidateName: string;
  organizationName: string;
  positionTitle: string;
  replyTo?: string;
  messageId?: string;
}

/**
 * Send confirmation email using Resend template
 * This template is used if: email feature is on,
 * but ran out of AI pre-screening credits OR
 * pre-screening is inconclusive
 * 
 * Template variables:
 * - candidate_name: Candidate's full name
 * - organization_name: Organization name
 * - position_title: Job position title
 * 
 * @param params - Confirmation email parameters
 * @returns Email send response with message ID
 * @throws Error if email sending fails
 */
export async function sendConfirmationEmail(params: ConfirmationEmailParams) {
  try {
    const headers: Record<string, string> = {
      'X-Email-Type': 'confirmation',
    };

    if (params.messageId) {
      headers['Message-ID'] = `<${params.messageId}>`;
    }

    const { data, error } = await resend.emails.send({
      from: config.resend.fromEmail,
      to: params.to,
      subject: `Application Received - ${params.positionTitle}`,
      template: {
        id: TEMPLATE_IDS.CONFIRMATION,
        variables: {
          candidate_name: params.candidateName,
          organization_name: params.organizationName,
          position_title: params.positionTitle,
        },
      },
      replyTo: params.replyTo,
      headers,
      tags: [
        { name: 'type', value: 'confirmation' },
      ],
    });

    if (error) {
      logger.error('Failed to send confirmation email', error as Error, {
        to: params.to,
        candidateName: params.candidateName,
        organizationName: params.organizationName,
        positionTitle: params.positionTitle,
      });
      throw new Error(`Failed to send confirmation email: ${error.message}`);
    }

    logger.info('Confirmation email sent', {
      emailId: data?.id,
      to: params.to,
      candidateName: params.candidateName,
      organizationName: params.organizationName,
      positionTitle: params.positionTitle,
    });

    return data;
  } catch (error) {
    logger.error('Failed to send confirmation email', error as Error, {
      to: params.to,
      candidateName: params.candidateName,
      organizationName: params.organizationName,
      positionTitle: params.positionTitle,
    });
    throw error;
  }
}

/**
 * Rejection email parameters
 */
export interface RejectionEmailParams {
  to: string;
  candidateName: string;
  positionTitle: string;
  organizationName: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
}

/**
 * Send rejection email using Resend template
 * 
 * Template variables:
 * - candidate_name: Candidate's full name
 * - position_title: Job position title
 * - organization_name: Name of the organization
 * 
 * @param params - Rejection email parameters
 * @returns Email send response with message ID
 * @throws Error if email sending fails
 */
export async function sendRejectionEmail(params: RejectionEmailParams) {
  try {
    const headers: Record<string, string> = {
      'X-Email-Type': 'rejection',
    };

    if (params.inReplyTo) {
      headers['In-Reply-To'] = `<${params.inReplyTo}>`;
    }

    if (params.references && params.references.length > 0) {
      headers['References'] = params.references.map(id => `<${id}>`).join(' ');
    }

    const { data, error } = await resend.emails.send({
      from: config.resend.fromEmail,
      to: params.to,
      subject: `Update on your application for ${params.positionTitle}`,
      template: {
        id: TEMPLATE_IDS.REJECTION,
        variables: {
          candidate_name: params.candidateName,
          position_title: params.positionTitle,
          organization_name: params.organizationName,
        },
      },
      replyTo: params.replyTo,
      headers,
      tags: [
        { name: 'type', value: 'rejection' },
      ],
    });

    if (error) {
      logger.error('Failed to send rejection email', error as Error, {
        to: params.to,
        candidateName: params.candidateName,
        positionTitle: params.positionTitle,
      });
      throw new Error(`Failed to send rejection email: ${error.message}`);
    }

    logger.info('Rejection email sent', {
      emailId: data?.id,
      to: params.to,
      candidateName: params.candidateName,
      positionTitle: params.positionTitle,
    });

    return data;
  } catch (error) {
    logger.error('Failed to send rejection email', error as Error, {
      to: params.to,
      candidateName: params.candidateName,
      positionTitle: params.positionTitle,
    });
    throw error;
  }
}

/**
 * Screening invitation email parameters
 */
export interface ScreeningInvitationEmailParams {
  to: string;
  candidateName: string;
  organizationName: string;
  positionTitle: string;
  sessionLink: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
}

/**
 * Send screening invitation email using Resend template
 * 
 * Template variables:
 * - candidate_name: Candidate's full name
 * - organization_name: Organization name
 * - position_title: Job position title
 * - session_link: ElevenLabs agent session URL
 * 
 * @param params - Screening invitation email parameters
 * @returns Email send response with message ID
 * @throws Error if email sending fails
 */
export async function sendScreeningInvitationEmail(params: ScreeningInvitationEmailParams) {
  try {
    const headers: Record<string, string> = {
      'X-Email-Type': 'screening_invitation',
    };

    if (params.inReplyTo) {
      headers['In-Reply-To'] = `<${params.inReplyTo}>`;
    }

    if (params.references && params.references.length > 0) {
      headers['References'] = params.references.map(id => `<${id}>`).join(' ');
    }

    const { data, error } = await resend.emails.send({
      from: config.resend.fromEmail,
      to: params.to,
      subject: `AI Screening Interview - ${params.positionTitle}`,
      template: {
        id: TEMPLATE_IDS.SCREENING_INVITATION,
        variables: {
          candidate_name: params.candidateName,
          organization_name: params.organizationName,
          position_title: params.positionTitle,
          session_link: params.sessionLink,
        },
      },
      replyTo: params.replyTo,
      headers,
      tags: [
        { name: 'type', value: 'screening_invitation' },
      ],
    });

    if (error) {
      logger.error('Failed to send screening invitation email', error as Error, {
        to: params.to,
        candidateName: params.candidateName,
        organizationName: params.organizationName,
        positionTitle: params.positionTitle,
      });
      throw new Error(`Failed to send screening invitation email: ${error.message}`);
    }

    logger.info('Screening invitation email sent', {
      emailId: data?.id,
      to: params.to,
      candidateName: params.candidateName,
      organizationName: params.organizationName,
      positionTitle: params.positionTitle,
    });

    return data;
  } catch (error) {
    logger.error('Failed to send screening invitation email', error as Error, {
      to: params.to,
      candidateName: params.candidateName,
      organizationName: params.organizationName,
      positionTitle: params.positionTitle,
    });
    throw error;
  }
}

/**
 * Comment email parameters
 */
export interface CommentEmailParams {
  to: string;
  candidateName: string;
  positionTitle: string;
  commenterName: string;
  commentBody: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
}

/**
 * Send comment as email using Resend template
 * 
 * Template variables:
 * - candidate_name: Candidate's full name
 * - position_title: Job position title
 * - comment_body: The comment content
 * - commenter_name: The name of the person who posted the comment in Linear
 * 
 * @param params - Comment email parameters
 * @returns Email send response with message ID
 * @throws Error if email sending fails
 */
export async function sendCommentEmail(params: CommentEmailParams) {
  try {
    const headers: Record<string, string> = {
      'X-Email-Type': 'comment',
    };

    if (params.inReplyTo) {
      headers['In-Reply-To'] = `<${params.inReplyTo}>`;
    }

    if (params.references && params.references.length > 0) {
      headers['References'] = params.references.map(id => `<${id}>`).join(' ');
    }

    const { data, error } = await resend.emails.send({
      from: config.resend.fromEmail,
      to: params.to,
      subject: `Update on your application for ${params.positionTitle}`,
      template: {
        id: TEMPLATE_IDS.COMMENT,
        variables: {
          candidate_name: params.candidateName,
          position_title: params.positionTitle,
          comment_body: params.commentBody,
          commenter_name: params.commenterName,
        },
      },
      replyTo: params.replyTo,
      headers,
      tags: [
        { name: 'type', value: 'comment' },
      ],
    });

    if (error) {
      logger.error('Failed to send comment email', error as Error, {
        to: params.to,
        candidateName: params.candidateName,
        positionTitle: params.positionTitle,
      });
      throw new Error(`Failed to send comment email: ${error.message}`);
    }

    logger.info('Comment email sent', {
      emailId: data?.id,
      to: params.to,
      candidateName: params.candidateName,
      positionTitle: params.positionTitle,
    });

    return data;
  } catch (error) {
    logger.error('Failed to send comment email', error as Error, {
      to: params.to,
      candidateName: params.candidateName,
      positionTitle: params.positionTitle,
    });
    throw error;
  }
}
