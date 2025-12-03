import { getTracer } from './client';
import { logger } from './logger';

export interface APIRequestMetrics {
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
  userId?: string;
  organizationId?: string;
}

export interface AIOperationMetrics {
  operation: 'job-description' | 'candidate-screening';
  model: string;
  latency: number;
  tokenUsage?: number;
  success: boolean;
  errorType?: string;
}

export interface WebhookMetrics {
  eventType: string;
  duration: number;
  success: boolean;
  errorType?: string;
}

export interface PolarCheckoutMetrics {
  organizationId: string;
  tierId: string;
  success: boolean;
}

export interface PolarSubscriptionMetrics {
  organizationId: string;
  tierId: string;
  status: 'active' | 'cancelled' | 'past_due' | 'incomplete';
}

export interface PolarUsageMetrics {
  organizationId: string;
  meterName: 'job_descriptions' | 'candidate_screenings';
  units: number;
}

export interface PolarMeterBalanceMetrics {
  organizationId: string;
  meterName: 'job_descriptions' | 'candidate_screenings';
  balance: number;
  creditedUnits: number;
  consumedUnits: number;
}

export interface PolarAPIMetrics {
  endpoint: string;
  method: string;
  latency: number;
  success: boolean;
  errorType?: string;
  statusCode?: number;
}

export interface PolarWebhookMetrics {
  eventType: string;
  processingTime: number;
  success: boolean;
  errorType?: string;
}

/**
 * Track API request metrics
 */
export function trackAPIRequest(metrics: APIRequestMetrics): void {
  const tracer = getTracer();
  const span = tracer.scope().active();

  if (span) {
    span.setTag('http.method', metrics.method);
    span.setTag('http.url', metrics.endpoint);
    span.setTag('http.status_code', metrics.statusCode);
    span.setTag('request.duration', metrics.duration);
    
    if (metrics.userId) {
      span.setTag('user.id', metrics.userId);
    }
    
    if (metrics.organizationId) {
      span.setTag('organization.id', metrics.organizationId);
    }
  }

  logger.info('API request completed', {
    endpoint: metrics.endpoint,
    method: metrics.method,
    statusCode: metrics.statusCode,
    duration: metrics.duration,
    userId: metrics.userId,
    organizationId: metrics.organizationId,
  });
}

/**
 * Track AI operation metrics
 */
export function trackAIOperation(metrics: AIOperationMetrics): void {
  const tracer = getTracer();
  const span = tracer.scope().active();

  if (span) {
    span.setTag('ai.operation', metrics.operation);
    span.setTag('ai.model', metrics.model);
    span.setTag('ai.latency', metrics.latency);
    span.setTag('ai.success', metrics.success);
    
    if (metrics.tokenUsage) {
      span.setTag('ai.token_usage', metrics.tokenUsage);
    }
    
    if (metrics.errorType) {
      span.setTag('ai.error_type', metrics.errorType);
    }
  }

  logger.info('AI operation completed', {
    operation: metrics.operation,
    model: metrics.model,
    latency: metrics.latency,
    tokenUsage: metrics.tokenUsage,
    success: metrics.success,
    errorType: metrics.errorType,
  });
}

/**
 * Track webhook processing metrics
 */
export function trackWebhookProcessing(metrics: WebhookMetrics): void {
  const tracer = getTracer();
  const span = tracer.scope().active();

  if (span) {
    span.setTag('webhook.event_type', metrics.eventType);
    span.setTag('webhook.duration', metrics.duration);
    span.setTag('webhook.success', metrics.success);
    
    if (metrics.errorType) {
      span.setTag('webhook.error_type', metrics.errorType);
    }
  }

  logger.info('Webhook processed', {
    eventType: metrics.eventType,
    duration: metrics.duration,
    success: metrics.success,
    errorType: metrics.errorType,
  });
}

/**
 * Create a custom span for tracking specific operations
 */
export function createSpan(operationName: string, tags?: Record<string, any>) {
  const tracer = getTracer();
  const span = tracer.startSpan(operationName, {
    tags: tags || {},
  });
  
  return {
    span,
    finish: () => span.finish(),
    setTag: (key: string, value: any) => span.setTag(key, value),
    setError: (error: Error) => {
      span.setTag('error', true);
      span.setTag('error.message', error.message);
      span.setTag('error.stack', error.stack);
    },
  };
}

/**
 * Measure the duration of an async operation
 */
export async function measureDuration<T>(
  operation: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const startTime = Date.now();
  const result = await operation();
  const duration = Date.now() - startTime;
  
  return { result, duration };
}

/**
 * Track Polar checkout creation
 */
export function trackPolarCheckoutCreated(metrics: PolarCheckoutMetrics): void {
  const tracer = getTracer();
  const span = tracer.scope().active();

  if (span) {
    span.setTag('polar.checkout.organization_id', metrics.organizationId);
    span.setTag('polar.checkout.tier_id', metrics.tierId);
    span.setTag('polar.checkout.success', metrics.success);
  }

  // Increment counter metric
  try {
    const dogstatsd = tracer.dogstatsd;
    if (dogstatsd) {
      dogstatsd.increment('polar.checkout.created', 1, [
        `organization_id:${metrics.organizationId}`,
        `tier_id:${metrics.tierId}`,
        `success:${metrics.success}`,
      ]);
    }
  } catch (error) {
    logger.warn('Failed to send Datadog metric', { error, metric: 'polar.checkout.created' });
  }

  logger.info('Polar checkout created', {
    organizationId: metrics.organizationId,
    tierId: metrics.tierId,
    success: metrics.success,
  });
}

/**
 * Track active Polar subscription (gauge)
 */
export function trackPolarSubscriptionActive(metrics: PolarSubscriptionMetrics): void {
  const tracer = getTracer();
  const span = tracer.scope().active();

  if (span) {
    span.setTag('polar.subscription.organization_id', metrics.organizationId);
    span.setTag('polar.subscription.tier_id', metrics.tierId);
    span.setTag('polar.subscription.status', metrics.status);
  }

  // Send gauge metric (1 for active, 0 for inactive)
  try {
    const dogstatsd = tracer.dogstatsd;
    if (dogstatsd) {
      const value = metrics.status === 'active' ? 1 : 0;
      dogstatsd.gauge('polar.subscription.active', value, [
        `organization_id:${metrics.organizationId}`,
        `tier_id:${metrics.tierId}`,
        `status:${metrics.status}`,
      ]);
    }
  } catch (error) {
    logger.warn('Failed to send Datadog metric', { error, metric: 'polar.subscription.active' });
  }

  logger.info('Polar subscription status', {
    organizationId: metrics.organizationId,
    tierId: metrics.tierId,
    status: metrics.status,
  });
}

/**
 * Track Polar usage event (job descriptions or candidate screenings)
 */
export function trackPolarUsage(metrics: PolarUsageMetrics): void {
  const tracer = getTracer();
  const span = tracer.scope().active();

  if (span) {
    span.setTag('polar.usage.organization_id', metrics.organizationId);
    span.setTag('polar.usage.meter_name', metrics.meterName);
    span.setTag('polar.usage.units', metrics.units);
  }

  // Increment counter metric
  try {
    const dogstatsd = tracer.dogstatsd;
    if (dogstatsd) {
      const metricName = `polar.usage.${metrics.meterName}`;
      dogstatsd.increment(metricName, metrics.units, [
        `organization_id:${metrics.organizationId}`,
        `meter_name:${metrics.meterName}`,
      ]);
    }
  } catch (error) {
    logger.warn('Failed to send Datadog metric', { error, metric: 'polar.usage' });
  }

  logger.info('Polar usage tracked', {
    organizationId: metrics.organizationId,
    meterName: metrics.meterName,
    units: metrics.units,
  });
}

/**
 * Track Polar meter balance (gauge)
 */
export function trackPolarMeterBalance(metrics: PolarMeterBalanceMetrics): void {
  const tracer = getTracer();
  const span = tracer.scope().active();

  if (span) {
    span.setTag('polar.meter.organization_id', metrics.organizationId);
    span.setTag('polar.meter.meter_name', metrics.meterName);
    span.setTag('polar.meter.balance', metrics.balance);
    span.setTag('polar.meter.credited_units', metrics.creditedUnits);
    span.setTag('polar.meter.consumed_units', metrics.consumedUnits);
  }

  // Send gauge metric
  try {
    const dogstatsd = tracer.dogstatsd;
    if (dogstatsd) {
      dogstatsd.gauge('polar.meter.balance', metrics.balance, [
        `organization_id:${metrics.organizationId}`,
        `meter_name:${metrics.meterName}`,
      ]);
    }
  } catch (error) {
    logger.warn('Failed to send Datadog metric', { error, metric: 'polar.meter.balance' });
  }

  logger.info('Polar meter balance', {
    organizationId: metrics.organizationId,
    meterName: metrics.meterName,
    balance: metrics.balance,
    creditedUnits: metrics.creditedUnits,
    consumedUnits: metrics.consumedUnits,
  });
}

/**
 * Track Polar API call latency and errors
 */
export function trackPolarAPICall(metrics: PolarAPIMetrics): void {
  const tracer = getTracer();
  const span = tracer.scope().active();

  if (span) {
    span.setTag('polar.api.endpoint', metrics.endpoint);
    span.setTag('polar.api.method', metrics.method);
    span.setTag('polar.api.latency', metrics.latency);
    span.setTag('polar.api.success', metrics.success);
    
    if (metrics.statusCode) {
      span.setTag('polar.api.status_code', metrics.statusCode);
    }
    
    if (metrics.errorType) {
      span.setTag('polar.api.error_type', metrics.errorType);
    }
  }

  // Send histogram for latency
  try {
    const dogstatsd = tracer.dogstatsd;
    if (dogstatsd) {
      const tags = [
        `endpoint:${metrics.endpoint}`,
        `method:${metrics.method}`,
        `success:${metrics.success}`,
      ];
      
      if (metrics.statusCode) {
        tags.push(`status_code:${metrics.statusCode}`);
      }
      
      if (metrics.errorType) {
        tags.push(`error_type:${metrics.errorType}`);
      }
      
      dogstatsd.histogram('polar.api.latency', metrics.latency, tags);
      
      // Track errors separately
      if (!metrics.success) {
        dogstatsd.increment('polar.api.error', 1, tags);
      }
    }
  } catch (error) {
    logger.warn('Failed to send Datadog metric', { error, metric: 'polar.api' });
  }

  logger.info('Polar API call', {
    endpoint: metrics.endpoint,
    method: metrics.method,
    latency: metrics.latency,
    success: metrics.success,
    statusCode: metrics.statusCode,
    errorType: metrics.errorType,
  });
}

/**
 * Track Polar webhook processing
 */
export function trackPolarWebhook(metrics: PolarWebhookMetrics): void {
  const tracer = getTracer();
  const span = tracer.scope().active();

  if (span) {
    span.setTag('polar.webhook.event_type', metrics.eventType);
    span.setTag('polar.webhook.processing_time', metrics.processingTime);
    span.setTag('polar.webhook.success', metrics.success);
    
    if (metrics.errorType) {
      span.setTag('polar.webhook.error_type', metrics.errorType);
    }
  }

  // Send metrics
  try {
    const dogstatsd = tracer.dogstatsd;
    if (dogstatsd) {
      const tags = [
        `event_type:${metrics.eventType}`,
        `success:${metrics.success}`,
      ];
      
      if (metrics.errorType) {
        tags.push(`error_type:${metrics.errorType}`);
      }
      
      // Increment webhook received counter
      dogstatsd.increment('polar.webhook.received', 1, tags);
      
      // Track processing time as histogram
      dogstatsd.histogram('polar.webhook.processing_time', metrics.processingTime, tags);
    }
  } catch (error) {
    logger.warn('Failed to send Datadog metric', { error, metric: 'polar.webhook' });
  }

  logger.info('Polar webhook processed', {
    eventType: metrics.eventType,
    processingTime: metrics.processingTime,
    success: metrics.success,
    errorType: metrics.errorType,
  });
}
