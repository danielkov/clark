'use server';

/**
 * Server Actions for Subscription Management
 * 
 * Handles subscription lifecycle operations including tier listing,
 * checkout session creation, subscription retrieval, upgrades, and cancellations.
 * All operations are scoped to the authenticated user's Linear organization.
 * 
 * Requirements: 1.1, 1.2, 1.5
 */

import { withAuth } from '@workos-inc/authkit-nextjs';
import { getLinearClient } from '@/lib/linear/client';
import {
  getTiers,
  createCheckoutSession,
  getSubscription,
  upgradeSubscription,
  cancelSubscription,
  SubscriptionTier,
} from '@/lib/polar/subscription';
import { StoredSubscription } from '@/types/polar';
import { logger } from '@/lib/datadog/logger';
import { getUserFriendlyErrorMessage } from '@/lib/utils/retry';

/**
 * Result type for subscription actions
 */
interface SubscriptionActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
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
 * Get all available subscription tiers
 * Requirements: 1.1, 4.1, 4.2, 4.3
 * 
 * @returns Array of subscription tiers with pricing and allowances
 */
export async function getTiersAction(): Promise<SubscriptionActionResult<SubscriptionTier[]>> {
  try {
    // Tiers are public information, no authentication required
    const tiers = getTiers();

    logger.info('Retrieved subscription tiers', {
      tierCount: tiers.length,
    });

    return {
      success: true,
      data: tiers,
    };
  } catch (error) {
    logger.error('Failed to get subscription tiers', error as Error);

    return {
      success: false,
      error: getUserFriendlyErrorMessage(error) || 'Failed to retrieve subscription tiers',
    };
  }
}

/**
 * Create a Polar checkout session for subscription purchase
 * Requirements: 1.2
 * 
 * @param tierId - Subscription tier ID ('pro' or 'enterprise')
 * @param successUrl - URL to redirect after successful checkout
 * @param cancelUrl - Optional URL to redirect if checkout is cancelled
 * @returns Checkout session with redirect URL
 */
export async function createCheckoutAction(
  tierId: string,
  successUrl: string,
  cancelUrl?: string
): Promise<SubscriptionActionResult<{ checkoutUrl: string; checkoutId: string }>> {
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

    logger.info('Creating checkout session', {
      userId: user.id,
      linearOrgId,
      tierId,
    });

    // Create checkout session
    const checkout = await createCheckoutSession(
      linearOrgId,
      tierId,
      successUrl,
      cancelUrl,
      user.email,
      `${user.firstName} ${user.lastName}`.trim() || undefined
    );

    logger.info('Checkout session created successfully', {
      userId: user.id,
      linearOrgId,
      tierId,
      checkoutId: checkout.id,
    });

    return {
      success: true,
      data: {
        checkoutUrl: checkout.url || '',
        checkoutId: checkout.id,
      },
    };
  } catch (error) {
    logger.error('Failed to create checkout session', error as Error, {
      tierId,
    });

    return {
      success: false,
      error: getUserFriendlyErrorMessage(error) || 'Failed to create checkout session',
    };
  }
}

/**
 * Get current subscription for the authenticated user's organization
 * Requirements: 1.1, 7.1, 7.3
 * 
 * @returns Current subscription data or null if no subscription exists
 */
export async function getSubscriptionAction(): Promise<
  SubscriptionActionResult<StoredSubscription | null>
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

    logger.info('Retrieving subscription', {
      userId: user.id,
      linearOrgId,
    });

    // Get subscription from Redis
    const subscription = await getSubscription(linearOrgId);

    logger.info('Subscription retrieved', {
      userId: user.id,
      linearOrgId,
      hasSubscription: subscription !== null,
      status: subscription?.status,
    });

    return {
      success: true,
      data: subscription,
    };
  } catch (error) {
    logger.error('Failed to get subscription', error as Error);

    return {
      success: false,
      error: getUserFriendlyErrorMessage(error) || 'Failed to retrieve subscription',
    };
  }
}

/**
 * Cancel subscription (effective at period end)
 * Requirements: 1.5
 * 
 * @returns Success status
 */
export async function cancelSubscriptionAction(): Promise<SubscriptionActionResult<void>> {
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

    logger.info('Cancelling subscription', {
      userId: user.id,
      linearOrgId,
    });

    // Cancel subscription
    await cancelSubscription(linearOrgId);

    logger.info('Subscription cancelled successfully', {
      userId: user.id,
      linearOrgId,
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Failed to cancel subscription', error as Error);

    return {
      success: false,
      error: getUserFriendlyErrorMessage(error) || 'Failed to cancel subscription',
    };
  }
}

/**
 * Upgrade subscription to a higher tier
 * Requirements: 1.2
 * 
 * @param newTierId - New subscription tier ID
 * @param successUrl - URL to redirect after successful checkout
 * @param cancelUrl - Optional URL to redirect if checkout is cancelled
 * @returns Checkout session for the new tier
 */
export async function upgradeSubscriptionAction(
  newTierId: string,
  successUrl: string,
  cancelUrl?: string
): Promise<SubscriptionActionResult<{ checkoutUrl: string; checkoutId: string }>> {
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

    logger.info('Upgrading subscription', {
      userId: user.id,
      linearOrgId,
      newTierId,
    });

    // Create upgrade checkout session
    const checkout = await upgradeSubscription(
      linearOrgId,
      newTierId,
      successUrl,
      cancelUrl,
      user.email,
      `${user.firstName} ${user.lastName}`.trim() || undefined
    );

    logger.info('Upgrade checkout session created successfully', {
      userId: user.id,
      linearOrgId,
      newTierId,
      checkoutId: checkout.id,
    });

    return {
      success: true,
      data: {
        checkoutUrl: checkout.url || '',
        checkoutId: checkout.id,
      },
    };
  } catch (error) {
    logger.error('Failed to upgrade subscription', error as Error, {
      newTierId,
    });

    return {
      success: false,
      error: getUserFriendlyErrorMessage(error) || 'Failed to upgrade subscription',
    };
  }
}
