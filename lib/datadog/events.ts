import { logger } from './logger';

export type EventPriority = 'normal' | 'low';
export type EventAlertType = 'error' | 'warning' | 'info' | 'success';

export interface DatadogEvent {
  title: string;
  text: string;
  priority?: EventPriority;
  alertType?: EventAlertType;
  tags?: string[];
  aggregationKey?: string;
}

/**
 * Emit a custom Datadog event
 * Events can be used to trigger alerts and appear in the Datadog events stream
 */
export function emitDatadogEvent(event: DatadogEvent): void {
  // Log the event with special formatting for Datadog to pick up
  logger.info('DATADOG_EVENT', {
    event_title: event.title,
    event_text: event.text,
    event_priority: event.priority || 'normal',
    event_alert_type: event.alertType || 'info',
    event_tags: event.tags || [],
    event_aggregation_key: event.aggregationKey,
  });
}

/**
 * Emit a critical failure event for high-priority alerts
 * These events should trigger immediate notifications to on-call engineers
 */
export function emitCriticalFailure(
  title: string,
  description: string,
  context?: Record<string, any>
): void {
  const tags = [
    'severity:critical',
    'alert:true',
    ...(context?.tags || []),
  ];

  emitDatadogEvent({
    title: `[CRITICAL] ${title}`,
    text: `${description}\n\nContext: ${JSON.stringify(context || {}, null, 2)}`,
    priority: 'normal',
    alertType: 'error',
    tags,
    aggregationKey: title,
  });

  // Also log as error for correlation
  logger.error(`Critical failure: ${title}`, undefined, {
    description,
    ...context,
  });
}

/**
 * Emit a security-related event
 * Used for authentication failures, webhook tampering, etc.
 */
export function emitSecurityEvent(
  title: string,
  description: string,
  context?: Record<string, any>
): void {
  const tags = [
    'security:true',
    'alert:true',
    ...(context?.tags || []),
  ];

  emitDatadogEvent({
    title: `[SECURITY] ${title}`,
    text: `${description}\n\nContext: ${JSON.stringify(context || {}, null, 2)}`,
    priority: 'normal',
    alertType: 'warning',
    tags,
    aggregationKey: title,
  });

  // Also log as error for correlation
  logger.error(`Security event: ${title}`, undefined, {
    description,
    ...context,
  });
}

/**
 * Emit an AI operation failure event
 */
export function emitAIOperationFailure(
  operation: string,
  error: Error,
  context?: Record<string, any>
): void {
  emitCriticalFailure(
    `AI Operation Failed: ${operation}`,
    `AI operation "${operation}" failed with error: ${error.message}`,
    {
      operation,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      ...context,
      tags: ['ai:true', 'operation:' + operation],
    }
  );
}

/**
 * Emit a webhook processing failure event
 */
export function emitWebhookFailure(
  eventType: string,
  error: Error,
  context?: Record<string, any>
): void {
  emitCriticalFailure(
    `Webhook Processing Failed: ${eventType}`,
    `Webhook event "${eventType}" failed to process: ${error.message}`,
    {
      eventType,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      ...context,
      tags: ['webhook:true', 'event_type:' + eventType],
    }
  );
}

/**
 * Emit an authentication failure event
 */
export function emitAuthenticationFailure(
  reason: string,
  context?: Record<string, any>
): void {
  emitSecurityEvent(
    'Authentication Failure',
    `Authentication failed: ${reason}`,
    {
      reason,
      ...context,
      tags: ['auth:true'],
    }
  );
}
