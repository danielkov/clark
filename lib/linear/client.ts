/**
 * Linear SDK Client
 * 
 * Provides authenticated Linear SDK client instances
 */

import { LinearClient } from '@linear/sdk';
import { getSession, updateSession, isLinearTokenExpired } from '../auth/session';
import { refreshLinearToken } from './oauth';

/**
 * Get authenticated Linear client for current user
 * Automatically refreshes token if expired
 */
export async function getLinearClient(): Promise<LinearClient> {
  const session = await getSession();

  if (!session) {
    throw new Error('No active session');
  }

  if (!session.linearAccessToken) {
    throw new Error('Linear not connected. Please authorize Linear integration.');
  }

  // Check if token is expired and refresh if needed
  if (isLinearTokenExpired(session)) {
    if (!session.linearRefreshToken) {
      throw new Error('Linear token expired and no refresh token available');
    }

    try {
      const { accessToken, refreshToken, expiresIn } = await refreshLinearToken(
        session.linearRefreshToken
      );

      // Update session with new tokens
      await updateSession({
        linearAccessToken: accessToken,
        linearRefreshToken: refreshToken,
        linearTokenExpiry: Date.now() + expiresIn * 1000,
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
    accessToken: session.linearAccessToken,
  });
}

/**
 * Get Linear client with specific access token (for testing or admin operations)
 */
export function createLinearClient(accessToken: string): LinearClient {
  return new LinearClient({
    accessToken,
  });
}
