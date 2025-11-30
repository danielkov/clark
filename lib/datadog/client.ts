import tracer from 'dd-trace';

let isInitialized = false;

export interface DatadogConfig {
  serviceName?: string;
  environment?: string;
  version?: string;
  enabled?: boolean;
}

/**
 * Initialize Datadog APM tracer with service configuration
 * This should be called once at application startup
 */
export function initializeDatadog(config?: DatadogConfig): void {
  // Prevent double initialization
  if (isInitialized) {
    return;
  }

  const enabled = config?.enabled ?? process.env.DD_TRACE_ENABLED === 'true';
  
  if (!enabled) {
    console.log('Datadog tracing is disabled');
    return;
  }

  const serviceName = config?.serviceName ?? process.env.DD_SERVICE ?? 'linear-ats';
  const environment = config?.environment ?? process.env.DD_ENV ?? process.env.NODE_ENV ?? 'development';
  const version = config?.version ?? process.env.DD_VERSION ?? '1.0.0';

  tracer.init({
    service: serviceName,
    env: environment,
    version: version,
    logInjection: true,
    runtimeMetrics: true,
    profiling: true,
    // Enable automatic instrumentation for common libraries
    plugins: true,
  });

  isInitialized = true;
  console.log(`Datadog APM initialized: service=${serviceName}, env=${environment}, version=${version}`);
}

/**
 * Get the Datadog tracer instance
 */
export function getTracer() {
  return tracer;
}

/**
 * Check if Datadog is initialized
 */
export function isDatadogInitialized(): boolean {
  return isInitialized;
}
