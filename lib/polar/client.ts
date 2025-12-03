/**
 * Polar SDK Client
 * 
 * Provides Polar SDK client instance for subscription management and usage tracking
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 9.1
 */

import { Polar } from '@polar-sh/sdk';
import { config } from '../config';
import { logger } from '../datadog/logger';
import { withRetry, isRetryableError } from '../utils/retry';

/**
 * Singleton Polar client instance
 */
let polarClient: Polar | null = null;

/**
 * Get or create Polar client instance
 * Uses access token from environment configuration
 */
export function getPolarClient(): Polar {
  if (!polarClient) {
    const accessToken = config.polar.accessToken;
    
    if (!accessToken) {
      throw new Error('POLAR_ACCESS_TOKEN not configured. Please add it to your environment variables.');
    }
    
    polarClient = new Polar({
      accessToken,
    });
  }
  
  return polarClient;
}

/**
 * Create a new Polar client with specific access token (for testing)
 */
export function createPolarClient(accessToken: string): Polar {
  return new Polar({
    accessToken,
  });
}

/**
 * Reset the singleton client (useful for testing)
 */
export function resetPolarClient(): void {
  polarClient = null;
}

/**
 * Get customer state by Linear organization ID
 * Returns subscription, benefits, and meter information for a customer
 * 
 * Requirements: 6.4, 7.1, 7.3
 * 
 * @param linearOrgId - The Linear organization ID (used as external customer ID)
 * @returns Customer state including subscriptions, benefits, and meters
 * @throws Error if API call fails after retries
 */
export async function getCustomerState(linearOrgId: string) {
  const startTime = Date.now();
  
  try {
    logger.info('Fetching customer state from Polar', {
      organizationId: linearOrgId,
    });

    const result = await withRetry(
      async () => {
        const client = getPolarClient();
        return await client.customers.getState({
          id: linearOrgId,
        });
      },
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );

    const latency = Date.now() - startTime;
    
    logger.info('Successfully fetched customer state', {
      organizationId: linearOrgId,
      latencyMs: latency,
      hasSubscriptions: result.activeSubscriptions && result.activeSubscriptions.length > 0,
      meterCount: result.activeMeters ? result.activeMeters.length : 0,
    });

    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    
    logger.error('Failed to fetch customer state from Polar', error as Error, {
      organizationId: linearOrgId,
      latencyMs: latency,
    });

    throw error;
  }
}

/**
 * Ingest usage events to Polar with retry logic
 * Records feature consumption for billing and analytics
 * 
 * Requirements: 6.3, 6.5, 9.1, 9.2
 * 
 * @param events - Array of usage events to ingest
 * @returns Result containing number of inserted and duplicate events
 * @throws Error if ingestion fails after retries
 */
export async function ingestUsageEvents(events: Array<{
  name: string;
  externalCustomerId: string;
  metadata?: Record<string, any>;
}>) {
  const startTime = Date.now();
  
  try {
    logger.info('Ingesting usage events to Polar', {
      eventCount: events.length,
      eventNames: events.map(e => e.name),
    });

    const result = await withRetry(
      async () => {
        const client = getPolarClient();
        return await client.events.ingest({
          events: events.map(event => ({
            name: event.name,
            externalCustomerId: event.externalCustomerId,
            metadata: event.metadata || {},
          })),
        });
      },
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );

    const latency = Date.now() - startTime;
    
    logger.info('Successfully ingested usage events', {
      eventCount: events.length,
      inserted: result.inserted,
      duplicates: result.duplicates,
      latencyMs: latency,
    });

    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    
    logger.error('Failed to ingest usage events to Polar', error as Error, {
      eventCount: events.length,
      latencyMs: latency,
    });

    throw error;
  }
}

/**
 * List customer meters for a Linear organization
 * Returns current balance and consumption for all meters
 * 
 * Requirements: 6.4, 3.2
 * 
 * @param organizationId - The Polar organization ID
 * @returns Array of customer meters with balances
 * @throws Error if API call fails after retries
 */
export async function listCustomerMeters(organizationId: string) {
  const startTime = Date.now();
  
  try {
    logger.info('Listing customer meters from Polar', {
      organizationId,
    });

    // Get the async iterator with retry logic
    const resultIterator = await withRetry(
      async () => {
        const client = getPolarClient();
        return await client.customerMeters.list({
          organizationId,
        });
      },
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );

    // Collect all pages into an array
    const meters = [];
    for await (const page of resultIterator) {
      meters.push(...page.result.items);
    }

    const latency = Date.now() - startTime;
    
    logger.info('Successfully listed customer meters', {
      organizationId,
      meterCount: meters.length,
      latencyMs: latency,
    });

    return meters;
  } catch (error) {
    const latency = Date.now() - startTime;
    
    logger.error('Failed to list customer meters from Polar', error as Error, {
      organizationId,
      latencyMs: latency,
    });

    throw error;
  }
}

/**
 * Create a Polar checkout session for subscription purchase
 * Redirects user to Polar's hosted checkout page
 * 
 * Requirements: 1.2, 6.1
 * 
 * @param params - Checkout session parameters
 * @returns Checkout session with redirect URL
 * @throws Error if checkout creation fails
 */
export async function createPolarCheckout(params: {
  productPriceId: string;
  linearOrgId: string;
  successUrl: string;
  customerEmail?: string;
  customerName?: string;
}) {
  const startTime = Date.now();
  
  try {
    logger.info('Creating Polar checkout session', {
      organizationId: params.linearOrgId,
      productPriceId: params.productPriceId,
    });

    const result = await withRetry(
      async () => {
        const client = getPolarClient();
        return await client.checkouts.create({
          productPriceId: params.productPriceId,
          successUrl: params.successUrl,
          customerEmail: params.customerEmail,
          customerName: params.customerName,
          metadata: {
            linearOrgId: params.linearOrgId,
          },
        } as any); // Type assertion needed due to SDK type definitions
      },
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );

    const latency = Date.now() - startTime;
    
    logger.info('Successfully created checkout session', {
      organizationId: params.linearOrgId,
      productPriceId: params.productPriceId,
      checkoutId: result.id,
      latencyMs: latency,
    });

    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    
    logger.error('Failed to create Polar checkout session', error as Error, {
      organizationId: params.linearOrgId,
      productPriceId: params.productPriceId,
      latencyMs: latency,
    });

    throw error;
  }
}
