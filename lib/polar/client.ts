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
import { redis } from '../redis';

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
 * @returns Customer state including subscriptions, benefits, and meters, or null if customer not found
 * @throws Error if API call fails after retries (excluding 404 not found)
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
    
    // Check if this is a 404 ResourceNotFound error (customer doesn't exist yet)
    const errorMessage = (error as Error).message || '';
    const isNotFound = errorMessage.includes('ResourceNotFound') || errorMessage.includes('Not found');
    
    if (isNotFound) {
      logger.info('Customer not found in Polar (not yet created)', {
        organizationId: linearOrgId,
        latencyMs: latency,
        correlationId: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      });
      
      // Return null for not found instead of throwing
      return null;
    }
    
    // For other errors, log as error and throw
    logger.error('Failed to fetch customer state from Polar', error as Error, {
      organizationId: linearOrgId,
      latencyMs: latency,
      correlationId: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
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
 * List products from Polar
 * Returns all products with their pricing information
 * 
 * Requirements: 6.1
 * 
 * @param organizationId - Optional Polar organization ID to filter products
 * @returns Array of products with pricing details
 * @throws Error if API call fails after retries
 */
export async function listProducts(organizationId?: string) {
  const startTime = Date.now();
  
  try {
    logger.info('Fetching products from Polar', {
      organizationId,
    });

    const resultIterator = await withRetry(
      async () => {
        const client = getPolarClient();
        return await client.products.list({
          organizationId,
          isArchived: false,
        });
      },
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );

    // Collect all pages into an array
    const products = [];
    for await (const page of resultIterator) {
      products.push(...page.result.items);
    }

    const latency = Date.now() - startTime;
    
    logger.info('Successfully fetched products', {
      organizationId,
      productCount: products.length,
      latencyMs: latency,
    });

    return products;
  } catch (error) {
    const latency = Date.now() - startTime;
    
    logger.error('Failed to fetch products from Polar', error as Error, {
      organizationId,
      latencyMs: latency,
    });

    throw error;
  }
}

/**
 * Get Polar customer ID from Redis or create new customer
 * Stores customer ID in Redis for future lookups
 * 
 * Requirements: 6.1, 7.1
 * 
 * @param params - Customer creation parameters
 * @returns Polar customer ID
 * @throws Error if customer creation fails
 */
export async function ensurePolarCustomer(params: {
  linearOrgId: string;
  email: string;
  name?: string;
}): Promise<string> {
  const startTime = Date.now();
  const redisKey = `polar:customer:${params.linearOrgId}`;
  
  try {
    logger.info('Ensuring Polar customer exists', {
      organizationId: params.linearOrgId,
      email: params.email,
    });

    // Check Redis first for existing customer ID
    const cachedCustomerId = await redis.get<string>(redisKey);
    
    if (cachedCustomerId) {
      logger.info('Found Polar customer ID in Redis', {
        organizationId: params.linearOrgId,
        customerId: cachedCustomerId,
        latencyMs: Date.now() - startTime,
      });
      return cachedCustomerId;
    }

    // Not in Redis, check if customer exists in Polar by external ID
    try {
      const client = getPolarClient();
      const existingCustomer = await client.customers.getExternal({
        externalId: params.linearOrgId,
      });
      
      if (existingCustomer && existingCustomer.id) {
        logger.info('Found existing Polar customer, caching ID', {
          organizationId: params.linearOrgId,
          customerId: existingCustomer.id,
          latencyMs: Date.now() - startTime,
        });
        
        // Cache the customer ID in Redis
        await redis.set(redisKey, existingCustomer.id);
        
        return existingCustomer.id;
      }
    } catch (error) {
      // Customer doesn't exist in Polar (404), continue to create
      const errorMessage = (error as Error).message || '';
      if (!errorMessage.includes('ResourceNotFound') && !errorMessage.includes('Not found')) {
        throw error;
      }
      
      logger.info('Customer not found in Polar, will create new', {
        organizationId: params.linearOrgId,
      });
    }

    // Create new customer in Polar
    const result = await withRetry(
      async () => {
        const client = getPolarClient();
        return await client.customers.create({
          email: params.email,
          name: params.name,
          externalId: params.linearOrgId,
          metadata: {
            linearOrgId: params.linearOrgId,
            source: 'linear-ats',
          },
        } as any);
      },
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );

    const latency = Date.now() - startTime;
    
    logger.info('Successfully created Polar customer', {
      organizationId: params.linearOrgId,
      customerId: result.id,
      latencyMs: latency,
    });

    // Cache the new customer ID in Redis
    await redis.set(redisKey, result.id);

    return result.id;
  } catch (error) {
    const latency = Date.now() - startTime;
    
    logger.error('Failed to ensure Polar customer', error as Error, {
      organizationId: params.linearOrgId,
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

    // Ensure customer exists and get their Polar customer ID
    // This links the subscription to the organization, not the individual user
    let customerId: string | undefined;
    
    if (params.customerEmail) {
      customerId = await ensurePolarCustomer({
        linearOrgId: params.linearOrgId,
        email: params.customerEmail,
        name: params.customerName,
      });
      
      logger.info('Using Polar customer ID for checkout', {
        organizationId: params.linearOrgId,
        customerId,
      });
    }

    // Create checkout session with customer ID
    // This ensures the subscription is tied to the organization account
    const result = await withRetry(
      async () => {
        const client = getPolarClient();
        return await client.checkouts.create({
          products: [params.productPriceId],
          successUrl: params.successUrl,
          customerId: customerId,
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
      customerId,
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
