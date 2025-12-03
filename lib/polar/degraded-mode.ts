/**
 * Degraded Mode for Polar API Failures
 * 
 * Implements fallback behavior when Polar API is unavailable, allowing
 * limited operations with Free tier limits and automatic recovery attempts.
 * 
 * Requirements: 9.3
 */

import { logger } from '../datadog/logger';
import { redis } from '../redis';
import { getTiers } from './subscription';
import { getCustomerState } from './client';
import { MeterName } from '../../types/polar';
import { setDegradedMode, isDegradedMode, clearDegradedMode } from './redis-storage';

/**
 * Degraded mode state for an organization
 */
export interface DegradedModeState {
  inDegradedMode: boolean;
  since?: Date;
  reason?: string;
  freeTierLimits: {
    jobDescriptions: number;
    candidateScreenings: number;
  };
}

/**
 * Degraded mode balance check result
 */
export interface DegradedModeBalance {
  allowed: boolean;
  balance: number;
  limit: number;
  degraded: true;
  reason: string;
}

/**
 * Get Free tier limits for degraded mode fallback
 * Requirements: 9.3
 * 
 * @returns Free tier allowances
 */
export function getFreeTierLimits(): {
  jobDescriptions: number;
  candidateScreenings: number;
} {
  const tiers = getTiers();
  const freeTier = tiers.find((t) => t.id === 'free');

  if (!freeTier) {
    logger.error('Free tier not found in tier definitions', new Error('Free tier not configured'));
    // Fallback to hardcoded values if tier definition is missing
    return {
      jobDescriptions: 10,
      candidateScreenings: 50,
    };
  }

  return {
    jobDescriptions: freeTier.allowances.jobDescriptions ?? 10,
    candidateScreenings: freeTier.allowances.candidateScreenings ?? 50,
  };
}

/**
 * Get degraded mode state for an organization
 * Requirements: 9.3
 * 
 * @param linearOrgId - Linear organization ID
 * @returns Degraded mode state with Free tier limits
 */
export async function getDegradedModeState(
  linearOrgId: string
): Promise<DegradedModeState> {
  try {
    const inDegradedMode = await isDegradedMode(linearOrgId);
    const freeTierLimits = getFreeTierLimits();

    if (!inDegradedMode) {
      return {
        inDegradedMode: false,
        freeTierLimits,
      };
    }

    // Get timestamp from Redis
    const key = `degraded_mode:${linearOrgId}`;
    const timestamp = await redis.get<number>(key);

    return {
      inDegradedMode: true,
      since: timestamp ? new Date(timestamp) : undefined,
      reason: 'Polar API query failed',
      freeTierLimits,
    };
  } catch (error) {
    logger.error('Failed to get degraded mode state', error as Error, {
      linearOrgId,
    });

    // Return safe default
    return {
      inDegradedMode: false,
      freeTierLimits: getFreeTierLimits(),
    };
  }
}

/**
 * Check meter balance in degraded mode using Free tier limits
 * Requirements: 9.3
 * 
 * @param linearOrgId - Linear organization ID
 * @param meterName - Meter name to check
 * @returns Degraded mode balance check result
 */
export async function checkDegradedModeBalance(
  linearOrgId: string,
  meterName: MeterName
): Promise<DegradedModeBalance> {
  const freeTierLimits = getFreeTierLimits();
  const limit =
    meterName === 'job_descriptions'
      ? freeTierLimits.jobDescriptions
      : freeTierLimits.candidateScreenings;

  try {
    logger.info('Checking balance in degraded mode', {
      linearOrgId,
      meterName,
      freeTierLimit: limit,
    });

    // Track usage locally in Redis during degraded mode
    const key = `degraded_meter:${linearOrgId}:${meterName}`;
    const consumed = (await redis.get<number>(key)) ?? 0;
    const balance = Math.max(0, limit - consumed);
    const allowed = balance > 0;

    logger.info('Degraded mode balance check complete', {
      linearOrgId,
      meterName,
      consumed,
      balance,
      limit,
      allowed,
    });

    return {
      allowed,
      balance,
      limit,
      degraded: true,
      reason: 'Operating with Free tier limits due to Polar API unavailability',
    };
  } catch (error) {
    logger.error('Failed to check degraded mode balance', error as Error, {
      linearOrgId,
      meterName,
    });

    // On error, deny operation to be safe
    return {
      allowed: false,
      balance: 0,
      limit,
      degraded: true,
      reason: 'Unable to verify balance in degraded mode',
    };
  }
}

/**
 * Record usage in degraded mode (local Redis tracking)
 * Requirements: 9.3
 * 
 * @param linearOrgId - Linear organization ID
 * @param meterName - Meter name to increment
 */
export async function recordDegradedModeUsage(
  linearOrgId: string,
  meterName: MeterName
): Promise<void> {
  const key = `degraded_meter:${linearOrgId}:${meterName}`;

  try {
    logger.info('Recording usage in degraded mode', {
      linearOrgId,
      meterName,
    });

    // Increment local counter
    const newValue = await redis.incr(key);

    // Set TTL to 30 days (billing cycle)
    await redis.expire(key, 30 * 24 * 60 * 60);

    logger.info('Degraded mode usage recorded', {
      linearOrgId,
      meterName,
      totalConsumed: newValue,
    });
  } catch (error) {
    logger.error('Failed to record degraded mode usage', error as Error, {
      linearOrgId,
      meterName,
    });
    // Don't throw - we don't want to block operations
  }
}

/**
 * Attempt to recover from degraded mode by testing Polar API
 * Requirements: 9.3
 * 
 * @param linearOrgId - Linear organization ID
 * @returns True if recovery successful, false otherwise
 */
export async function attemptRecovery(linearOrgId: string): Promise<boolean> {
  try {
    logger.info('Attempting recovery from degraded mode', {
      linearOrgId,
    });

    // Try to fetch customer state from Polar
    await getCustomerState(linearOrgId);

    // If successful, clear degraded mode flag
    await clearDegradedMode(linearOrgId);

    logger.info('Successfully recovered from degraded mode', {
      linearOrgId,
    });

    return true;
  } catch (error) {
    logger.warn('Recovery attempt failed, remaining in degraded mode', {
      linearOrgId,
      error: (error as Error).message,
    });

    // Refresh the degraded mode TTL for another 5 minutes
    await setDegradedMode(linearOrgId);

    return false;
  }
}

/**
 * Enable degraded mode for an organization after API failure
 * Requirements: 9.3
 * 
 * @param linearOrgId - Linear organization ID
 * @param reason - Reason for entering degraded mode
 */
export async function enableDegradedMode(
  linearOrgId: string,
  reason: string
): Promise<void> {
  try {
    logger.warn('Enabling degraded mode', {
      linearOrgId,
      reason,
    });

    await setDegradedMode(linearOrgId);

    logger.info('Degraded mode enabled', {
      linearOrgId,
      expiresIn: '5 minutes',
    });
  } catch (error) {
    logger.error('Failed to enable degraded mode', error as Error, {
      linearOrgId,
    });
    // Don't throw - degraded mode is a fallback mechanism
  }
}

/**
 * Check if organization should display degraded mode warning banner
 * Requirements: 9.3
 * 
 * @param linearOrgId - Linear organization ID
 * @returns True if warning banner should be displayed
 */
export async function shouldShowWarningBanner(
  linearOrgId: string
): Promise<boolean> {
  try {
    return await isDegradedMode(linearOrgId);
  } catch (error) {
    logger.error('Failed to check warning banner status', error as Error, {
      linearOrgId,
    });
    return false;
  }
}

/**
 * Get warning banner message for degraded mode
 * Requirements: 9.3
 * 
 * @param linearOrgId - Linear organization ID
 * @returns Warning message or null if not in degraded mode
 */
export async function getWarningBannerMessage(
  linearOrgId: string
): Promise<string | null> {
  const state = await getDegradedModeState(linearOrgId);

  if (!state.inDegradedMode) {
    return null;
  }

  const { jobDescriptions, candidateScreenings } = state.freeTierLimits;

  return `Service temporarily operating with limited capacity. You have ${jobDescriptions} job descriptions and ${candidateScreenings} candidate screenings available. We're working to restore full service.`;
}

/**
 * Schedule automatic recovery attempts every 5 minutes
 * This should be called by a background job or cron task
 * Requirements: 9.3
 * 
 * @param linearOrgId - Linear organization ID
 */
export async function scheduleRecoveryAttempt(
  linearOrgId: string
): Promise<void> {
  const inDegradedMode = await isDegradedMode(linearOrgId);

  if (!inDegradedMode) {
    logger.info('Not in degraded mode, skipping recovery attempt', {
      linearOrgId,
    });
    return;
  }

  logger.info('Scheduling recovery attempt', {
    linearOrgId,
  });

  // Attempt recovery
  const recovered = await attemptRecovery(linearOrgId);

  if (recovered) {
    logger.info('Recovery successful, degraded mode cleared', {
      linearOrgId,
    });
  } else {
    logger.info('Recovery failed, will retry in 5 minutes', {
      linearOrgId,
    });
  }
}

/**
 * Clear degraded mode usage tracking (for reconciliation)
 * 
 * @param linearOrgId - Linear organization ID
 */
export async function clearDegradedModeUsage(
  linearOrgId: string
): Promise<void> {
  try {
    logger.info('Clearing degraded mode usage tracking', {
      linearOrgId,
    });

    const jobDescKey = `degraded_meter:${linearOrgId}:job_descriptions`;
    const candidateKey = `degraded_meter:${linearOrgId}:candidate_screenings`;

    await redis.del(jobDescKey);
    await redis.del(candidateKey);

    logger.info('Degraded mode usage tracking cleared', {
      linearOrgId,
    });
  } catch (error) {
    logger.error('Failed to clear degraded mode usage', error as Error, {
      linearOrgId,
    });
  }
}
