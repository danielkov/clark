/**
 * Server Actions for Redis Config Management
 */

"use server";

import { getLinearClient } from './client';
import { getLinearTokens, getATSContainerInitiativeId } from './metadata';
import { storeOrgConfig, getOrgConfig } from '../redis';

/**
 * Check if Redis config exists and is valid (not expired)
 */
export async function checkRedisConfigStatus(orgName: string) {
  try {
    const config = await getOrgConfig(orgName);
    
    if (!config) {
      return {
        hasConfig: false,
        isExpired: false,
      };
    }

    // Check if token is expired (with 5 minute buffer)
    const isExpired = config.expiresAt < Date.now() + 5 * 60 * 1000;

    return {
      hasConfig: true,
      isExpired,
    };
  } catch (error) {
    console.error('Failed to check Redis config status:', error);
    return {
      hasConfig: false,
      isExpired: false,
    };
  }
}

export async function saveOrgConfigToRedis() {
  try {
    const { withAuth } = await import('@workos-inc/authkit-nextjs');
    const { user } = await withAuth();
    
    if (!user) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    // Get Linear client and tokens
    const client = await getLinearClient();
    const tokens = await getLinearTokens(user.id);

    if (!tokens) {
      return {
        success: false,
        error: 'Linear not connected',
      };
    }

    // Get organization info
    const organization = await client.organization;

    // Get ATS Container Initiative ID
    const atsContainerInitiativeId = await getATSContainerInitiativeId(user.id);

    if (!atsContainerInitiativeId) {
      return {
        success: false,
        error: 'ATS Container not configured. Please complete onboarding.',
      };
    }

    // Store full config in Redis
    await storeOrgConfig(organization.name, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      orgId: organization.id,
      orgName: organization.name,
      atsContainerInitiativeId,
    });

    return {
      success: true,
      orgId: organization.id,
      orgName: organization.name,
    };
  } catch (error) {
    console.error('Failed to save org config:', error);
    return {
      success: false,
      error: 'Failed to save organization configuration',
    };
  }
}
