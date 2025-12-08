/**
 * ElevenLabs Webhook Handler
 * 
 * Processes incoming ElevenLabs webhook events for completed screening sessions.
 * Handles conversation completion, transcript evaluation, and Linear Issue updates.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 10.2, 10.3, 10.4, 10.5
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  verifyElevenLabsWebhook, 
  parseWebhookEvent, 
  formatTranscript,
  ElevenLabsWebhookEvent 
} from '@/lib/elevenlabs/client';
import { getScreeningSessionByConversationId, ScreeningSessionData } from '@/lib/elevenlabs/session-secrets';
import { evaluateTranscript } from '@/lib/cerebras/transcript-evaluation';
import { createLinearClient } from '@/lib/linear/client';
import { addIssueComment } from '@/lib/linear/state-management';
import { getOrgConfig } from '@/lib/redis';
import { config } from '@/lib/config';
import { logger } from '@/lib/datadog/logger';
import { withRetry, isRetryableError } from '@/lib/utils/retry';

/**
 * POST /api/webhooks/elevenlabs
 * 
 * Handles ElevenLabs webhook events for screening session completion
 * Requirements: 7.1, 10.2, 10.3, 10.4, 10.5
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    
    // Get signature from headers (Requirement 10.2)
    const signature = request.headers.get('x-elevenlabs-signature');
    
    if (!signature) {
      logger.warn('Missing ElevenLabs webhook signature', {
        headers: Object.fromEntries(request.headers.entries()),
      });
      return NextResponse.json(
        { error: 'Missing webhook signature' },
        { status: 401 }
      );
    }
    
    // Verify webhook signature using ElevenLabs SDK (Requirement 10.2)
    let event: ElevenLabsWebhookEvent;
    try {
      event = await verifyElevenLabsWebhook(
        body,
        signature,
        config.elevenlabs.webhookSecret
      );
      
      logger.info('ElevenLabs webhook signature verified', {
        eventType: event.type,
        conversationId: event.data?.conversation_id,
      });
    } catch (verificationError) {
      // Invalid signature - log security event and reject (Requirement 10.3, 10.4)
      logger.error(
        'ElevenLabs webhook signature verification failed',
        verificationError instanceof Error ? verificationError : new Error(String(verificationError)),
        {
          signature: signature.substring(0, 20) + '...',
        }
      );
      
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }
    
    // Parse and validate webhook event
    try {
      event = parseWebhookEvent(body);
    } catch (parseError) {
      // Malformed payload - log and reject (Requirement 10.3, 10.4)
      logger.error(
        'Failed to parse ElevenLabs webhook payload',
        parseError instanceof Error ? parseError : new Error(String(parseError))
      );
      
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      );
    }
    
    // Route to appropriate handler based on event type
    if (event.type === 'conversation.completed') {
      await handleConversationCompleted(event);
    } else {
      logger.info('Ignoring non-completion event', {
        eventType: event.type,
        conversationId: event.data?.conversation_id,
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorType = err.name;
    
    // Log error with full context (Requirement 10.3)
    logger.error(
      'ElevenLabs webhook processing error',
      err,
      {
        errorType,
        errorMessage: err.message,
        errorStack: err.stack,
      }
    );
    
    // Determine if error is retryable (Requirement 10.5)
    // Return 500 for transient errors (network, timeout, etc.) to trigger retry
    // Return 400 for permanent errors (validation, etc.) to prevent retry
    const isTransientError = 
      err.message.includes('timeout') ||
      err.message.includes('network') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('ETIMEDOUT') ||
      err.message.includes('service unavailable') ||
      err.message.includes('Redis') ||
      err.message.includes('Linear');
    
    if (isTransientError) {
      logger.info('Returning 500 for transient error to allow retry', {
        errorType,
      });
      
      return NextResponse.json(
        { error: 'Internal server error', retryable: true },
        { status: 500 }
      );
    }
    
    // Permanent error - return 400 to prevent retry
    logger.info('Returning 400 for permanent error to prevent retry', {
      errorType,
    });
    
    return NextResponse.json(
      { error: 'Bad request', retryable: false },
      { status: 400 }
    );
  }
}

/**
 * Handle conversation completed events
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5
 */
async function handleConversationCompleted(
  event: ElevenLabsWebhookEvent
): Promise<void> {
  const conversationId = event.data.conversation_id;
  
  logger.info('Processing conversation completed event', {
    conversationId,
    agentId: event.data.agent_id,
    durationSeconds: event.data.duration_seconds,
  });
  
  // Extract transcript from webhook payload (Requirement 7.1)
  const transcript = event.data.transcript;
  
  if (!transcript || transcript.length === 0) {
    logger.warn('No transcript in conversation completed event', {
      conversationId,
    });
    return;
  }
  
  // Format transcript for storage and evaluation
  const formattedTranscript = formatTranscript(transcript);
  
  logger.info('Transcript extracted from webhook', {
    conversationId,
    transcriptLength: formattedTranscript.length,
    messageCount: transcript.length,
  });
  
  // Retrieve session metadata from Redis using conversation ID (Requirement 7.1)
  const sessionData = await getScreeningSessionByConversationId(conversationId);
  
  if (!sessionData) {
    // Orphaned transcript - log and notify (Requirement 8.5)
    logger.error('Orphaned transcript: no matching session found for conversation ID', undefined, {
      conversationId,
      agentId: event.data.agent_id,
    });
    
    // TODO: Notify administrators about orphaned transcript
    // This could be done via email, Slack, or other notification system
    // In production, consider:
    // 1. Sending email to admin team
    // 2. Creating a Slack notification
    // 3. Storing orphaned transcripts in a separate Redis key for manual review
    
    return;
  }
  
  logger.info('Retrieved session metadata from Redis', {
    conversationId,
    issueId: sessionData.issueId,
    linearOrg: sessionData.linearOrg,
  });
  
  // Get Linear organization config
  const orgConfig = await getOrgConfig(sessionData.linearOrg);
  
  if (!orgConfig) {
    logger.error('Linear organization config not found', undefined, {
      conversationId,
      linearOrg: sessionData.linearOrg,
    });
    return;
  }
  
  // Create Linear client
  const client = createLinearClient(orgConfig.accessToken);
  
  // Fetch the issue
  const issue = await client.issue(sessionData.issueId);
  
  if (!issue) {
    logger.error('Linear Issue not found', undefined, {
      conversationId,
      issueId: sessionData.issueId,
    });
    return;
  }
  
  // Get candidate application from issue
  const candidateApplication = issue.description || '';
  
  // Evaluate transcript using Cerebras (Requirement 7.2)
  logger.info('Evaluating transcript', {
    conversationId,
    issueId: sessionData.issueId,
    transcriptLength: formattedTranscript.length,
    jobDescriptionLength: sessionData.jobDescription.length,
  });
  
  const evaluation = await evaluateTranscript(
    formattedTranscript,
    sessionData.jobDescription,
    candidateApplication,
    orgConfig.orgId
  );
  
  logger.info('Transcript evaluation completed', {
    conversationId,
    issueId: sessionData.issueId,
    result: evaluation.result,
    confidence: evaluation.confidence,
    keyPointsCount: evaluation.keyPoints.length,
  });
  
  // Update Linear Issue state based on evaluation (Requirements 7.3, 7.4, 7.5)
  await updateIssueStateBasedOnEvaluation(
    client,
    issue,
    evaluation,
    orgConfig.accessToken
  );
  
  // Attach transcript as file to Linear Issue (Requirement 8.1, 8.4)
  await attachTranscriptToIssue(
    client,
    sessionData.issueId,
    formattedTranscript,
    sessionData.candidateName,
    evaluation,
    orgConfig.accessToken
  );
  
  // Note: Session cleanup is handled automatically by Redis TTL
  // The session will expire after 7 days
  
  logger.info('Conversation completed processing finished', {
    conversationId,
    issueId: sessionData.issueId,
    evaluationResult: evaluation.result,
  });
}

/**
 * Update Linear Issue state based on transcript evaluation
 * Requirements: 7.3, 7.4, 7.5
 */
async function updateIssueStateBasedOnEvaluation(
  client: ReturnType<typeof createLinearClient>,
  issue: any,
  evaluation: { result: 'pass' | 'fail' | 'inconclusive'; reasoning: string; confidence: string; keyPoints: string[] },
  linearAccessToken: string
): Promise<void> {
  try {
    const team = await issue.team;
    
    if (!team) {
      logger.error('Issue team not found', undefined, { issueId: issue.id });
      return;
    }
    
    const states = await team.states();
    
    let targetStateName: string | null = null;
    
    // Determine target state based on evaluation result
    if (evaluation.result === 'pass') {
      // Advance to next stage (Requirement 7.3)
      // Move from "In Progress" to next stage (could be "Done" or custom state)
      // For now, we'll look for a state that indicates progression
      targetStateName = 'Done'; // Or find the next workflow state
      
      logger.info('Evaluation passed, advancing candidate', {
        issueId: issue.id,
        targetState: targetStateName,
      });
    } else if (evaluation.result === 'fail') {
      // Move to rejected state (Requirement 7.4)
      targetStateName = 'Declined';
      
      logger.info('Evaluation failed, declining candidate', {
        issueId: issue.id,
        targetState: targetStateName,
      });
    } else {
      // Inconclusive - maintain current state (Requirement 7.5)
      logger.info('Evaluation inconclusive, maintaining current state', {
        issueId: issue.id,
        currentState: (await issue.state)?.name,
      });
      
      // Don't change state, just add comment
      return;
    }
    
    // Find the target state
    const targetState = states.nodes.find((s: any) => s.name === targetStateName);
    
    if (!targetState) {
      logger.warn('Target state not found, maintaining current state', {
        issueId: issue.id,
        targetStateName,
        availableStates: states.nodes.map((s: any) => s.name),
      });
      return;
    }
    
    // Update issue state
    await withRetry(
      () => client.updateIssue(issue.id, {
        stateId: targetState.id,
      }),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );
    
    logger.info('Issue state updated based on evaluation', {
      issueId: issue.id,
      newState: targetStateName,
      evaluationResult: evaluation.result,
    });
  } catch (error) {
    logger.error(
      'Failed to update issue state',
      error instanceof Error ? error : new Error(String(error)),
      {
        issueId: issue.id,
        evaluationResult: evaluation.result,
      }
    );
    
    // Don't throw - we still want to attach the transcript
  }
}

/**
 * Attach transcript as file to Linear Issue with fallback to comment
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */
async function attachTranscriptToIssue(
  client: ReturnType<typeof createLinearClient>,
  issueId: string,
  transcript: string,
  candidateName: string,
  evaluation: { result: string; reasoning: string; confidence: string; keyPoints: string[] },
  linearAccessToken: string
): Promise<void> {
  try {
    // Create transcript file content
    const transcriptContent = `AI Screening Interview Transcript
Candidate: ${candidateName}
Date: ${new Date().toISOString()}

=== EVALUATION SUMMARY ===
Result: ${evaluation.result.toUpperCase()}
Confidence: ${evaluation.confidence}
Reasoning: ${evaluation.reasoning}

Key Points:
${evaluation.keyPoints.map((point, i) => `${i + 1}. ${point}`).join('\n')}

=== TRANSCRIPT ===

${transcript}
`;
    
    // Convert transcript to a Blob/File for upload
    const transcriptBlob = new Blob([transcriptContent], { type: 'text/plain' });
    const transcriptFile = new File(
      [transcriptBlob],
      `${candidateName.replace(/\s+/g, '_')}_screening_transcript.txt`,
      { type: 'text/plain' }
    );
    
    logger.info('Attempting to attach transcript as file', {
      issueId,
      fileName: transcriptFile.name,
      fileSize: transcriptFile.size,
    });
    
    // Try to upload transcript as file attachment (Requirement 8.1, 8.4)
    try {
      // Step 1: Request upload URL from Linear
      const uploadPayload = await withRetry(
        () => client.fileUpload(
          transcriptFile.type,
          transcriptFile.name,
          transcriptFile.size
        ),
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
          shouldRetry: isRetryableError,
        }
      );
      
      if (!uploadPayload.success || !uploadPayload.uploadFile) {
        throw new Error('Failed to get upload URL from Linear');
      }
      
      const { uploadUrl, assetUrl, headers } = uploadPayload.uploadFile;
      
      // Step 2: Upload file to the provided URL
      const arrayBuffer = await transcriptFile.arrayBuffer();
      
      const headerObj: Record<string, string> = {
        'Content-Type': transcriptFile.type,
      };
      
      if (headers && headers.length > 0) {
        headers.forEach((header: any) => {
          headerObj[header.key] = header.value;
        });
      }
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: headerObj,
        body: arrayBuffer,
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`File upload failed: ${uploadResponse.status} - ${errorText}`);
      }
      
      // Step 3: Create attachment in Linear
      const attachmentPayload = await withRetry(
        () => client.createAttachment({
          issueId,
          title: `AI Screening Transcript - ${candidateName}`,
          url: assetUrl,
          subtitle: `${transcriptFile.name} (${(transcriptFile.size / 1024).toFixed(2)} KB)`,
        }),
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
          shouldRetry: isRetryableError,
        }
      );
      
      if (!attachmentPayload.success) {
        throw new Error('Failed to create attachment in Linear');
      }
      
      logger.info('Transcript attached as file successfully', {
        issueId,
        fileName: transcriptFile.name,
      });
      
      // Add comment with evaluation summary (Requirement 8.2)
      const summaryComment = `## AI Screening Interview Completed

**Evaluation Result:** ${evaluation.result.toUpperCase()} (${evaluation.confidence} confidence)

**Reasoning:** ${evaluation.reasoning}

**Key Points:**
${evaluation.keyPoints.map((point, i) => `${i + 1}. ${point}`).join('\n')}

The complete transcript has been attached to this issue.`;
      
      await addIssueComment(linearAccessToken, issueId, summaryComment);
      
      logger.info('Added evaluation summary comment', { issueId });
    } catch (attachmentError) {
      // Fallback to comment if attachment fails (Requirement 8.3)
      logger.warn(
        'Failed to attach transcript as file, falling back to comment',
        {
          issueId,
          error: attachmentError instanceof Error ? attachmentError.message : String(attachmentError),
        }
      );
      
      // Add transcript as comment instead
      const fallbackComment = `## AI Screening Interview Completed

**Evaluation Result:** ${evaluation.result.toUpperCase()} (${evaluation.confidence} confidence)

**Reasoning:** ${evaluation.reasoning}

**Key Points:**
${evaluation.keyPoints.map((point, i) => `${i + 1}. ${point}`).join('\n')}

---

**Full Transcript:**

${transcript}

---

*Note: Transcript could not be attached as a file and was added as a comment instead.*`;
      
      await addIssueComment(linearAccessToken, issueId, fallbackComment);
      
      logger.info('Added transcript as comment (fallback)', { issueId });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    
    logger.error(
      'Failed to attach transcript to issue',
      err,
      { 
        issueId,
        errorType: err.name,
        errorMessage: err.message,
      }
    );
    
    // Don't throw - we've done our best to preserve the transcript
    // The transcript is either attached as a file or added as a comment
  }
}
