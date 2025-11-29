'use server';

/**
 * Server Actions for Linear Integration
 */

import { withAuth } from '@workos-inc/authkit-nextjs';
import { getLinearTokens, removeLinearTokens } from './metadata';
import { revokeLinearToken } from './oauth';

/**
 * Check if user has Linear connected
 */
export async function getLinearConnectionStatus() {
  const { user } = await withAuth();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  const tokens = await getLinearTokens(user.id);
  return { connected: tokens !== null };
}

/**
 * Disconnect Linear integration
 */
export async function disconnectLinear() {
  const { user } = await withAuth();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Get current tokens to revoke them
  const tokens = await getLinearTokens(user.id);
  
  if (tokens) {
    // Revoke the access token with Linear
    try {
      await revokeLinearToken(tokens.accessToken);
    } catch (error) {
      console.error('Failed to revoke Linear token:', error);
      // Continue with removal even if revocation fails
    }
  }

  // Remove tokens from WorkOS metadata
  await removeLinearTokens(user.id);

  return { success: true };
}
