/**
 * Server Actions for ElevenLabs Interview Sessions
 */

'use server';

import { createSignedUrl, getConversation, formatTranscript } from '@/lib/elevenlabs/client';
import {
  getScreeningSession,
  associateConversationId,
} from '@/lib/elevenlabs/session-secrets';
import { config } from '@/lib/config';
import { logger } from '@/lib/datadog/logger';
import { evaluateTranscript } from '@/lib/cerebras/transcript-evaluation';
import { createLinearClient } from '@/lib/linear/client';
import { addIssueComment } from '@/lib/linear/state-management';
import { getOrgConfig } from '@/lib/redis';
import { withRetry, isRetryableError } from '@/lib/utils/retry';

/**
 * Response from getInterviewSession
 */
export interface InterviewSessionResponse {
  success: boolean;
  signedUrl?: string;
  candidateName?: string;
  companyName?: string;
  jobDescription?: string;
  candidateApplication?: string;
  conversationPointers?: string;
  error?: string;
}

/**
 * Get interview session data and create a signed URL
 * 
 * @param secret - The secret from the URL
 * @returns Interview session data with signed URL
 */
export async function getInterviewSession(
  secret: string
): Promise<InterviewSessionResponse> {
  try {
    // Validate secret format
    if (!secret || secret.length < 20) {
      logger.warn('Invalid secret format', { secretLength: secret?.length });
      return {
        success: false,
        error: 'Invalid or expired interview link',
      };
    }

    // Get session data from Redis
    const sessionData = await getScreeningSession(secret);
    
    if (!sessionData) {
      logger.warn('Interview session not found', {
        secret: secret.substring(0, 8) + '...',
      });
      return {
        success: false,
        error: 'Interview session not found or expired',
      };
    }

    // Create signed URL for the agent
    const signedUrl = await createSignedUrl(config.elevenlabs.agentId);
    
    logger.info('Retrieved interview session successfully', {
      secret: secret.substring(0, 8) + '...',
      candidateName: sessionData.candidateName,
      linearOrg: sessionData.linearOrg,
      issueId: sessionData.issueId,
    });

    return {
      success: true,
      signedUrl,
      candidateName: sessionData.candidateName,
      companyName: sessionData.companyName,
      jobDescription: sessionData.jobDescription,
      candidateApplication: sessionData.candidateApplication,
      conversationPointers: sessionData.conversationPointers,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    
    logger.error('Failed to get interview session', err, {
      secret: secret?.substring(0, 8) + '...',
    });

    return {
      success: false,
      error: 'Failed to load interview session',
    };
  }
}

/**
 * Start an interview session by associating the conversation ID
 *
 * @param secret - The secret from the URL
 * @param conversationId - The ElevenLabs conversation ID
 * @param dynamicVariables - The dynamic variables passed to the agent
 */
export async function startInterviewSession(
  secret: string,
  conversationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate inputs
    if (!secret || !conversationId) {
      return {
        success: false,
        error: 'Missing required parameters',
      };
    }

    // Associate conversation ID with the session
    await associateConversationId(secret, conversationId);

    logger.info('Started interview session', {
      secret: secret.substring(0, 8) + '...',
      conversationId,
    });

    return { success: true };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error('Failed to start interview session', err, {
      secret: secret?.substring(0, 8) + '...',
      conversationId,
    });

    return {
      success: false,
      error: 'Failed to start interview session',
    };
  }
}

/**
 * Process interview completion when the conversation ends
 * Fetches transcript from ElevenLabs, evaluates it, and updates Linear issue
 *
 * @param secret - The secret from the URL
 */
export async function processInterviewCompletion(
  secret: string
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info('Processing interview completion', {
      secret: secret.substring(0, 8) + '...',
    });

    // Get session data from Redis
    const sessionData = await getScreeningSession(secret);

    if (!sessionData) {
      logger.error('Session not found for interview completion', undefined, {
        secret: secret.substring(0, 8) + '...',
      });
      return {
        success: false,
        error: 'Session not found or expired',
      };
    }

    // Check if conversation ID exists
    if (!sessionData.conversationId) {
      logger.error('No conversation ID associated with session', undefined, {
        secret: secret.substring(0, 8) + '...',
        issueId: sessionData.issueId,
      });
      return {
        success: false,
        error: 'No conversation found',
      };
    }

    const conversationId = sessionData.conversationId;

    // Fetch conversation from ElevenLabs
    logger.info('Fetching conversation from ElevenLabs', {
      conversationId,
      issueId: sessionData.issueId,
    });

    const conversation = await getConversation(conversationId);

    // Extract transcript
    const transcript = conversation.transcript;

    if (!transcript || transcript.length === 0) {
      logger.warn('No transcript found in conversation', {
        conversationId,
        issueId: sessionData.issueId,
      });
      return {
        success: false,
        error: 'No transcript available',
      };
    }

    // Format transcript
    const formattedTranscript = formatTranscript(transcript);

    logger.info('Transcript extracted from conversation', {
      conversationId,
      issueId: sessionData.issueId,
      transcriptLength: formattedTranscript.length,
      messageCount: transcript.length,
    });

    // Get Linear organization config
    const orgConfig = await getOrgConfig(sessionData.linearOrg);

    if (!orgConfig) {
      logger.error('Linear organization config not found', undefined, {
        conversationId,
        linearOrg: sessionData.linearOrg,
      });
      return {
        success: false,
        error: 'Organization config not found',
      };
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
      return {
        success: false,
        error: 'Linear issue not found',
      };
    }

    // Get candidate application from issue
    const candidateApplication = issue.description || '';

    // Evaluate transcript
    logger.info('Evaluating transcript', {
      conversationId,
      issueId: sessionData.issueId,
      transcriptLength: formattedTranscript.length,
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

    // Update Linear Issue state based on evaluation
    await updateIssueStateBasedOnEvaluation(
      client,
      issue,
      evaluation,
      orgConfig.accessToken
    );

    // Attach transcript to Linear Issue
    await attachTranscriptToIssue(
      client,
      sessionData.issueId,
      formattedTranscript,
      sessionData.candidateName,
      evaluation,
      orgConfig.accessToken
    );

    logger.info('Interview completion processing finished', {
      conversationId,
      issueId: sessionData.issueId,
      evaluationResult: evaluation.result,
    });

    return { success: true };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error('Failed to process interview completion', err, {
      secret: secret?.substring(0, 8) + '...',
    });

    return {
      success: false,
      error: err.message || 'Failed to process interview completion',
    };
  }
}

/**
 * Update Linear Issue state based on transcript evaluation
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

    if (evaluation.result === 'pass') {
      targetStateName = 'Done';

      logger.info('Evaluation passed, advancing candidate', {
        issueId: issue.id,
        targetState: targetStateName,
      });
    } else if (evaluation.result === 'fail') {
      targetStateName = 'Declined';

      logger.info('Evaluation failed, declining candidate', {
        issueId: issue.id,
        targetState: targetStateName,
      });
    } else {
      logger.info('Evaluation inconclusive, maintaining current state', {
        issueId: issue.id,
        currentState: (await issue.state)?.name,
      });

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
  }
}

/**
 * Attach transcript as file to Linear Issue with fallback to comment
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

    try {
      // Request upload URL from Linear
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

      // Upload file to the provided URL
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

      // Create attachment in Linear
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

      // Add comment with evaluation summary
      const summaryComment = `## AI Screening Interview Completed

**Evaluation Result:** ${evaluation.result.toUpperCase()} (${evaluation.confidence} confidence)

**Reasoning:** ${evaluation.reasoning}

**Key Points:**
${evaluation.keyPoints.map((point, i) => `${i + 1}. ${point}`).join('\n')}

The complete transcript has been attached to this issue.`;

      await addIssueComment(linearAccessToken, issueId, summaryComment);

      logger.info('Added evaluation summary comment', { issueId });
    } catch (attachmentError) {
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
  }
}
