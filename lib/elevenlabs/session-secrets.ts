/**
 * ElevenLabs Session Secret Management
 * 
 * Manages secure session secrets for ElevenLabs screening interviews.
 * Secrets are stored in Redis and used to securely pass context to the interview page.
 */

import { redis } from '@/lib/redis';
import { logger } from '@/lib/datadog/logger';
import { randomBytes } from 'crypto';

/**
 * Session data stored in Redis for each screening interview
 */
export interface ScreeningSessionData {
  linearOrg: string;
  issueId: string;
  candidateName: string;
  candidateEmail: string;
  companyName: string;
  jobDescription: string;
  candidateApplication: string;
  conversationPointers: string;
  createdAt: string;
  expiresAt: string;
  conversationId?: string; // Set when the conversation starts
}

/**
 * Generate a cryptographically secure random secret
 * 
 * @returns A URL-safe base64 encoded secret (32 bytes = 43 chars)
 */
export function generateSecret(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Store screening session data in Redis with a secure secret
 * 
 * @param data - Session data to store
 * @returns The generated secret key
 */
export async function createScreeningSession(
  data: Omit<ScreeningSessionData, 'createdAt' | 'expiresAt'>
): Promise<string> {
  const secret = generateSecret();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  const sessionData: ScreeningSessionData = {
    ...data,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  
  const key = `screening:secret:${secret}`;
  
  // Store with TTL of 7 days (in seconds)
  await redis.set(key, sessionData, { ex: 7 * 24 * 60 * 60 });
  
  logger.info('Created screening session secret', {
    secret: secret.substring(0, 8) + '...',
    linearOrg: data.linearOrg,
    issueId: data.issueId,
    candidateName: data.candidateName,
    expiresAt: expiresAt.toISOString(),
  });
  
  return secret;
}

/**
 * Retrieve screening session data by secret
 * 
 * @param secret - The secret key
 * @returns Session data or null if not found/expired
 */
export async function getScreeningSession(
  secret: string
): Promise<ScreeningSessionData | null> {
  const key = `screening:secret:${secret}`;
  const data = await redis.get<ScreeningSessionData>(key);
  
  if (!data) {
    logger.warn('Screening session not found', {
      secret: secret.substring(0, 8) + '...',
    });
    return null;
  }
  
  // Check if expired
  const now = new Date();
  const expiresAt = new Date(data.expiresAt);
  
  if (now > expiresAt) {
    logger.warn('Screening session expired', {
      secret: secret.substring(0, 8) + '...',
      expiresAt: data.expiresAt,
    });
    await redis.del(key);
    return null;
  }
  
  return data;
}

/**
 * Associate a conversation ID with a screening session
 * 
 * @param secret - The secret key
 * @param conversationId - The ElevenLabs conversation ID
 */
export async function associateConversationId(
  secret: string,
  conversationId: string
): Promise<void> {
  const key = `screening:secret:${secret}`;
  const data = await redis.get<ScreeningSessionData>(key);
  
  if (!data) {
    throw new Error('Screening session not found');
  }
  
  data.conversationId = conversationId;
  
  // Update with same TTL
  const expiresAt = new Date(data.expiresAt);
  const now = new Date();
  const ttlSeconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
  
  await redis.set(key, data, { ex: ttlSeconds });
  
  // Also create a reverse lookup: conversationId -> secret
  const reverseKey = `screening:conversation:${conversationId}`;
  await redis.set(reverseKey, secret, { ex: ttlSeconds });
  
  logger.info('Associated conversation ID with screening session', {
    secret: secret.substring(0, 8) + '...',
    conversationId,
    linearOrg: data.linearOrg,
    issueId: data.issueId,
  });
}

/**
 * Get screening session by conversation ID
 * 
 * @param conversationId - The ElevenLabs conversation ID
 * @returns Session data or null if not found
 */
export async function getScreeningSessionByConversationId(
  conversationId: string
): Promise<ScreeningSessionData | null> {
  const reverseKey = `screening:conversation:${conversationId}`;
  const secret = await redis.get<string>(reverseKey);
  
  if (!secret) {
    logger.warn('No screening session found for conversation ID', {
      conversationId,
    });
    return null;
  }
  
  return getScreeningSession(secret);
}

/**
 * Delete a screening session
 * 
 * @param secret - The secret key
 */
export async function deleteScreeningSession(secret: string): Promise<void> {
  const key = `screening:secret:${secret}`;
  const data = await redis.get<ScreeningSessionData>(key);
  
  if (data?.conversationId) {
    // Delete reverse lookup
    const reverseKey = `screening:conversation:${data.conversationId}`;
    await redis.del(reverseKey);
  }
  
  await redis.del(key);
  
  logger.info('Deleted screening session', {
    secret: secret.substring(0, 8) + '...',
  });
}
