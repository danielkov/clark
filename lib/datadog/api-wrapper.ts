/**
 * API Route Wrapper for Datadog Tracking
 * 
 * Wraps API route handlers to automatically track metrics
 * This runs in Node.js runtime, not Edge runtime
 */

import { NextRequest, NextResponse } from 'next/server';
import { trackAPIRequest } from './metrics';
import { generateCorrelationId } from './logger';

export type APIHandler = (
  request: NextRequest,
  context?: any
) => Promise<NextResponse> | NextResponse;

/**
 * Wrap an API route handler with Datadog tracking
 * 
 * Usage:
 * export const GET = withDatadogTracking(async (request) => {
 *   // Your handler code
 *   return NextResponse.json({ data: 'example' });
 * });
 */
export function withDatadogTracking(handler: APIHandler): APIHandler {
  return async (request: NextRequest, context?: any) => {
    const startTime = Date.now();
    const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
    
    try {
      const response = await handler(request, context);
      const duration = Date.now() - startTime;
      
      // Track successful request
      trackAPIRequest({
        endpoint: request.nextUrl.pathname,
        method: request.method,
        statusCode: response.status,
        duration,
      });
      
      // Add correlation ID to response
      response.headers.set('x-correlation-id', correlationId);
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Track failed request
      trackAPIRequest({
        endpoint: request.nextUrl.pathname,
        method: request.method,
        statusCode: 500,
        duration,
      });
      
      throw error;
    }
  };
}
