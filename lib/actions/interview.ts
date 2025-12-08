/**
 * Server Actions for ElevenLabs Interview Sessions
 */

'use server';

import { createSignedUrl } from '@/lib/elevenlabs/client';
import { 
  getScreeningSession, 
  associateConversationId 
} from '@/lib/elevenlabs/session-secrets';
import { config } from '@/lib/config';
import { logger } from '@/lib/datadog/logger';

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
