/**
 * Next.js instrumentation file
 * This file is loaded before the application starts
 * Used to initialize Datadog APM tracing
 */

export async function register() {
  // Only run on the server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeDatadog } = await import('./lib/datadog/client');
    
    initializeDatadog({
      serviceName: process.env.DD_SERVICE || 'linear-ats',
      environment: process.env.DD_ENV || process.env.NODE_ENV || 'development',
      version: process.env.DD_VERSION || '1.0.0',
      enabled: process.env.DD_TRACE_ENABLED === 'true',
    });
  }
}
