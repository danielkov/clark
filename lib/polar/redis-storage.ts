/**
 * Redis Storage for Polar Subscriptions
 * 
 * Handles storage and retrieval of subscription data, failed event queues,
 * and degraded mode flags in Redis.
 * 
 * Requirements: 7.1, 7.3, 9.2
 */

import { redis } from '../redis';
import { logger } from '../datadog/logger';
import { StoredSubscription, MeterName } from '../../types/polar';

/**
 * Usage event structure for failed event queue
 */
export interface UsageEvent {
  name: string;
  externalCustomerId: string; // Linear org ID
  metadata: {
    userId: string;
    timestamp: string;
    resourceId: string;
    [key: string]: any;
  };
}

/**
 * Store subscription data in Redis
 * Requirements: 7.1, 7.3
 * 
 * Key format: subscription:{linearOrgId}
 * 
 * @param subscription - Subscription data to store
 * @throws Error if storage fails
 */
export async function storeSubscription(
  subscription: StoredSubscription
): Promise<void> {
  const key = `subscription:${subscription.linearOrgId}`;

  try {
    logger.info('Storing subscription in Redis', {
      linearOrgId: subscription.linearOrgId,
      key,
      status: subscription.status,
    });

    await redis.set(key, subscription);

    logger.info('Subscription stored successfully', {
      linearOrgId: subscription.linearOrgId,
    });
  } catch (error) {
    logger.error('Failed to store subscription in Redis', error as Error, {
      linearOrgId: subscription.linearOrgId,
    });
    throw error;
  }
}

/**
 * Retrieve subscription data from Redis using Linear org ID as key
 * Requirements: 7.1, 7.3
 * 
 * @param linearOrgId - Linear organization ID
 * @returns Subscription data or null if not found
 * @throws Error if retrieval fails
 */
export async function retrieveSubscription(
  linearOrgId: string
): Promise<StoredSubscription | null> {
  const key = `subscription:${linearOrgId}`;

  try {
    logger.info('Retrieving subscription from Redis', {
      linearOrgId,
      key,
    });

    const data = await redis.get<StoredSubscription>(key);

    if (!data) {
      logger.info('No subscription found', {
        linearOrgId,
      });
      return null;
    }

    // Parse dates if they're stored as strings
    const subscription: StoredSubscription = {
      ...data,
      currentPeriodStart: data.currentPeriodStart ? new Date(data.currentPeriodStart) : null,
      currentPeriodEnd: data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null,
      updatedAt: new Date(data.updatedAt),
    };

    logger.info('Subscription retrieved successfully', {
      linearOrgId,
      productId: subscription.productId,
      status: subscription.status,
    });

    return subscription;
  } catch (error) {
    logger.error('Failed to retrieve subscription from Redis', error as Error, {
      linearOrgId,
    });
    throw error;
  }
}

/**
 * Update existing subscription data in Redis
 * Requirements: 7.1, 7.3
 * 
 * @param linearOrgId - Linear organization ID
 * @param updates - Partial subscription data to update
 * @returns Updated subscription data
 * @throws Error if subscription not found or update fails
 */
export async function updateSubscription(
  linearOrgId: string,
  updates: Partial<Omit<StoredSubscription, 'linearOrgId'>>
): Promise<StoredSubscription> {
  try {
    logger.info('Updating subscription in Redis', {
      linearOrgId,
      updates: Object.keys(updates),
    });

    // Retrieve existing subscription
    const existing = await retrieveSubscription(linearOrgId);

    if (!existing) {
      throw new Error(`No subscription found for organization: ${linearOrgId}`);
    }

    // Merge updates with existing data
    const updated: StoredSubscription = {
      ...existing,
      ...updates,
      linearOrgId, // Ensure linearOrgId cannot be changed
      updatedAt: new Date(),
    };

    // Store updated subscription
    await storeSubscription(updated);

    logger.info('Subscription updated successfully', {
      linearOrgId,
    });

    return updated;
  } catch (error) {
    logger.error('Failed to update subscription in Redis', error as Error, {
      linearOrgId,
    });
    throw error;
  }
}

/**
 * Queue a failed usage event for retry
 * Requirements: 9.2
 * 
 * Key format: failed_events:{linearOrgId}
 * TTL: 7 days
 * 
 * @param linearOrgId - Linear organization ID
 * @param event - Usage event that failed to ingest
 * @throws Error if queueing fails
 */
export async function queueFailedEvent(
  linearOrgId: string,
  event: UsageEvent
): Promise<void> {
  const key = `failed_events:${linearOrgId}`;
  const ttl = 7 * 24 * 60 * 60; // 7 days in seconds

  try {
    logger.warn('Queueing failed usage event', {
      linearOrgId,
      eventName: event.name,
      timestamp: event.metadata.timestamp,
    });

    // Add event to the list
    await redis.rpush(key, JSON.stringify(event));

    // Set TTL on the key (only if it's a new key)
    await redis.expire(key, ttl);

    logger.info('Failed event queued successfully', {
      linearOrgId,
      eventName: event.name,
    });
  } catch (error) {
    logger.error('Failed to queue failed event', error as Error, {
      linearOrgId,
      eventName: event.name,
    });
    throw error;
  }
}

/**
 * Get all failed events for a Linear organization
 * Requirements: 9.2
 * 
 * @param linearOrgId - Linear organization ID
 * @returns Array of failed usage events
 * @throws Error if retrieval fails
 */
export async function getFailedEvents(
  linearOrgId: string
): Promise<UsageEvent[]> {
  const key = `failed_events:${linearOrgId}`;

  try {
    logger.info('Retrieving failed events from Redis', {
      linearOrgId,
      key,
    });

    // Get all events from the list
    const events = await redis.lrange(key, 0, -1);

    if (!events || events.length === 0) {
      logger.info('No failed events found', {
        linearOrgId,
      });
      return [];
    }

    // Parse JSON strings back to objects
    const parsedEvents = events.map((eventStr) => {
      if (typeof eventStr === 'string') {
        return JSON.parse(eventStr) as UsageEvent;
      }
      return eventStr as UsageEvent;
    });

    logger.info('Failed events retrieved successfully', {
      linearOrgId,
      count: parsedEvents.length,
    });

    return parsedEvents;
  } catch (error) {
    logger.error('Failed to retrieve failed events from Redis', error as Error, {
      linearOrgId,
    });
    throw error;
  }
}

/**
 * Remove failed events from the queue after successful retry
 * 
 * @param linearOrgId - Linear organization ID
 * @param count - Number of events to remove from the front of the queue
 * @throws Error if removal fails
 */
export async function removeFailedEvents(
  linearOrgId: string,
  count: number
): Promise<void> {
  const key = `failed_events:${linearOrgId}`;

  try {
    logger.info('Removing failed events from queue', {
      linearOrgId,
      count,
    });

    // Remove events from the front of the list
    for (let i = 0; i < count; i++) {
      await redis.lpop(key);
    }

    logger.info('Failed events removed successfully', {
      linearOrgId,
      count,
    });
  } catch (error) {
    logger.error('Failed to remove failed events', error as Error, {
      linearOrgId,
      count,
    });
    throw error;
  }
}

/**
 * Set degraded mode flag for a Linear organization
 * Requirements: 9.2
 * 
 * Key format: degraded_mode:{linearOrgId}
 * Value: timestamp of last query failure
 * TTL: 5 minutes
 * 
 * @param linearOrgId - Linear organization ID
 * @throws Error if setting flag fails
 */
export async function setDegradedMode(linearOrgId: string): Promise<void> {
  const key = `degraded_mode:${linearOrgId}`;
  const timestamp = Date.now();
  const ttl = 5 * 60; // 5 minutes in seconds

  try {
    logger.warn('Setting degraded mode flag', {
      linearOrgId,
      timestamp,
    });

    await redis.set(key, timestamp, { ex: ttl });

    logger.info('Degraded mode flag set successfully', {
      linearOrgId,
      expiresIn: ttl,
    });
  } catch (error) {
    logger.error('Failed to set degraded mode flag', error as Error, {
      linearOrgId,
    });
    throw error;
  }
}

/**
 * Check if organization is in degraded mode
 * Requirements: 9.2
 * 
 * @param linearOrgId - Linear organization ID
 * @returns True if in degraded mode, false otherwise
 * @throws Error if check fails
 */
export async function isDegradedMode(linearOrgId: string): Promise<boolean> {
  const key = `degraded_mode:${linearOrgId}`;

  try {
    const timestamp = await redis.get<number>(key);

    const inDegradedMode = timestamp !== null;

    if (inDegradedMode) {
      logger.info('Organization is in degraded mode', {
        linearOrgId,
        since: new Date(timestamp),
      });
    }

    return inDegradedMode;
  } catch (error) {
    logger.error('Failed to check degraded mode status', error as Error, {
      linearOrgId,
    });
    // Return false on error to avoid blocking operations
    return false;
  }
}

/**
 * Clear degraded mode flag for a Linear organization
 * 
 * @param linearOrgId - Linear organization ID
 * @throws Error if clearing flag fails
 */
export async function clearDegradedMode(linearOrgId: string): Promise<void> {
  const key = `degraded_mode:${linearOrgId}`;

  try {
    logger.info('Clearing degraded mode flag', {
      linearOrgId,
    });

    await redis.del(key);

    logger.info('Degraded mode flag cleared successfully', {
      linearOrgId,
    });
  } catch (error) {
    logger.error('Failed to clear degraded mode flag', error as Error, {
      linearOrgId,
    });
    throw error;
  }
}
