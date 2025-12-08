/**
 * ElevenLabs Client Service
 * 
 * Handles all ElevenLabs API interactions for AI-powered voice screening interviews.
 * Uses the official ElevenLabs JS SDK for agent session management and webhook verification.
 */

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { config } from '@/lib/config';
import { logger } from '@/lib/datadog/logger';

// Initialize ElevenLabs client
const elevenlabs = new ElevenLabsClient({
  apiKey: config.elevenlabs.apiKey,
});

/**
 * Dynamic variables that can be passed to the ElevenLabs agent
 * These variables are defined in the agent's system prompt and first message
 */
export interface AgentSessionVariables {
  company_name: string;
  candidate_name: string;
  job_description: string;
  job_application: string;
  conversation_pointers: string;
}

/**
 * Get agent details to verify agent exists and get configuration
 * 
 * @param agentId - The ElevenLabs agent ID
 * @returns Agent configuration details
 */
export async function getAgent(agentId: string) {
  try {
    const agent = await elevenlabs.conversationalAi.agents.get(agentId);
    logger.info('Retrieved ElevenLabs agent', { agentId });
    return agent;
  } catch (error) {
    logger.error('Failed to get ElevenLabs agent', error as Error, { agentId });
    throw new Error(`Failed to get agent: ${(error as Error).message}`);
  }
}

/**
 * Create a signed URL for an ElevenLabs agent session
 * 
 * This creates a secure, time-limited signed URL that can be used to start
 * a conversation with the agent. The signed URL is used client-side with
 * the @11labs/react library.
 * 
 * @param agentId - The ElevenLabs agent ID
 * @returns Signed URL response
 * @throws Error if API call fails
 */
export async function createSignedUrl(agentId: string): Promise<string> {
  try {
    if (!agentId || agentId.trim() === '') {
      throw new Error('Agent ID is required and cannot be empty');
    }

    const response = await elevenlabs.conversationalAi.conversations.getSignedUrl({ agentId });

    return response.signedUrl;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    
    logger.error('Failed to create signed URL', err, {
      agentId,
      errorType: err.name,
    });
    
    throw new Error(`Failed to create signed URL: ${err.message}`);
  }
}

/**
 * Verify webhook signature using ElevenLabs SDK
 * 
 * ElevenLabs uses standard webhook signature verification to ensure
 * that webhook events are genuinely from ElevenLabs.
 * 
 * @param payload - Raw webhook payload as string
 * @param signature - Signature from webhook headers
 * @param secret - Webhook secret from environment
 * @returns Parsed and verified webhook event
 * @throws Error if signature is invalid
 */
export async function verifyElevenLabsWebhook(
  payload: string,
  signature: string,
  secret: string
): Promise<any> {
  try {
    // Use the ElevenLabs SDK's constructEvent method for webhook verification
    const event = await elevenlabs.webhooks.constructEvent(
      payload,
      signature,
      secret
    );
    
    logger.info('Verified ElevenLabs webhook', {
      eventType: event.type,
      conversationId: event.data?.conversation_id,
    });

    return event;
  } catch (error) {
    logger.error('Webhook signature verification failed', error as Error);
    throw new Error('Invalid webhook signature');
  }
}

/**
 * ElevenLabs webhook event types
 */
export interface ElevenLabsWebhookEvent {
  type: 'conversation.completed' | 'conversation.started' | 'conversation.error';
  data: {
    conversation_id: string;
    agent_id: string;
    transcript?: Array<{
      role: 'agent' | 'user';
      message: string;
      timestamp: string;
    }>;
    duration_seconds?: number;
    ended_at?: string;
    metadata?: Record<string, any>;
  };
}

/**
 * Parse and validate ElevenLabs webhook event
 * 
 * @param payload - Raw webhook payload
 * @returns Typed webhook event
 */
export function parseWebhookEvent(payload: string): ElevenLabsWebhookEvent {
  try {
    const event = JSON.parse(payload) as ElevenLabsWebhookEvent;

    // Validate required fields
    if (!event.type || !event.data) {
      throw new Error('Invalid webhook event structure');
    }

    if (!event.data.conversation_id || !event.data.agent_id) {
      throw new Error('Missing required event data fields');
    }

    return event;
  } catch (error) {
    logger.error('Failed to parse webhook event', error as Error);
    throw new Error(`Invalid webhook payload: ${(error as Error).message}`);
  }
}

/**
 * Format transcript for display or storage
 * 
 * @param transcript - Array of transcript messages
 * @returns Formatted transcript string
 */
export function formatTranscript(
  transcript: Array<{
    role: 'agent' | 'user';
    message: string;
    timestamp: string;
  }>
): string {
  return transcript
    .map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const speaker = entry.role === 'agent' ? 'AI Interviewer' : 'Candidate';
      return `[${time}] ${speaker}: ${entry.message}`;
    })
    .join('\n\n');
}
