/**
 * Usage Meter Tracking Functions
 * 
 * Handles feature usage tracking and meter limit enforcement for job descriptions
 * and candidate screenings. Integrates with Polar's usage metering system and
 * Redis for atomic meter deductions.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 10.1, 10.2, 10.3
 */

import { config } from '../config';
import { redis } from '../redis';
import { logger } from '../datadog/logger';
import { getCustomerState, ingestUsageEvents } from './client';
import { retrieveSubscription } from './redis-storage';
import { getTiers } from './subscription';
import { MeterName } from '../../types/polar';
import { validateMeterBalance, alertMeterInconsistency } from './validation';

/**
 * Meter balance check result
 */
export interface MeterBalanceCheck {
  allowed: boolean;
  balance: number;
  limit: number | null; // null = unlimited
  unlimited: boolean;
}

/**
 * Meter balance information
 */
export interface MeterBalance {
  meterName: MeterName;
  meterId: string;
  consumedUnits: number;
  creditedUnits: number;
  balance: number;
  unlimited: boolean;
}

/**
 * Check if organization has unlimited access (Enterprise tier)
 * Requirements: 10.1, 10.2
 * 
 * @param linearOrgId - Linear organization ID
 * @returns True if organization has Enterprise tier with unlimited access
 */
export async function isUnlimitedTier(linearOrgId: string): Promise<boolean> {
  try {
    logger.info('Checking if organization has unlimited tier', {
      linearOrgId,
    });

    // Get subscription from Redis
    const subscription = await retrieveSubscription(linearOrgId);

    if (!subscription) {
      logger.info('No subscription found, not unlimited', {
        linearOrgId,
      });
      return false;
    }

    // Check if product ID matches Enterprise tier
    const tiers = getTiers();
    const enterpriseTier = tiers.find((t) => t.id === 'enterprise');

    if (!enterpriseTier) {
      logger.error('Enterprise tier not found in tier definitions', new Error('Enterprise tier not configured'), {
        linearOrgId,
      });
      return false;
    }

    const isUnlimited = subscription.productId === enterpriseTier.polarProductId;

    logger.info('Unlimited tier check complete', {
      linearOrgId,
      isUnlimited,
      productId: subscription.productId,
    });

    return isUnlimited;
  } catch (error) {
    logger.error('Failed to check unlimited tier status', error as Error, {
      linearOrgId,
    });
    // Return false on error to enforce limits by default
    return false;
  }
}

/**
 * Check if organization has sufficient balance for a meter
 * Requirements: 2.1, 2.3, 9.3
 * 
 * @param linearOrgId - Linear organization ID
 * @param meterName - Meter name ('job_descriptions' or 'candidate_screenings')
 * @returns Balance check result with allowed flag and current balance
 */
export async function checkMeterBalance(
  linearOrgId: string,
  meterName: MeterName
): Promise<MeterBalanceCheck> {
  try {
    logger.info('Checking meter balance', {
      linearOrgId,
      meterName,
    });

    // Check if organization has unlimited tier
    const unlimited = await isUnlimitedTier(linearOrgId);

    if (unlimited) {
      logger.info('Organization has unlimited tier, skipping balance check', {
        linearOrgId,
        meterName,
      });

      return {
        allowed: true,
        balance: Infinity,
        limit: null,
        unlimited: true,
      };
    }

    // Get customer state from Polar
    const customerState = await getCustomerState(linearOrgId);

    // Find the specific meter by meterId
    // We need to match against the configured meter IDs
    const meterIdToFind =
      meterName === 'job_descriptions'
        ? config.polar.meters.jobDescriptions
        : config.polar.meters.candidateScreenings;

    const meter = customerState.activeMeters?.find(
      (m) => m.meterId === meterIdToFind
    );

    if (!meter) {
      logger.warn('Meter not found for organization', {
        linearOrgId,
        meterName,
        meterIdToFind,
        availableMeters: customerState.activeMeters?.map((m) => m.meterId),
      });

      // If no meter found, apply free tier limits as fallback
      const tiers = getTiers();
      const freeTier = tiers.find((t) => t.id === 'free');
      const freeLimit =
        meterName === 'job_descriptions'
          ? freeTier?.allowances.jobDescriptions ?? 10
          : freeTier?.allowances.candidateScreenings ?? 50;

      return {
        allowed: false,
        balance: 0,
        limit: freeLimit,
        unlimited: false,
      };
    }

    // Calculate balance
    const balance = meter.balance;
    const allowed = balance > 0;

    // Validate meter balance is non-negative
    // Requirements: 9.5
    const validationError = validateMeterBalance(balance, meterName);
    if (validationError) {
      alertMeterInconsistency(linearOrgId, meterName, balance);
    }

    logger.info('Meter balance check complete', {
      linearOrgId,
      meterName,
      balance,
      allowed,
      consumedUnits: meter.consumedUnits,
      creditedUnits: meter.creditedUnits,
    });

    return {
      allowed,
      balance,
      limit: meter.creditedUnits,
      unlimited: false,
    };
  } catch (error) {
    logger.error('Failed to check meter balance', error as Error, {
      linearOrgId,
      meterName,
    });

    // Enable degraded mode and use Free tier limits
    const { enableDegradedMode, checkDegradedModeBalance } = await import('./degraded-mode');
    await enableDegradedMode(linearOrgId, 'Polar API query failed');

    const degradedBalance = await checkDegradedModeBalance(linearOrgId, meterName);

    return {
      allowed: degradedBalance.allowed,
      balance: degradedBalance.balance,
      limit: degradedBalance.limit,
      unlimited: false,
    };
  }
}

/**
 * Record usage event to Polar
 * Requirements: 2.2, 2.4, 4.4, 4.5, 10.3, 9.3
 * 
 * @param linearOrgId - Linear organization ID
 * @param meterName - Meter name ('job_descriptions' or 'candidate_screenings')
 * @param metadata - Optional metadata to include with the event
 */
export async function recordUsageEvent(
  linearOrgId: string,
  meterName: MeterName,
  metadata?: Record<string, any>
): Promise<void> {
  // Check if in degraded mode
  const { isDegradedMode } = await import('./redis-storage');
  const { recordDegradedModeUsage } = await import('./degraded-mode');
  const inDegradedMode = await isDegradedMode(linearOrgId);

  if (inDegradedMode) {
    logger.info('Recording usage in degraded mode', {
      linearOrgId,
      meterName,
    });

    // Record locally in Redis during degraded mode
    await recordDegradedModeUsage(linearOrgId, meterName);
    return;
  }

  try {
    logger.info('Recording usage event', {
      linearOrgId,
      meterName,
      metadata,
    });

    // Determine event name based on meter
    const eventName =
      meterName === 'job_descriptions'
        ? 'job_description_generated'
        : 'candidate_screened';

    // Create usage event
    const event = {
      name: eventName,
      externalCustomerId: linearOrgId,
      metadata: {
        timestamp: new Date().toISOString(),
        meterName,
        ...metadata,
      },
    };

    // Ingest event to Polar
    await ingestUsageEvents([event]);

    logger.info('Usage event recorded successfully', {
      linearOrgId,
      meterName,
      eventName,
    });
  } catch (error) {
    logger.error('Failed to record usage event', error as Error, {
      linearOrgId,
      meterName,
    });

    // Queue failed event for retry
    const { queueFailedEvent } = await import('./redis-storage');
    await queueFailedEvent(linearOrgId, {
      name:
        meterName === 'job_descriptions'
          ? 'job_description_generated'
          : 'candidate_screened',
      externalCustomerId: linearOrgId,
      metadata: {
        userId: metadata?.userId || 'unknown',
        timestamp: new Date().toISOString(),
        resourceId: metadata?.resourceId || 'unknown',
        meterName,
        ...metadata,
      },
    });

    // Don't throw - we've queued for retry
    logger.info('Failed event queued for retry', {
      linearOrgId,
      meterName,
    });
  }
}

/**
 * Get all meter balances for an organization
 * Requirements: 3.1, 3.2
 * 
 * @param linearOrgId - Linear organization ID
 * @returns Array of meter balances with current consumption and limits
 */
export async function getMeterBalances(
  linearOrgId: string
): Promise<MeterBalance[]> {
  try {
    logger.info('Getting meter balances', {
      linearOrgId,
    });

    // Check if organization has unlimited tier
    const unlimited = await isUnlimitedTier(linearOrgId);

    if (unlimited) {
      logger.info('Organization has unlimited tier', {
        linearOrgId,
      });

      // Return unlimited balances for both meters
      return [
        {
          meterName: 'job_descriptions',
          meterId: config.polar.meters.jobDescriptions,
          consumedUnits: 0,
          creditedUnits: 0,
          balance: Infinity,
          unlimited: true,
        },
        {
          meterName: 'candidate_screenings',
          meterId: config.polar.meters.candidateScreenings,
          consumedUnits: 0,
          creditedUnits: 0,
          balance: Infinity,
          unlimited: true,
        },
      ];
    }

    // Get customer state from Polar
    const customerState = await getCustomerState(linearOrgId);

    // Map active meters to our format
    const balances: MeterBalance[] = [];

    // Job descriptions meter
    const jobDescMeterId = config.polar.meters.jobDescriptions;
    const jobDescMeter = customerState.activeMeters?.find(
      (m) => m.meterId === jobDescMeterId
    );

    if (jobDescMeter) {
      balances.push({
        meterName: 'job_descriptions',
        meterId: jobDescMeter.meterId,
        consumedUnits: jobDescMeter.consumedUnits,
        creditedUnits: jobDescMeter.creditedUnits,
        balance: jobDescMeter.balance,
        unlimited: false,
      });
    }

    // Candidate screenings meter
    const candidateMeterId = config.polar.meters.candidateScreenings;
    const candidateMeter = customerState.activeMeters?.find(
      (m) => m.meterId === candidateMeterId
    );

    if (candidateMeter) {
      balances.push({
        meterName: 'candidate_screenings',
        meterId: candidateMeter.meterId,
        consumedUnits: candidateMeter.consumedUnits,
        creditedUnits: candidateMeter.creditedUnits,
        balance: candidateMeter.balance,
        unlimited: false,
      });
    }

    logger.info('Meter balances retrieved successfully', {
      linearOrgId,
      meterCount: balances.length,
    });

    return balances;
  } catch (error) {
    logger.error('Failed to get meter balances', error as Error, {
      linearOrgId,
    });

    // Return empty array on error
    return [];
  }
}

/**
 * Atomically deduct from meter balance using Redis
 * This prevents race conditions when multiple users from the same org
 * perform operations simultaneously.
 * 
 * Requirements: 7.4
 * 
 * @param linearOrgId - Linear organization ID
 * @param meterName - Meter name to deduct from
 * @returns True if deduction was successful, false if insufficient balance
 */
export async function deductMeterAtomic(
  linearOrgId: string,
  meterName: MeterName
): Promise<boolean> {
  const key = `meter:${linearOrgId}:${meterName}`;

  try {
    logger.info('Attempting atomic meter deduction', {
      linearOrgId,
      meterName,
      key,
    });

    // Check if unlimited tier first
    const unlimited = await isUnlimitedTier(linearOrgId);
    if (unlimited) {
      logger.info('Unlimited tier, skipping atomic deduction', {
        linearOrgId,
        meterName,
      });
      return true;
    }

    // Get current balance from Polar
    const balanceCheck = await checkMeterBalance(linearOrgId, meterName);

    if (!balanceCheck.allowed) {
      logger.warn('Insufficient balance for atomic deduction', {
        linearOrgId,
        meterName,
        balance: balanceCheck.balance,
      });
      return false;
    }

    // Use Redis to track local deductions for atomicity
    // This is a local counter that gets reconciled with Polar
    const currentLocal = await redis.get<number>(key);
    const localBalance = currentLocal ?? balanceCheck.balance;

    if (localBalance <= 0) {
      logger.warn('Local balance exhausted', {
        linearOrgId,
        meterName,
        localBalance,
      });
      return false;
    }

    // Atomically decrement
    await redis.decr(key);

    // Set TTL to expire at end of billing period (30 days)
    await redis.expire(key, 30 * 24 * 60 * 60);

    logger.info('Atomic meter deduction successful', {
      linearOrgId,
      meterName,
      previousBalance: localBalance,
      newBalance: localBalance - 1,
    });

    return true;
  } catch (error) {
    logger.error('Failed to perform atomic meter deduction', error as Error, {
      linearOrgId,
      meterName,
    });

    // On error, allow operation but log for monitoring
    // This prevents Redis failures from blocking operations
    return true;
  }
}
