import { getTracer } from './client';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  organizationId?: string;
  jobId?: string;
  candidateId?: string;
  [key: string]: any;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

class DatadogLogger {
  private defaultContext: LogContext = {};

  /**
   * Set default context that will be included in all log entries
   */
  setDefaultContext(context: LogContext): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  /**
   * Get the current correlation ID from the active span or generate a new one
   */
  private getCorrelationId(): string {
    const tracer = getTracer();
    const span = tracer.scope().active();
    
    if (span) {
      const traceId = span.context().toTraceId();
      const spanId = span.context().toSpanId();
      return `${traceId}-${spanId}`;
    }
    
    return generateCorrelationId();
  }

  /**
   * Format log entry with Datadog-compatible structure
   */
  private formatLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    const correlationId = context?.correlationId || this.getCorrelationId();
    
    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: {
        ...this.defaultContext,
        ...context,
        correlationId,
      },
    };

    if (error) {
      logEntry.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    }

    return logEntry;
  }

  /**
   * Output log entry to console in JSON format
   */
  private output(logEntry: LogEntry): void {
    const jsonLog = JSON.stringify(logEntry);
    
    switch (logEntry.level) {
      case 'error':
        console.error(jsonLog);
        break;
      case 'warn':
        console.warn(jsonLog);
        break;
      case 'debug':
        console.debug(jsonLog);
        break;
      case 'info':
      default:
        console.log(jsonLog);
        break;
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    const logEntry = this.formatLogEntry('debug', message, context);
    this.output(logEntry);
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    const logEntry = this.formatLogEntry('info', message, context);
    this.output(logEntry);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    const logEntry = this.formatLogEntry('warn', message, context);
    this.output(logEntry);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: LogContext): void {
    const logEntry = this.formatLogEntry('error', message, context, error);
    this.output(logEntry);
  }
}

// Export singleton instance
export const logger = new DatadogLogger();

/**
 * Middleware to attach correlation ID to request context
 * Usage in Next.js API routes:
 * 
 * export async function GET(request: Request) {
 *   return withCorrelationId(request, async (correlationId) => {
 *     logger.info('Processing request', { correlationId });
 *     // ... handle request
 *   });
 * }
 */
export async function withCorrelationId<T>(
  request: Request,
  handler: (correlationId: string) => Promise<T>
): Promise<T> {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  
  // Add correlation ID to the current span if available
  const tracer = getTracer();
  const span = tracer.scope().active();
  if (span) {
    span.setTag('correlation_id', correlationId);
  }
  
  return handler(correlationId);
}

/**
 * Generate a new correlation ID
 * Uses crypto.randomUUID in Node.js runtime, falls back to timestamp-based ID in Edge runtime
 */
export function generateCorrelationId(): string {
  // Check if we're in Node.js runtime
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback for Edge runtime
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}
