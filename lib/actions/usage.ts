'use server';

/**
 * Server Actions for Usage Tracking
 * 
 * Handles usage meter queries and usage history retrieval for the authenticated
 * user's Linear organization. Provides visibility into feature consumption and
 * remaining allowances.
 * 
 * Requirements: 3.1, 3.2, 3.3
 */

import { withAuth } from '@workos-inc/authkit-nextjs';
import { getLinearClient } from '@/lib/linear/client';
import { getMeterBalances, MeterBalance } from '@/lib/polar/usage-meters';
import { logger } from '@/lib/datadog/logger';
import { getUserFriendlyErrorMessage } from '@/lib/utils/retry';
import {
  getDegradedModeState,
  getWarningBannerMessage,
  shouldShowWarningBanner,
  DegradedModeState,
} from '@/lib/polar/degraded-mode';

/**
 * Result type for usage actions
 */
interface UsageActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Usage history entry for a specific meter
 */
export interface UsageHistoryEntry {
  meterName: 'job_descriptions' | 'candidate_screenings';
  consumedUnits: number;
  creditedUnits: number;
  balance: number;
  unlimited: boolean;
  percentageUsed: number; // 0-100, or 0 for unlimited
}

/**
 * Get the Linear organization ID for the authenticated user
 * Requirements: 7.1, 7.3
 * 
 * @returns Linear organization ID
 * @throws Error if user is not authenticated or Linear is not connected
 */
async function getLinearOrgId(): Promise<string> {
  const { user } = await withAuth();

  if (!user) {
    throw new Error('User not authenticated');
  }

  try {
    const client = await getLinearClient();
    const organization = await client.organization;

    if (!organization || !organization.id) {
      throw new Error('Linear organization not found');
    }

    return organization.id;
  } catch (error) {
    logger.error('Failed to get Linear organization ID', error as Error, {
      userId: user.id,
    });
    throw new Error('Failed to retrieve Linear organization. Please ensure Linear is connected.');
  }
}

/**
 * Get meter balances for the authenticated user's organization
 * Requirements: 3.1, 3.2
 * 
 * @returns Array of meter balances with current consumption and limits
 */
export async function getMetersAction(): Promise<UsageActionResult<MeterBalance[]>> {
  try {
    // Get authenticated user and Linear org ID
    const { user } = await withAuth();

    if (!user) {
      return {
        success: false,
        error: 'Authentication required',
      };
    }

    const linearOrgId = await getLinearOrgId();

    logger.info('Retrieving meter balances', {
      userId: user.id,
      linearOrgId,
    });

    // Get meter balances from Polar
    const meters = await getMeterBalances(linearOrgId);

    logger.info('Meter balances retrieved successfully', {
      userId: user.id,
      linearOrgId,
      meterCount: meters.length,
    });

    return {
      success: true,
      data: meters,
    };
  } catch (error) {
    logger.error('Failed to get meter balances', error as Error);

    return {
      success: false,
      error: getUserFriendlyErrorMessage(error) || 'Failed to retrieve meter balances',
    };
  }
}

/**
 * Get usage history breakdown for the authenticated user's organization
 * Requirements: 3.3
 * 
 * @returns Usage breakdown by meter type with consumption statistics
 */
export async function getUsageHistoryAction(): Promise<
  UsageActionResult<UsageHistoryEntry[]>
> {
  try {
    // Get authenticated user and Linear org ID
    const { user } = await withAuth();

    if (!user) {
      return {
        success: false,
        error: 'Authentication required',
      };
    }

    const linearOrgId = await getLinearOrgId();

    logger.info('Retrieving usage history', {
      userId: user.id,
      linearOrgId,
    });

    // Get meter balances from Polar
    const meters = await getMeterBalances(linearOrgId);

    // Transform meter balances into usage history entries
    const usageHistory: UsageHistoryEntry[] = meters.map((meter) => {
      // Calculate percentage used
      let percentageUsed = 0;
      if (!meter.unlimited && meter.creditedUnits > 0) {
        percentageUsed = Math.round(
          (meter.consumedUnits / meter.creditedUnits) * 100
        );
      }

      return {
        meterName: meter.meterName,
        consumedUnits: meter.consumedUnits,
        creditedUnits: meter.creditedUnits,
        balance: meter.balance,
        unlimited: meter.unlimited,
        percentageUsed,
      };
    });

    logger.info('Usage history retrieved successfully', {
      userId: user.id,
      linearOrgId,
      entryCount: usageHistory.length,
    });

    return {
      success: true,
      data: usageHistory,
    };
  } catch (error) {
    logger.error('Failed to get usage history', error as Error);

    return {
      success: false,
      error: getUserFriendlyErrorMessage(error) || 'Failed to retrieve usage history',
    };
  }
}

/**
 * Get degraded mode state for the authenticated user's organization
 * Requirements: 9.3
 * 
 * @returns Degraded mode state with Free tier limits
 */
export async function getDegradedModeStateAction(): Promise<
  UsageActionResult<DegradedModeState>
> {
  try {
    // Get authenticated user and Linear org ID
    const { user } = await withAuth();

    if (!user) {
      return {
        success: false,
        error: 'Authentication required',
      };
    }

    const linearOrgId = await getLinearOrgId();

    logger.info('Retrieving degraded mode state', {
      userId: user.id,
      linearOrgId,
    });

    // Get degraded mode state
    const state = await getDegradedModeState(linearOrgId);

    logger.info('Degraded mode state retrieved successfully', {
      userId: user.id,
      linearOrgId,
      inDegradedMode: state.inDegradedMode,
    });

    return {
      success: true,
      data: state,
    };
  } catch (error) {
    logger.error('Failed to get degraded mode state', error as Error);

    return {
      success: false,
      error: getUserFriendlyErrorMessage(error) || 'Failed to retrieve degraded mode state',
    };
  }
}

/**
 * Check if warning banner should be displayed for the authenticated user's organization
 * Requirements: 9.3
 * 
 * @returns True if warning banner should be displayed
 */
export async function shouldShowWarningBannerAction(): Promise<
  UsageActionResult<boolean>
> {
  try {
    // Get authenticated user and Linear org ID
    const { user } = await withAuth();

    if (!user) {
      return {
        success: false,
        error: 'Authentication required',
      };
    }

    const linearOrgId = await getLinearOrgId();

    logger.info('Checking warning banner status', {
      userId: user.id,
      linearOrgId,
    });

    // Check if warning banner should be shown
    const shouldShow = await shouldShowWarningBanner(linearOrgId);

    logger.info('Warning banner status checked', {
      userId: user.id,
      linearOrgId,
      shouldShow,
    });

    return {
      success: true,
      data: shouldShow,
    };
  } catch (error) {
    logger.error('Failed to check warning banner status', error as Error);

    return {
      success: false,
      error: getUserFriendlyErrorMessage(error) || 'Failed to check warning banner status',
    };
  }
}

/**
 * Get warning banner message for the authenticated user's organization
 * Requirements: 9.3
 * 
 * @returns Warning message or null if not in degraded mode
 */
export async function getWarningBannerMessageAction(): Promise<
  UsageActionResult<string | null>
> {
  try {
    // Get authenticated user and Linear org ID
    const { user } = await withAuth();

    if (!user) {
      return {
        success: false,
        error: 'Authentication required',
      };
    }

    const linearOrgId = await getLinearOrgId();

    logger.info('Retrieving warning banner message', {
      userId: user.id,
      linearOrgId,
    });

    // Get warning banner message
    const message = await getWarningBannerMessage(linearOrgId);

    logger.info('Warning banner message retrieved', {
      userId: user.id,
      linearOrgId,
      hasMessage: message !== null,
    });

    return {
      success: true,
      data: message,
    };
  } catch (error) {
    logger.error('Failed to get warning banner message', error as Error);

    return {
      success: false,
      error: getUserFriendlyErrorMessage(error) || 'Failed to retrieve warning banner message',
    };
  }
}
