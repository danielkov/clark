/**
 * Polar Webhook Event Handlers
 * 
 * Processes webhook events from Polar to synchronize subscription state
 * Requirements: 1.3, 5.2, 5.3, 5.4, 5.5
 */

import { logger } from '../datadog/logger';
import { storeSubscription } from './redis-storage';
import { StoredSubscription } from '../../types/polar';
import { WebhookCustomerStateChangedPayload } from '@polar-sh/sdk/models/components/webhookcustomerstatechangedpayload.js';
import { CustomerStateSubscription } from '@polar-sh/sdk/models/components/customerstatesubscription.js';
import { validateAndAlert } from './validation';

/**
 * Polar subscription from CustomerState
 * Based on @polar-sh/sdk CustomerStateSubscription
 */
export interface PolarSubscription {
  id: string;
  status: string;
  customerId: string;
  productId: string;
  priceId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  metadata?: Record<string, any>;
}

/**
 * Polar benefit grant from CustomerState
 * Based on @polar-sh/sdk CustomerStateBenefitGrant
 */
export interface PolarBenefitGrant {
  id: string;
  benefitId: string;
  benefitType: string;
  properties?: Record<string, any>;
}

/**
 * Customer state changed webhook payload
 * Based on @polar-sh/sdk WebhookCustomerStateChangedPayload
 */
export interface CustomerStateChangedEvent {
  type: 'customer.state_changed';
  timestamp: Date;
  data: {
    id: string;
    email: string;
    name: string | null;
    externalId: string | null;
    metadata: Record<string, any>;
    organizationId: string;
    activeSubscriptions: PolarSubscription[];
    grantedBenefits: PolarBenefitGrant[];
    activeMeters: any[];
  };
}

/**
 * Extract Linear org ID from customer external ID or metadata
 * Requirements: 7.1
 * 
 * @param customer - Polar customer object from CustomerState
 * @returns Linear organization ID
 * @throws Error if Linear org ID cannot be found
 */
function extractLinearOrgId(
  customer: { externalId: string | null; metadata?: Record<string, any> }
): string {
  // Try external ID first (this is the primary way we identify customers)
  if (customer.externalId) {
    return customer.externalId;
  }
  
  // Fall back to metadata
  const linearOrgId = customer.metadata?.linearOrgId;
  
  if (!linearOrgId) {
    throw new Error('Linear organization ID not found in customer externalId or metadata');
  }
  
  return linearOrgId;
}

/**
 * Handle customer.state_changed webhook event
 * This is the main entry point for webhook processing
 * Requirements: 1.3, 5.2, 5.3, 5.4, 5.5
 * 
 * @param event - Customer state changed event from Polar
 * @throws Error if processing fails
 */
export async function handleCustomerStateChanged(
  event: WebhookCustomerStateChangedPayload
): Promise<void> {
  try {
    logger.info('Processing customer.state_changed webhook', {
      customerId: event.data.id,
      customerEmail: event.data.email,
      subscriptionCount: event.data.activeSubscriptions?.length || 0,
      benefitCount: event.data.grantedBenefits?.length || 0,
      meterCount: event.data.activeMeters?.length || 0,
    });

    // Extract Linear org ID from customer
    const linearOrgId = extractLinearOrgId(event.data);

    // Process all active subscriptions in the event
    if (event.data.activeSubscriptions && event.data.activeSubscriptions.length > 0) {
      for (const subscription of event.data.activeSubscriptions) {
        await processSubscriptionChange(subscription, event.data.id, linearOrgId);
      }
    } else {
      logger.info('No active subscriptions in customer state', {
        customerId: event.data.id,
        linearOrgId,
      });
    }

    // Process all granted benefits in the event
    if (event.data.grantedBenefits && event.data.grantedBenefits.length > 0) {
      for (const benefitGrant of event.data.grantedBenefits) {
        await processBenefitGranted(linearOrgId, benefitGrant);
      }
    }

    logger.info('Successfully processed customer.state_changed webhook', {
      customerId: event.data.id,
      linearOrgId,
    });
  } catch (error) {
    logger.error('Failed to process customer.state_changed webhook', error as Error, {
      customerId: event.data.id,
    });
    throw error;
  }
}

/**
 * Process subscription created or updated event
 * Stores or updates subscription data in Redis
 * Requirements: 5.2, 5.3, 5.4
 * 
 * @param subscription - Polar subscription object
 * @param customerId - Polar customer ID
 * @param linearOrgId - Linear organization ID
 * @throws Error if processing fails
 */
export async function processSubscriptionChange(
  subscription: CustomerStateSubscription,
  customerId: string,
  linearOrgId: string
): Promise<void> {
  try {
    logger.info('Processing subscription change', {
      subscriptionId: subscription.id,
      linearOrgId,
      status: subscription.status,
      productId: subscription.productId,
    });

    // Create subscription data structure
    const storedSubscription: StoredSubscription = {
      linearOrgId,
      polarCustomerId: customerId,
      productId: subscription.productId,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      updatedAt: new Date(),
    };

    // Store or update subscription in Redis
    await storeSubscription(storedSubscription);

    // Validate subscription data and alert on inconsistencies
    // Requirements: 9.5
    await validateAndAlert(storedSubscription);

    logger.info('Successfully processed subscription change', {
      subscriptionId: subscription.id,
      linearOrgId,
      status: subscription.status,
    });
  } catch (error) {
    logger.error('Failed to process subscription change', error as Error, {
      subscriptionId: subscription.id,
      customerId,
      linearOrgId,
    });
    throw error;
  }
}

/**
 * Process benefit granted event
 * Updates meter allowances when credits are issued
 * Requirements: 5.5
 * 
 * Note: Polar automatically manages meter allowances through the Credits benefit system.
 * This function logs benefit grants for observability but doesn't need to manually
 * update meter balances as Polar handles that via their API.
 * 
 * @param linearOrgId - Linear organization ID
 * @param benefitGrant - Polar benefit grant object
 */
export async function processBenefitGranted(
  linearOrgId: string,
  benefitGrant: PolarBenefitGrant
): Promise<void> {
  try {
    logger.info('Processing benefit granted', {
      linearOrgId,
      benefitGrantId: benefitGrant.id,
      benefitId: benefitGrant.benefitId,
      benefitType: benefitGrant.benefitType,
      properties: benefitGrant.properties,
    });

    // Polar automatically manages meter allowances through their Credits system
    // We just log this for observability and audit trail
    // The actual meter balances are queried from Polar's API when needed

    logger.info('Successfully processed benefit granted', {
      linearOrgId,
      benefitGrantId: benefitGrant.id,
      benefitType: benefitGrant.benefitType,
    });
  } catch (error) {
    logger.error('Failed to process benefit granted', error as Error, {
      linearOrgId,
      benefitGrantId: benefitGrant.id,
    });
    throw error;
  }
}
