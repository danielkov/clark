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
    console.error('Missing project ID in webhook event');
    return;
  }

  console.log('Project changed:', {
    projectId,
    action: event.action,
  });

  try {
    // Linear webhooks include the organization URL key which is the org name
    // The URL is in format: https://linear.app/{orgUrlKey}/...
    const orgUrlKey = event.url?.split('/')[3];
    
    if (!orgUrlKey) {
      console.error('Could not extract organization URL key from webhook event');
      return;
    }

    // Get organization config from Redis using org URL key (which is the org name)
    const orgConfig = await getOrgConfig(orgUrlKey);
    
    if (!orgConfig) {
      console.error('Organization config not found in Redis:', orgUrlKey);
      return;
    }

    // Create Linear client with org access token
    const client = createLinearClient(orgConfig.accessToken);
    
    // Fetch the project
    const project = await client.project(projectId);
    
    if (!project) {
      console.error('Project not found:', projectId);
      return;
    }

    // Verify the Project belongs to the ATS Container Initiative (early check)
    const initiatives = await project.initiatives();
    const initiative = initiatives.nodes.find(
      init => init.id === orgConfig.atsContainerInitiativeId
    );

    if (!initiative) {
      console.log('Project does not belong to ATS Container Initiative, skipping enhancement');
      return;
    }

    // Get project labels
    const labels = await project.labels();
    const hasEnhanceLabel = labels.nodes.some(label => label.name === 'enhance');
    
    if (!hasEnhanceLabel) {
      console.log('Project does not have "enhance" label, skipping enhancement');
      return;
    }

    console.log('Project has "enhance" label, starting enhancement process');

    // Get the original content
    const originalContent = project.content || '';
    
    if (!originalContent) {
      console.error('Project has no content to enhance');
      return;
    }

    // Get tone of voice content
    const toneOfVoice = await getToneOfVoiceContent(initiative.id, client);

    // Enhance the job description with retry logic
    console.log('Calling AI enhancement...');
    const enhancedContent = await withRetry(
      () => enhanceJobDescription(originalContent, toneOfVoice),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );

    if (!enhancedContent) {
      console.error('AI enhancement returned no content');
      return;
    }

    console.log('AI enhancement completed, preparing to update project');

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
      console.log('Project enhancement completed successfully');
    } else {
      console.error('Failed to get or create ai-generated label');
    }
  } catch (error) {
    console.error('Error handling project change:', error);
  }
}

/**
 * Handle Issue creation events
 */
async function handleIssueCreation(event: any): Promise<void> {
  const issueId = event.data?.id;
  
  console.log('Issue created:', {
    issueId,
    projectId: event.data?.project?.id,
  });
  
  if (!issueId) {
    console.error('Missing issue ID in webhook event');
    return;
  }
  
  try {
    // Extract organization URL key from webhook event
    const orgUrlKey = event.url?.split('/')[3];
    
    if (!orgUrlKey) {
      console.error('Could not extract organization URL key from webhook event');
      return;
    }
    
    // Get organization config from Redis
    const orgConfig = await getOrgConfig(orgUrlKey);
    
    if (!orgConfig) {
      console.error('Organization config not found in Redis:', orgUrlKey);
      return;
    }
    
    // Trigger AI pre-screening
    const screeningResult = await triggerPreScreening(
      orgConfig.accessToken,
      issueId,
      orgConfig.atsContainerInitiativeId
    );
    
    if (screeningResult) {
      console.log('Pre-screening completed successfully:', {
        issueId,
        confidence: screeningResult.confidence,
        recommendedState: screeningResult.recommendedState,
      });
    } else {
      console.log('Pre-screening was not triggered for Issue:', issueId);
    }
  } catch (error) {
    // Handle errors gracefully - log and continue
    console.error('Error during Issue creation handling:', error);
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
      console.log('Unhandled webhook event type:', eventType);
  }
}

/**
 * POST /api/webhooks/linear
 * 
 * Receives and processes Linear webhook events
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get the raw body for signature verification
    const body = await request.text();
    
    // Get signature from headers
    const signature = request.headers.get('linear-signature');
    
    if (!signature) {
      console.error('Missing webhook signature or timestamp');
      return NextResponse.json(
        { error: 'Missing signature or timestamp' },
        { status: 401 }
      );
    }
    
    // Verify webhook signature
    if (!verifyWebhookSignature(body, signature, config.linear.webhookSecret)) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    
    // Parse the webhook payload
    const event = JSON.parse(body);
    
    // Route to appropriate handler
    await routeWebhookEvent(event);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
