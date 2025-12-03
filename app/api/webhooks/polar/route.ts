/**
 * Polar Webhook Handler
 * 
 * Handles incoming webhooks from Polar using the SDK
 * Requirements: 5.1, 9.4
 */

import { Webhooks } from "@polar-sh/nextjs";
import { logger } from "@/lib/datadog/logger";
import { handleCustomerStateChanged } from "@/lib/polar/webhook-handlers";

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
  
  /**
   * Handle customer.state_changed webhook event
   * This is the primary webhook for subscription state synchronization
   * Requirements: 1.3, 5.2, 5.3, 5.4, 5.5
   */
  onCustomerStateChanged: async (payload) => {
    try {
      logger.info('customer.state_changed webhook received', {
        customerId: payload.data.id,
        customerEmail: payload.data.email,
      });
      
      // Process customer state change asynchronously
      // The Webhooks handler already returns 200 OK immediately
      await handleCustomerStateChanged(payload as any);
      
      logger.info('Successfully processed customer.state_changed webhook', {
        customerId: payload.data.id,
      });
    } catch (error) {
      logger.error('Failed to process customer.state_changed webhook', error as Error, {
        customerId: payload.data?.id,
      });
      // Don't throw - we've already returned 200 to Polar
      // Failed events can be retried via the failed event queue
    }
  },
});
