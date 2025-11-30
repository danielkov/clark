/**
 * Health Check Endpoint
 * 
 * Provides basic health status and checks for critical dependencies
 */

import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { cerebras } from '@/lib/cerebras/client';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    redis: {
      status: 'up' | 'down';
      latency?: number;
      error?: string;
    };
    cerebras: {
      status: 'up' | 'down';
      error?: string;
    };
  };
}

/**
 * Check Redis connectivity
 */
async function checkRedis(): Promise<{ status: 'up' | 'down'; latency?: number; error?: string }> {
  try {
    const startTime = Date.now();
    await redis.ping();
    const latency = Date.now() - startTime;
    
    return {
      status: 'up',
      latency,
    };
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check Cerebras API connectivity
 */
async function checkCerebras(): Promise<{ status: 'up' | 'down'; error?: string }> {
  try {
    // Simple check - just verify the client is configured
    // We don't want to make actual API calls in health checks to avoid costs
    if (!cerebras) {
      throw new Error('Cerebras client not initialized');
    }
    
    return {
      status: 'up',
    };
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * GET /api/health
 * 
 * Returns health status of the application and its dependencies
 */
export async function GET(): Promise<NextResponse<HealthCheckResult>> {
  const timestamp = new Date().toISOString();
  const version = process.env.DD_VERSION || '1.0.0';

  // Run health checks in parallel
  const [redisCheck, cerebrasCheck] = await Promise.all([
    checkRedis(),
    checkCerebras(),
  ]);

  // Determine overall status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  
  const criticalServicesDown = [redisCheck].filter(check => check.status === 'down').length;
  const nonCriticalServicesDown = [cerebrasCheck].filter(check => check.status === 'down').length;

  if (criticalServicesDown > 0) {
    status = 'unhealthy';
  } else if (nonCriticalServicesDown > 0) {
    status = 'degraded';
  }

  const result: HealthCheckResult = {
    status,
    timestamp,
    version,
    checks: {
      redis: redisCheck,
      cerebras: cerebrasCheck,
    },
  };

  // Return appropriate HTTP status code
  const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

  return NextResponse.json(result, { status: httpStatus });
}
