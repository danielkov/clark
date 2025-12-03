/**
 * Linear Webhook Handler
 * 
 * Processes incoming Linear webhook events for real-time synchronization
 */

import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import crypto from 'crypto';
import { getOrgConfig } from '@/lib/redis';
import { createLinearClient } from '@/lib/linear/client';
import { getToneOfVoiceContent } from '@/lib/linear/documents';
import { enhanceJobDescription } from '@/lib/cerebras/job-description';
import { triggerPreScreening } from '@/lib/linear/pre-screening';
import { withRetry, isRetryableError } from '@/lib/utils/retry';
import { trackWebhookProcessing, createSpan } from '@/lib/datadog/metrics';
import { logger, generateCorrelationId } from '@/lib/datadog/logger';
import { emitSecurityEvent, emitWebhookFailure } from '@/lib/datadog/events';

/**
 * Verify webhook signature using HMAC
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Check for replay attacks using timestamp
 */
function isReplayAttack(timestamp: string): boolean {
  const webhookTime = parseInt(timestamp, 10);
  const currentTime = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  // Reject if timestamp is more than 5 minutes old
  return Math.abs(currentTime - webhookTime) > fiveMinutes;
}

/**
 * Handle Project creation or update events
 * Checks for 'enhance' label and triggers AI job description enhancement
 */
async function handleProjectChange(event: any): Promise<void> {
  const projectId = event.data?.id;
  
  if (!projectId) {
    logger.error('Missing project ID in webhook event');
    return;
  }

  const correlationId = generateCorrelationId();
  const workflowSpan = createSpan('job_publication_workflow', {
    'workflow.name': 'job_publication',
    'project_id': projectId,
    'action': event.action,
    'correlation_id': correlationId,
  });

  logger.info('Project changed', {
    projectId,
    action: event.action,
    correlationId,
  });

  try {
    // Linear webhooks include the organization URL key which is the org name
    // The URL is in format: https://linear.app/{orgUrlKey}/...
    const orgUrlKey = event.url?.split('/')[3];
    
    if (!orgUrlKey) {
      logger.error('Could not extract organization URL key from webhook event');
      return;
    }

    // Get organization config from Redis using org URL key (which is the org name)
    const orgConfig = await getOrgConfig(orgUrlKey);
    
    if (!orgConfig) {
      logger.error('Organization config not found in Redis', undefined, { orgUrlKey });
      return;
    }

    // Create Linear client with org access token
    const client = createLinearClient(orgConfig.accessToken);
    
    // Fetch the project
    const project = await client.project(projectId);
    
    if (!project) {
      logger.error('Project not found', undefined, { projectId });
      return;
    }

    // Verify the Project belongs to the ATS Container Initiative (early check)
    const initiatives = await project.initiatives();
    const initiative = initiatives.nodes.find(
      init => init.id === orgConfig.atsContainerInitiativeId
    );

    if (!initiative) {
      logger.info('Project does not belong to ATS Container Initiative, skipping enhancement', { projectId });
      return;
    }

    // Get project labels
    const labels = await project.labels();
    const hasEnhanceLabel = labels.nodes.some(label => label.name === 'enhance');
    
    if (!hasEnhanceLabel) {
      logger.info('Project does not have "enhance" label, skipping enhancement', { projectId });
      return;
    }

    logger.info('Project has "enhance" label, starting enhancement process', { projectId });

    // Get the original content
    const originalContent = project.content || '';
    
    if (!originalContent) {
      logger.error('Project has no content to enhance', undefined, { projectId });
      return;
    }

    // Get tone of voice content
    const toneOfVoice = await getToneOfVoiceContent(initiative.id, client);

    // Enhance the job description with retry logic
    logger.info('Calling AI enhancement', { projectId });
    const enhancedContent = await withRetry(
      () => enhanceJobDescription(originalContent, toneOfVoice, orgConfig.orgId, {
        userId: 'webhook',
        resourceId: projectId,
      }),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );

    if (!enhancedContent) {
      logger.error('AI enhancement returned no content', undefined, { projectId });
      return;
    }

    logger.info('AI enhancement completed, preparing to update project', { projectId });

    // Get current label IDs (excluding 'enhance')
    const currentLabelIds = labels.nodes
      .filter(label => label.name !== 'enhance')
      .map(label => label.id);

    // Get or create 'ai-generated' label BEFORE updating the project
    const workspaceLabels = await client.projectLabels();
    let aiGeneratedLabel = workspaceLabels.nodes.find(
      label => label.name === 'ai-generated'
    );

    // Create the label if it doesn't exist
    if (!aiGeneratedLabel) {
      const createResult = await client.createProjectLabel({
        name: 'ai-generated',
        color: '#5E6AD2', // Linear purple
      });
      
      if (createResult.success && createResult.projectLabel) {
        aiGeneratedLabel = await createResult.projectLabel;
      }
    }

    // Update project content AND labels in a single call to avoid triggering another webhook
    if (aiGeneratedLabel) {
      await client.updateProject(projectId, {
        content: enhancedContent,
        labelIds: [...currentLabelIds, aiGeneratedLabel.id],
      });
      logger.info('Project enhancement completed successfully', { projectId, correlationId });
      workflowSpan.finish();
    } else {
      logger.error('Failed to get or create ai-generated label', undefined, { projectId, correlationId });
      workflowSpan.setError(new Error('Failed to get or create ai-generated label'));
      workflowSpan.finish();
    }
  } catch (error) {
    workflowSpan.setError(error instanceof Error ? error : new Error(String(error)));
    workflowSpan.finish();
    logger.error('Error handling project change', error instanceof Error ? error : new Error(String(error)), { projectId, correlationId });
  }
}

/**
 * Handle Issue creation events
 */
async function handleIssueCreation(event: any): Promise<void> {
  const issueId = event.data?.id;
  
  if (!issueId) {
    logger.error('Missing issue ID in webhook event');
    return;
  }

  const correlationId = generateCorrelationId();
  const workflowSpan = createSpan('ai_prescreening_workflow', {
    'workflow.name': 'ai_prescreening',
    'issue_id': issueId,
    'project_id': event.data?.project?.id,
    'correlation_id': correlationId,
  });
  
  logger.info('Issue created', {
    issueId,
    projectId: event.data?.project?.id,
    correlationId,
  });
  
  try {
    // Extract organization URL key from webhook event
    const orgUrlKey = event.url?.split('/')[3];
    
    if (!orgUrlKey) {
      logger.error('Could not extract organization URL key from webhook event');
      return;
    }
    
    // Get organization config from Redis
    const orgConfig = await getOrgConfig(orgUrlKey);
    
    if (!orgConfig) {
      logger.error('Organization config not found in Redis', undefined, { orgUrlKey });
      return;
    }
    
    // Trigger AI pre-screening
    const screeningResult = await triggerPreScreening(
      orgConfig.accessToken,
      issueId,
      orgConfig.atsContainerInitiativeId,
      orgConfig.orgId
    );
    
    if (screeningResult) {
      workflowSpan.setTag('confidence', screeningResult.confidence);
      workflowSpan.setTag('recommended_state', screeningResult.recommendedState);
      logger.info('Pre-screening completed successfully', {
        issueId,
        confidence: screeningResult.confidence,
        recommendedState: screeningResult.recommendedState,
        correlationId,
      });
      workflowSpan.finish();
    } else {
      logger.info('Pre-screening was not triggered for Issue', { issueId, correlationId });
      workflowSpan.finish();
    }
  } catch (error) {
    // Handle errors gracefully - log and continue
    workflowSpan.setError(error instanceof Error ? error : new Error(String(error)));
    workflowSpan.finish();
    logger.error('Error during Issue creation handling', error instanceof Error ? error : new Error(String(error)), { issueId, correlationId });
    // Don't throw - we want the webhook to succeed even if pre-screening fails
  }
}

/**
 * Route webhook events to appropriate handlers
 */
async function routeWebhookEvent(event: any): Promise<void> {
  const eventType = event.type;
  const action = event.action;
  
  switch (eventType) {
    case 'Project':
      if (action === 'create' || action === 'update') {
        await handleProjectChange(event);
      }
      break;
      
    case 'Issue':
      if (action === 'create') {
        await handleIssueCreation(event);
      }
      break;
      
    default:
      logger.info('Unhandled webhook event type', { eventType });
  }
}

/**
 * POST /api/webhooks/linear
 * 
 * Receives and processes Linear webhook events
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  let eventType = 'unknown';
  let success = false;
  let errorType: string | undefined;

  try {
    // Get the raw body for signature verification
    const body = await request.text();
    
    // Get signature from headers
    const signature = request.headers.get('linear-signature');
    
    if (!signature) {
      logger.error('Missing webhook signature or timestamp');
      errorType = 'MissingSignature';
      
      emitSecurityEvent(
        'Webhook Missing Signature',
        'Received webhook request without signature',
        { errorType }
      );
      
      trackWebhookProcessing({
        eventType: 'unknown',
        duration: Date.now() - startTime,
        success: false,
        errorType,
      });
      
      return NextResponse.json(
        { error: 'Missing signature or timestamp' },
        { status: 401 }
      );
    }
    
    // Verify webhook signature
    if (!verifyWebhookSignature(body, signature, config.linear.webhookSecret)) {
      logger.error('Invalid webhook signature');
      errorType = 'InvalidSignature';
      
      emitSecurityEvent(
        'Webhook Signature Verification Failed',
        'Webhook signature verification failed - possible tampering attempt',
        { errorType, signature }
      );
      
      trackWebhookProcessing({
        eventType: 'unknown',
        duration: Date.now() - startTime,
        success: false,
        errorType,
      });
      
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    
    // Parse the webhook payload
    const event = JSON.parse(body);
    eventType = `${event.type}:${event.action}`;
    
    logger.info('Processing webhook event', { eventType });
    
    // Route to appropriate handler
    await routeWebhookEvent(event);
    
    success = true;
    
    // Track successful webhook processing
    trackWebhookProcessing({
      eventType,
      duration: Date.now() - startTime,
      success: true,
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    success = false;
    errorType = error instanceof Error ? error.name : 'UnknownError';
    
    const err = error instanceof Error ? error : new Error(String(error));
    
    logger.error('Webhook processing error', err, {
      eventType,
    });
    
    // Emit critical failure event
    emitWebhookFailure(eventType, err, {
      duration: Date.now() - startTime,
    });
    
    // Track failed webhook processing
    trackWebhookProcessing({
      eventType,
      duration: Date.now() - startTime,
      success: false,
      errorType,
    });
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
