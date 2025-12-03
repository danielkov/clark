/**
 * Data Inconsistency Detection and Alerting
 * 
 * Validates subscription data for inconsistencies and alerts administrators
 * via Datadog events when issues are detected.
 * 
 * Requirements: 9.5
 */

import { StoredSubscription } from '../../types/polar';
import { getTiers } from './subscription';
import { emitDatadogEvent } from '../datadog/events';
import { logger } from '../datadog/logger';

/**
 * Validation result for a subscription
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  value: any;
}

/**
 * Validate that a subscription's tier/product ID exists in our tier definitions
 * Requirements: 9.5
 * 
 * @param subscription - Subscription to validate
 * @returns Validation error if tier doesn't exist, null otherwise
 */
export function validateTierExists(
  subscription: StoredSubscription
): ValidationError | null {
  const tiers = getTiers();
  const tierExists = tiers.some(
    (tier) => tier.polarProductId === subscription.productId
  );

  if (!tierExists) {
    return {
      field: 'productId',
      message: 'Subscription product ID does not match any defined tier',
      value: subscription.productId,
    };
  }

  return null;
}

/**
 * Validate that period dates are logical and consistent
 * Requirements: 9.5
 * 
 * Checks:
 * - Period start is before period end
 * - For active subscriptions, period end is in the future
 * - Dates are valid Date objects
 * 
 * @param subscription - Subscription to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validatePeriodDates(
  subscription: StoredSubscription
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check if dates are valid
  if (subscription.currentPeriodStart) {
    const startDate = new Date(subscription.currentPeriodStart);
    if (isNaN(startDate.getTime())) {
      errors.push({
        field: 'currentPeriodStart',
        message: 'Invalid period start date',
        value: subscription.currentPeriodStart,
      });
    }
  }

  if (subscription.currentPeriodEnd) {
    const endDate = new Date(subscription.currentPeriodEnd);
    if (isNaN(endDate.getTime())) {
      errors.push({
        field: 'currentPeriodEnd',
        message: 'Invalid period end date',
        value: subscription.currentPeriodEnd,
      });
    }
  }

  // If both dates are valid, check logical consistency
  if (
    subscription.currentPeriodStart &&
    subscription.currentPeriodEnd &&
    errors.length === 0
  ) {
    const startDate = new Date(subscription.currentPeriodStart);
    const endDate = new Date(subscription.currentPeriodEnd);

    if (startDate >= endDate) {
      errors.push({
        field: 'currentPeriodStart',
        message: 'Period start date must be before period end date',
        value: {
          start: subscription.currentPeriodStart,
          end: subscription.currentPeriodEnd,
        },
      });
    }

    // For active subscriptions, period end should be in the future
    if (subscription.status === 'active' && endDate < new Date()) {
      errors.push({
        field: 'currentPeriodEnd',
        message: 'Active subscription has period end date in the past',
        value: {
          status: subscription.status,
          periodEnd: subscription.currentPeriodEnd,
          now: new Date().toISOString(),
        },
      });
    }
  }

  return errors;
}

/**
 * Validate meter balance is non-negative
 * Requirements: 9.5
 * 
 * @param balance - Meter balance to validate
 * @param meterName - Name of the meter for error reporting
 * @returns Validation error if balance is negative, null otherwise
 */
export function validateMeterBalance(
  balance: number,
  meterName: string
): ValidationError | null {
  if (balance < 0) {
    return {
      field: 'meterBalance',
      message: `Meter balance for ${meterName} is negative`,
      value: balance,
    };
  }

  return null;
}

/**
 * Validate a complete subscription object
 * Requirements: 9.5
 * 
 * Performs all validation checks:
 * - Tier existence
 * - Period date consistency
 * - Required fields presence
 * 
 * @param subscription - Subscription to validate
 * @returns Validation result with all errors found
 */
export function validateSubscription(
  subscription: StoredSubscription
): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate required fields
  if (!subscription.linearOrgId) {
    errors.push({
      field: 'linearOrgId',
      message: 'Linear organization ID is required',
      value: subscription.linearOrgId,
    });
  }

  if (!subscription.polarCustomerId) {
    errors.push({
      field: 'polarCustomerId',
      message: 'Polar customer ID is required',
      value: subscription.polarCustomerId,
    });
  }

  if (!subscription.productId) {
    errors.push({
      field: 'productId',
      message: 'Product ID is required',
      value: subscription.productId,
    });
  }

  if (!subscription.status) {
    errors.push({
      field: 'status',
      message: 'Subscription status is required',
      value: subscription.status,
    });
  }

  // Validate tier exists
  const tierError = validateTierExists(subscription);
  if (tierError) {
    errors.push(tierError);
  }

  // Validate period dates
  const dateErrors = validatePeriodDates(subscription);
  errors.push(...dateErrors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Alert administrators about subscription data inconsistencies via Datadog
 * Requirements: 9.5
 * 
 * @param linearOrgId - Linear organization ID with inconsistent data
 * @param validationResult - Validation result containing errors
 */
export function alertSubscriptionInconsistency(
  linearOrgId: string,
  validationResult: ValidationResult
): void {
  if (validationResult.valid) {
    return; // No inconsistencies to alert
  }

  const errorSummary = validationResult.errors
    .map((err) => `${err.field}: ${err.message}`)
    .join('; ');

  logger.error('Subscription data inconsistency detected', undefined, {
    linearOrgId,
    errorCount: validationResult.errors.length,
    errors: validationResult.errors,
  });

  emitDatadogEvent({
    title: 'Subscription Data Inconsistency Detected',
    text: `Inconsistent subscription data detected for Linear organization ${linearOrgId}.\n\nErrors:\n${validationResult.errors
      .map(
        (err) =>
          `- ${err.field}: ${err.message} (value: ${JSON.stringify(err.value)})`
      )
      .join('\n')}\n\nThis requires immediate investigation.`,
    priority: 'normal',
    alertType: 'error',
    tags: [
      'service:polar',
      'alert:true',
      'inconsistency:subscription',
      `linear_org:${linearOrgId}`,
      `error_count:${validationResult.errors.length}`,
    ],
    aggregationKey: `subscription-inconsistency-${linearOrgId}`,
  });
}

/**
 * Alert administrators about meter balance inconsistencies via Datadog
 * Requirements: 9.5
 * 
 * @param linearOrgId - Linear organization ID with inconsistent meter
 * @param meterName - Name of the meter with negative balance
 * @param balance - The negative balance value
 */
export function alertMeterInconsistency(
  linearOrgId: string,
  meterName: string,
  balance: number
): void {
  logger.error('Meter balance inconsistency detected', undefined, {
    linearOrgId,
    meterName,
    balance,
  });

  emitDatadogEvent({
    title: 'Meter Balance Inconsistency Detected',
    text: `Negative meter balance detected for Linear organization ${linearOrgId}.\n\nMeter: ${meterName}\nBalance: ${balance}\n\nMeter balances should never be negative. This indicates a data inconsistency that requires immediate investigation.`,
    priority: 'normal',
    alertType: 'error',
    tags: [
      'service:polar',
      'alert:true',
      'inconsistency:meter',
      `linear_org:${linearOrgId}`,
      `meter:${meterName}`,
    ],
    aggregationKey: `meter-inconsistency-${linearOrgId}-${meterName}`,
  });
}

/**
 * Validate and alert on subscription data
 * Convenience function that validates and alerts in one call
 * Requirements: 9.5
 * 
 * @param subscription - Subscription to validate
 * @returns Validation result
 */
export function validateAndAlert(
  subscription: StoredSubscription
): ValidationResult {
  const result = validateSubscription(subscription);

  if (!result.valid) {
    alertSubscriptionInconsistency(subscription.linearOrgId, result);
  }

  return result;
}
