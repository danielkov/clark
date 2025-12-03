/**
 * Polar.sh subscription and billing type definitions
 * 
 * This file defines minimal application-specific types for our ATS integration.
 * Most types come directly from the Polar SDK at runtime.
 */

/**
 * Meter names for usage tracking in our application
 * Requirements: 4.1, 4.2, 4.3
 */
export type MeterName = 'job_descriptions' | 'candidate_screenings';

/**
 * Application-specific subscription data stored in Redis
 * Maps Linear org ID to their Polar subscription state
 */
export interface StoredSubscription {
  linearOrgId: string; // External customer ID in Polar
  polarCustomerId: string; // Polar's internal customer ID
  productId: string; // Current Polar product ID
  status: string; // Subscription status from Polar
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: Date;
}
