# Datadog Observability Integration

This directory contains the Datadog observability integration for the Linear ATS application.

## Overview

The Datadog integration provides:
- **APM Tracing**: Distributed tracing across all service calls
- **Structured Logging**: JSON-formatted logs with correlation IDs
- **Metrics Tracking**: Custom metrics for API requests, AI operations, and webhooks
- **Event Emission**: Critical failure and security event alerts
- **Health Checks**: Service health monitoring endpoint

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
DD_TRACE_ENABLED=true
DD_API_KEY=your_datadog_api_key_here
DD_SERVICE=linear-ats
DD_ENV=production
DD_VERSION=1.0.0
```

### Initialization

Datadog is automatically initialized at application startup via `instrumentation.ts`. No manual initialization is required.

## Usage

### Structured Logging

```typescript
import { logger } from '@/lib/datadog/logger';

// Info logging
logger.info('User logged in', { userId: '123', email: 'user@example.com' });

// Error logging
logger.error('Failed to process request', error, { userId: '123' });

// Warning logging
logger.warn('Rate limit approaching', { currentRate: 95 });

// Debug logging
logger.debug('Processing data', { dataSize: 1024 });
```

### Metrics Tracking

```typescript
import { trackAPIRequest, trackAIOperation, trackWebhookProcessing } from '@/lib/datadog/metrics';

// Track API request
trackAPIRequest({
  endpoint: '/api/jobs',
  method: 'GET',
  statusCode: 200,
  duration: 150,
  userId: '123',
});

// Track AI operation
trackAIOperation({
  operation: 'job-description',
  model: 'llama-3.3-70b',
  latency: 2500,
  tokenUsage: 1024,
  success: true,
});

// Track webhook processing
trackWebhookProcessing({
  eventType: 'Project:update',
  duration: 500,
  success: true,
});
```

### Event Emission

```typescript
import { emitCriticalFailure, emitSecurityEvent, emitAIOperationFailure } from '@/lib/datadog/events';

// Emit critical failure
emitCriticalFailure(
  'Database Connection Failed',
  'Unable to connect to PostgreSQL database',
  { host: 'db.example.com', port: 5432 }
);

// Emit security event
emitSecurityEvent(
  'Unauthorized Access Attempt',
  'User attempted to access protected resource without authentication',
  { userId: '123', resource: '/admin' }
);

// Emit AI operation failure
emitAIOperationFailure(
  'candidate-screening',
  new Error('Cerebras API timeout'),
  { candidateId: '456' }
);
```

### Distributed Tracing

```typescript
import { createSpan } from '@/lib/datadog/metrics';

async function processOrder(orderId: string) {
  const span = createSpan('process_order', {
    'order.id': orderId,
    'workflow.name': 'order_processing',
  });

  try {
    // Your processing logic
    await validateOrder(orderId);
    await chargePayment(orderId);
    await fulfillOrder(orderId);
    
    span.finish();
  } catch (error) {
    span.setError(error);
    span.finish();
    throw error;
  }
}
```

### Correlation IDs

Correlation IDs are automatically generated and propagated across all service calls. They are:
- Added to all log entries
- Included in trace spans
- Passed via `x-correlation-id` header

```typescript
import { generateCorrelationId, withCorrelationId } from '@/lib/datadog/logger';

// Generate a new correlation ID
const correlationId = generateCorrelationId();

// Use in API routes
export async function GET(request: Request) {
  return withCorrelationId(request, async (correlationId) => {
    logger.info('Processing request', { correlationId });
    // ... handle request
  });
}
```

### API Route Wrapper (Optional)

For automatic metrics tracking in API routes:

```typescript
import { withDatadogTracking } from '@/lib/datadog/api-wrapper';

export const GET = withDatadogTracking(async (request) => {
  // Your handler code
  return NextResponse.json({ data: 'example' });
});
```

## Health Check

The health check endpoint is available at `/api/health`:

```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "checks": {
    "redis": {
      "status": "up",
      "latency": 5
    },
    "cerebras": {
      "status": "up"
    }
  }
}
```

## Edge Runtime Compatibility

The middleware runs in Edge runtime and has limited Datadog functionality:
- Correlation IDs are generated and propagated
- Full metrics and tracing are available in API routes (Node.js runtime)

## Monitoring in Datadog

Once configured, you can:
1. View traces in the APM section
2. Search logs by correlation ID
3. Create dashboards for custom metrics
4. Set up alerts for critical failures
5. Monitor service health via the health check endpoint

## Key Workflows Traced

The following workflows have custom distributed tracing:
1. **Onboarding Workflow**: User setup and Initiative configuration
2. **Job Publication Workflow**: Project status changes and AI enhancement
3. **Application Submission Workflow**: Candidate application processing
4. **AI Pre-screening Workflow**: Automated candidate evaluation

Each workflow includes correlation IDs for end-to-end request tracing.
