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
