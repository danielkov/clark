/**
 * Linear SDK Client
 * 
 * Provides authenticated Linear SDK client instances using WorkOS metadata
 */

import { LinearClient } from '@linear/sdk';
import { getLinearTokens, storeLinearTokens, isLinearTokenExpired } from './metadata';
import { refreshLinearToken } from './oauth';
import { withRetry, isRetryableError } from '../utils/retry';

/**
 * Get authenticated Linear client for current user
 * Automatically refreshes token if expired
 */
export async function getLinearClient(): Promise<LinearClient> {
  const { withAuth } = await import('@workos-inc/authkit-nextjs');
  const { user } = await withAuth();

  if (!user) {
    throw new Error('No active session');
  }

  // Get Linear tokens from WorkOS metadata
  const tokens = await getLinearTokens(user.id);

  if (!tokens) {
    throw new Error('Linear not connected. Please authorize Linear integration.');
  }

  // Check if token is expired and refresh if needed
  if (isLinearTokenExpired(tokens)) {
    try {
      // Retry token refresh with exponential backoff
      const { accessToken, refreshToken, expiresIn } = await withRetry(
        () => refreshLinearToken(tokens.refreshToken),
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
          shouldRetry: isRetryableError,
        }
      );

      // Calculate new expiry
      const expiresAt = Date.now() + expiresIn * 1000;

      // Update WorkOS metadata with new tokens
      await storeLinearTokens(user.id, {
        accessToken,
        refreshToken,
        expiresAt,
      });

      // Return client with new token
      return new LinearClient({
        accessToken,
      });
    } catch (error) {
      console.error('Failed to refresh Linear token:', error);
      throw new Error('Failed to refresh Linear authentication. Please re-authorize.');
    }
  }

  // Return client with current token
  return new LinearClient({
    accessToken: tokens.accessToken,
  });
}

/**
 * Get Linear client with specific access token (for testing or admin operations)
 */
export function createLinearClient(accessToken: string): LinearClient {
  console.log('[createLinearClient] Creating client with token');
  const client = new LinearClient({
    accessToken,
  });
  console.log('[createLinearClient] Client created');
  return client;
}

/**
 * Check if user has Linear connected
 */
export async function hasLinearConnected(): Promise<boolean> {
  try {
    const { withAuth } = await import('@workos-inc/authkit-nextjs');
    const { user } = await withAuth();
    if (!user) return false;
    
    const tokens = await getLinearTokens(user.id);
    return tokens !== null;
  } catch {
    return false;
  }
}

/**
 * Get Linear client using app credentials (for public/unauthenticated access)
 * This requires LINEAR_API_KEY to be set in environment variables
 */
export function getLinearAppClient(): LinearClient {
  const apiKey = process.env.LINEAR_API_KEY;
  
  if (!apiKey) {
    throw new Error('LINEAR_API_KEY not configured. Please add it to your environment variables.');
  }
  
  return new LinearClient({
    apiKey,
  });
}
