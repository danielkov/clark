# Design Document

## Overview

This design document describes the integration of Polar.sh subscription management and usage-based billing into the AI-enriched ATS application. The system will support three subscription tiers (Free, Pro, Enterprise) with feature-specific usage meters for job description generation and candidate screening. All billing and usage tracking is tied to Linear organizations rather than individual users, enabling shared usage across team members.

The design leverages Polar's Credits benefit system to issue monthly usage allowances, event ingestion API for tracking consumption, and webhooks for real-time subscription state synchronization. The implementation will integrate with existing WorkOS authentication, Linear OAuth, Redis storage, and Datadog observability infrastructure.

## Architecture

### High-Level Components

```
┌─────────────────┐
│  WorkOS User    │
│  (Linear Admin) │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│              ATS Application (Next.js)              │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ Subscription │  │ Usage Meter  │  │ Webhook  │ │
│  │   Manager    │  │   Tracker    │  │ Handler  │ │
│  └──────┬───────┘  └──────┬───────┘  └────┬─────┘ │
│         │                 │                │       │
└─────────┼─────────────────┼────────────────┼───────┘
          │                 │                │
          ▼                 ▼                ▼
┌─────────────────────────────────────────────────────┐
│              Polar.sh API (@polar-sh/sdk)           │
│                                                     │
│  • Checkout Sessions                                │
│  • Customer State API                               │
│  • Event Ingestion API                              │
│  • Customer Meters API                              │
│  • Webhooks (customer.state_changed)                │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│              Redis (Upstash)                        │
│                                                     │
│  • Subscription metadata by Linear org ID           │
│  • Failed event queue for retry                     │
└─────────────────────────────────────────────────────┘
```

### Data Flow

**Subscription Flow:**
1. User visits subscription page → ATS displays tiers
2. User selects tier → ATS creates Polar checkout session with Linear org ID as external_customer_id
3. User completes payment → Polar sends `customer.state_changed` webhook
4. ATS receives webhook → validates signature → stores subscription in Redis
5. Polar automatically issues credits to meters at billing cycle start

**Usage Tracking Flow:**
1. User requests job description generation or candidate screening
2. ATS checks meter balance via Polar Customer State API (using Linear org ID)
3. If sufficient balance → process request → ingest usage event to Polar
4. Polar deducts from meter balance
5. If insufficient balance → return error with upgrade prompt

**Webhook Sync Flow:**
1. Polar sends `customer.state_changed` webhook on subscription/benefit changes
2. ATS validates webhook signature
3. ATS updates Redis with new subscription state and meter balances
4. ATS logs event to Datadog for monitoring

## Components and Functions

### 1. Subscription Management Functions

**Responsibility:** Handle subscription lifecycle operations (create, retrieve, upgrade, cancel)

**Functions:**
```typescript
// Get subscription tiers with pricing and allowances
async function getTiers(): Promise<SubscriptionTier[]>

// Create Polar checkout session for a Linear org
async function createCheckoutSession(
  linearOrgId: string,
  tierId: string,
  successUrl: string,
  cancelUrl: string
): Promise<CheckoutSession>

// Get current subscription for a Linear org
async function getSubscription(linearOrgId: string): Promise<Subscription | null>

// Upgrade subscription mid-cycle
async function upgradeSubscription(
  linearOrgId: string,
  newTierId: string
): Promise<Subscription>

// Cancel subscription (effective at period end)
async function cancelSubscription(linearOrgId: string): Promise<void>
```

### 2. Usage Meter Tracking Functions

**Responsibility:** Track feature usage and enforce meter limits

**Functions:**
```typescript
// Check if org has sufficient balance for a meter
async function checkMeterBalance(
  linearOrgId: string,
  meterName: 'job_descriptions' | 'candidate_screenings'
): Promise<{ allowed: boolean; balance: number; limit: number | null }>

// Record usage event to Polar
async function recordUsageEvent(
  linearOrgId: string,
  meterName: 'job_descriptions' | 'candidate_screenings',
  metadata?: Record<string, any>
): Promise<void>

// Get all meter balances for an org
async function getMeterBalances(linearOrgId: string): Promise<MeterBalance[]>

// Check if org has unlimited access (Enterprise tier)
async function isUnlimitedTier(linearOrgId: string): Promise<boolean>
```

### 3. Webhook Processing Functions

**Responsibility:** Process Polar webhook events and sync subscription state

**Functions:**
```typescript
// Verify webhook signature using Polar SDK
// Uses validateEvent from @polar-sh/sdk/webhooks
function verifyWebhookEvent(
  rawBody: Buffer,
  headers: Record<string, string>,
  secret: string
): WebhookEvent

// Handle customer.state_changed event
async function handleCustomerStateChanged(event: CustomerStateChangedEvent): Promise<void>

// Process subscription created/updated
async function processSubscriptionChange(
  linearOrgId: string,
  subscription: PolarSubscription
): Promise<void>

// Process benefit granted (credits issued)
async function processBenefitGranted(
  linearOrgId: string,
  benefit: PolarBenefit
): Promise<void>
```

### 4. Polar Client Functions

**Responsibility:** Centralize Polar SDK interactions with error handling and retry logic

**Functions:**
```typescript
// Get customer state by external ID (Linear org ID)
async function getCustomerState(linearOrgId: string): Promise<CustomerState>

// Ingest usage events with retry
async function ingestUsageEvents(events: UsageEvent[]): Promise<{ inserted: number; duplicates: number }>

// List customer meters
async function listCustomerMeters(linearOrgId: string): Promise<CustomerMeter[]>

// Create checkout session
async function createPolarCheckout(params: CheckoutParams): Promise<CheckoutSession>
```

## Data Models

### Subscription Tier

```typescript
interface SubscriptionTier {
  id: string; // 'free' | 'pro' | 'enterprise'
  name: string;
  price: number; // Monthly price in cents (0 for free)
  currency: 'usd';
  allowances: {
    jobDescriptions: number | null; // null = unlimited
    candidateScreenings: number | null; // null = unlimited
  };
  polarProductId: string; // Polar product ID
}
```

### Subscription

```typescript
interface Subscription {
  linearOrgId: string; // External customer ID
  polarCustomerId: string; // Polar's internal customer ID
  tierId: string;
  status: 'active' | 'cancelled' | 'past_due' | 'incomplete';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Meter Balance

```typescript
interface MeterBalance {
  meterName: 'job_descriptions' | 'candidate_screenings';
  meterId: string; // Polar meter ID
  consumedUnits: number;
  creditedUnits: number;
  balance: number; // creditedUnits - consumedUnits
  unlimited: boolean; // True for Enterprise tier
}
```

### Usage Event

```typescript
interface UsageEvent {
  name: 'job_description_generated' | 'candidate_screened';
  externalCustomerId: string; // Linear org ID
  metadata: {
    userId: string; // WorkOS user ID
    timestamp: string; // ISO 8601
    resourceId: string; // Linear project ID or issue ID
    [key: string]: any;
  };
}
```

### Customer State (from Polar)

```typescript
interface CustomerState {
  customer: {
    id: string;
    externalId: string; // Linear org ID
    email: string;
    name: string;
  };
  subscriptions: PolarSubscription[];
  benefits: PolarBenefit[];
  meters: CustomerMeter[];
}

interface CustomerMeter {
  id: string;
  meterId: string;
  consumedUnits: number;
  creditedUnits: number;
  balance: number;
  meter: {
    name: string;
  };
}
```

## C
orrectness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, several properties can be consolidated to eliminate redundancy:

- Properties 2.1 and 2.3 (balance checks for job descriptions and candidate screenings) can be combined into a single property about meter balance verification
- Properties 2.2 and 2.4 (event ingestion for both meters) can be combined into a single property about usage event recording
- Properties 4.4 and 4.5 (meter incrementation) are already covered by the event ingestion properties
- Properties 10.1 and 10.2 (Enterprise bypass for both meters) can be combined into a single property about unlimited tier behavior
- Properties 5.2, 5.3, 5.4, and 5.5 (webhook event processing) can be combined into a single property about webhook state synchronization

### Properties

Property 1: Checkout session creation includes organization ID
*For any* subscription tier and Linear organization ID, creating a checkout session should include the Linear organization ID as the external_customer_id parameter
**Validates: Requirements 1.2**

Property 2: Webhook processing updates subscription state
*For any* valid webhook event containing subscription or benefit data, processing the webhook should result in the subscription state being updated in Redis with the correct Linear organization ID as the key
**Validates: Requirements 1.3, 5.2, 5.3, 5.4, 5.5**

Property 3: Subscription cancellation sets end-of-period flag
*For any* active subscription, cancelling the subscription should set the cancelAtPeriodEnd flag to true without immediately revoking access
**Validates: Requirements 1.5**

Property 4: Meter balance verification before operations
*For any* metered operation (job description or candidate screening) and Linear organization, the system should verify sufficient meter balance exists before processing the request
**Validates: Requirements 2.1, 2.3**

Property 5: Successful operations record usage events
*For any* completed metered operation, the system should ingest a usage event to Polar containing the Linear organization ID and the correct meter name
**Validates: Requirements 2.2, 2.4, 4.4, 4.5**

Property 6: Meter balance queries use organization ID
*For any* Linear organization, querying meter balances should use the Linear organization ID as the external customer ID parameter
**Validates: Requirements 3.2**

Property 7: Low balance triggers warning
*For any* meter with balance below 20% of its credited units, the dashboard should display a warning notification
**Validates: Requirements 3.4**

Property 8: Webhook signature verification
*For any* incoming webhook payload and signature, the system should verify the signature matches the expected HMAC using the webhook secret before processing
**Validates: Requirements 5.1**

Property 9: API errors trigger logging and retry
*For any* failed Polar API call, the system should log the error to Datadog and retry with exponential backoff up to 3 attempts
**Validates: Requirements 6.5, 9.1, 9.2**

Property 10: Subscription data keyed by organization ID
*For any* subscription storage or retrieval operation, the system should use the Linear organization ID as the primary key
**Validates: Requirements 7.1, 7.3**

Property 11: Shared meter balance across users
*For any* two users from the same Linear organization, metered operations by either user should deduct from the same shared meter balance
**Validates: Requirements 7.2**

Property 12: Atomic meter deductions prevent race conditions
*For any* concurrent metered operations from the same organization, the final meter balance should equal the initial balance minus the sum of all operations
**Validates: Requirements 7.4**

Property 13: Organization switch applies new balance
*For any* user switching from one Linear organization to another, subsequent operations should use the new organization's meter balances
**Validates: Requirements 7.5**

Property 14: Exhausted meters block operations
*For any* meter with zero balance, attempting a metered operation should be blocked and return an error
**Validates: Requirements 8.2**

Property 15: Query failures enable degraded mode
*For any* failed meter balance query, the system should return a degraded state that allows limited operations rather than complete failure
**Validates: Requirements 9.3**

Property 16: Invalid signatures rejected
*For any* webhook with an invalid signature, the system should reject the request and log a security event
**Validates: Requirements 9.4**

Property 17: Inconsistent data triggers alerts
*For any* detected subscription data inconsistency, the system should send an alert event to Datadog
**Validates: Requirements 9.5**

Property 18: Enterprise tier bypasses balance checks
*For any* organization with an Enterprise subscription, metered operations should skip balance verification and proceed without limit
**Validates: Requirements 10.1, 10.2**

Property 19: Enterprise tier still records usage
*For any* metered operation by an Enterprise organization, the system should still ingest usage events to Polar for analytics tracking
**Validates: Requirements 10.3**

Property 20: Downgrade enforces new limits immediately
*For any* organization downgrading from Enterprise to a limited tier, subsequent operations should immediately enforce the new tier's meter limits
**Validates: Requirements 10.5**

## Error Handling

### Polar API Failures

**Strategy:** Implement retry logic with exponential backoff and circuit breaker pattern

**Error Categories:**
1. **Transient Errors** (5xx, network timeouts): Retry up to 3 times with exponential backoff (1s, 2s, 4s)
2. **Client Errors** (4xx): Log error and fail fast without retry
3. **Rate Limiting** (429): Respect Retry-After header and implement backoff

**Implementation:**
```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Don't retry client errors
      if (error.status >= 400 && error.status < 500) {
        throw error;
      }
      
      // Log and retry transient errors
      logger.warn('Polar API call failed', {
        attempt,
        error: error.message,
        willRetry: attempt < maxAttempts
      });
      
      if (attempt < maxAttempts) {
        await sleep(Math.pow(2, attempt - 1) * 1000);
      }
    }
  }
  
  throw lastError;
}
```

### Webhook Processing Failures

**Strategy:** Acknowledge webhook immediately, process asynchronously with dead letter queue

**Flow:**
1. Verify signature using Polar SDK's validateEvent → if invalid (WebhookVerificationError), return 401 and log security event
2. Return 200 OK immediately to Polar
3. Process webhook payload asynchronously
4. If processing fails, queue to Redis for retry
5. After 3 failed retries, move to dead letter queue and alert

### Meter Balance Query Failures

**Strategy:** Implement degraded mode with conservative limits

**Degraded Mode Behavior:**
- Allow operations up to Free tier limits (10 job descriptions, 50 candidate screenings)
- Log all operations during degraded mode for reconciliation
- Display warning banner to users
- Attempt to restore full mode every 5 minutes

### Race Condition Prevention

**Strategy:** Use Redis atomic operations for meter deductions

**Implementation:**
```typescript
// Use Redis WATCH/MULTI/EXEC for optimistic locking
async function deductMeter(
  linearOrgId: string,
  meterName: string
): Promise<boolean> {
  const key = `meter:${linearOrgId}:${meterName}`;
  
  const result = await redis.watch(key, async (client) => {
    const balance = await client.get(key);
    
    if (balance <= 0) {
      return false;
    }
    
    return await client
      .multi()
      .decr(key)
      .exec();
  });
  
  return result !== null;
}
```

### Subscription Data Inconsistencies

**Strategy:** Implement validation checks and alerting

**Validation Checks:**
- Subscription tier exists in tier definitions
- Meter balances are non-negative
- Current period end is in the future for active subscriptions
- External customer ID matches Linear org ID format

**Alert Triggers:**
- Subscription without corresponding customer in Polar
- Meter balance negative
- Active subscription past period end
- Webhook event for unknown customer

## Testing Strategy

### Unit Testing

**Framework:** Vitest

**Coverage Areas:**
1. **Subscription Manager:**
   - Tier configuration validation (Free, Pro, Enterprise tiers have correct allowances)
   - Checkout session creation with correct parameters
   - Subscription retrieval by Linear org ID
   - Cancellation flag setting

2. **Usage Meter Tracker:**
   - Balance checking logic for both meters
   - Event payload construction
   - Unlimited tier detection
   - Meter balance parsing from Polar response

3. **Webhook Handler:**
   - Signature verification with valid/invalid signatures
   - Event type routing
   - Subscription state extraction from webhook payload
   - Redis storage operations

4. **Polar Client Wrapper:**
   - Error handling and retry logic
   - Request parameter formatting
   - Response parsing
   - Timeout handling

**Example Unit Tests:**
```typescript
describe('SubscriptionManager', () => {
  it('should return correct tier definitions', () => {
    const tiers = subscriptionManager.getTiers();
    expect(tiers).toHaveLength(3);
    expect(tiers[0]).toMatchObject({
      id: 'free',
      allowances: { jobDescriptions: 10, candidateScreenings: 50 }
    });
  });
  
  it('should create checkout with Linear org ID as external customer', async () => {
    const session = await subscriptionManager.createCheckoutSession(
      'linear-org-123',
      'pro',
      'https://app.com/success',
      'https://app.com/cancel'
    );
    
    expect(session.externalCustomerId).toBe('linear-org-123');
  });
});
```

### Property-Based Testing

**Framework:** fast-check (already in use in the project)

**Configuration:** Each property test should run a minimum of 100 iterations to ensure comprehensive coverage across random inputs.

**Test Tagging:** Each property-based test must include a comment explicitly referencing the correctness property from this design document using the format: `**Feature: polar-monetization, Property {number}: {property_text}**`

**Coverage Areas:**

1. **Checkout Session Creation (Property 1):**
   - Generate random Linear org IDs and tier IDs
   - Verify external_customer_id is always set correctly

2. **Webhook State Synchronization (Property 2):**
   - Generate random webhook payloads with subscription data
   - Verify Redis storage uses correct org ID as key

3. **Meter Balance Verification (Property 4):**
   - Generate random org states with varying balances
   - Verify operations are blocked when balance is insufficient

4. **Usage Event Recording (Property 5):**
   - Generate random completed operations
   - Verify events contain correct org ID and meter name

5. **Signature Verification (Property 8):**
   - Generate random payloads and signatures
   - Verify valid signatures pass and invalid signatures fail

6. **Shared Balance Across Users (Property 11):**
   - Generate random user pairs from same org
   - Verify both users affect same meter balance

7. **Atomic Deductions (Property 12):**
   - Generate random concurrent operation sets
   - Verify final balance equals initial minus sum of operations

8. **Enterprise Bypass (Property 18):**
   - Generate random Enterprise org states
   - Verify balance checks are skipped

**Example Property Test:**
```typescript
/**
 * Feature: polar-monetization, Property 1: Checkout session creation includes organization ID
 */
describe('Property: Checkout session creation', () => {
  it('should always include Linear org ID as external_customer_id', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // Linear org ID
        fc.constantFrom('free', 'pro', 'enterprise'), // Tier ID
        async (linearOrgId, tierId) => {
          const session = await subscriptionManager.createCheckoutSession(
            linearOrgId,
            tierId,
            'https://success.com',
            'https://cancel.com'
          );
          
          expect(session.externalCustomerId).toBe(linearOrgId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Integration Testing

**Scope:** Test interactions between components with mocked Polar API

**Test Scenarios:**
1. End-to-end subscription flow (checkout → webhook → storage)
2. Usage tracking flow (check balance → perform operation → record event)
3. Webhook processing with various event types
4. Error recovery and retry logic
5. Concurrent operations from same organization

**Mocking Strategy:**
- Mock Polar SDK responses using Vitest mocks
- Use in-memory Redis for storage tests
- Simulate network failures and timeouts

## Implementation Notes

### Polar Setup

Polar is already configured with products, meters, and webhook endpoints. The implementation will use the existing Polar configuration.

### Environment Variables

```bash
# Polar Configuration
POLAR_ACCESS_TOKEN=polar_at_xxx
POLAR_WEBHOOK_SECRET=whsec_xxx
POLAR_FREE_PRODUCT_ID=prod_xxx
POLAR_PRO_PRODUCT_ID=prod_xxx
POLAR_ENTERPRISE_PRODUCT_ID=prod_xxx
POLAR_JOB_DESCRIPTIONS_METER_ID=meter_xxx
POLAR_CANDIDATE_SCREENINGS_METER_ID=meter_xxx
```

### Redis Schema

**Subscription Storage:**
```
Key: subscription:{linearOrgId}
Value: JSON serialized Subscription object
TTL: None (persist until cancelled)
```

**Failed Event Queue:**
```
Key: failed_events:{linearOrgId}
Value: List of JSON serialized UsageEvent objects
TTL: 7 days
```

**Degraded Mode Flag:**
```
Key: degraded_mode:{linearOrgId}
Value: timestamp of last query failure
TTL: 5 minutes
```

### Datadog Metrics

**Custom Metrics to Track:**
- `polar.checkout.created` (count)
- `polar.subscription.active` (gauge)
- `polar.usage.job_descriptions` (count)
- `polar.usage.candidate_screenings` (count)
- `polar.meter.balance` (gauge, tagged by meter name)
- `polar.api.latency` (histogram)
- `polar.api.error` (count, tagged by error type)
- `polar.webhook.received` (count, tagged by event type)
- `polar.webhook.processing_time` (histogram)

### Migration Strategy

**Phase 1: Setup (No User Impact)**
- Install @polar-sh/sdk
- Create Polar products and meters
- Implement core components without enforcement

**Phase 2: Soft Launch (Monitoring Only)**
- Deploy usage tracking (record events but don't enforce limits)
- Monitor meter balances and event ingestion
- Validate webhook processing

**Phase 3: Enforcement (Gradual Rollout)**
- Enable limit enforcement for new organizations
- Grandfather existing organizations with Pro tier for 30 days
- Display subscription page to all users

**Phase 4: Full Rollout**
- Enforce limits for all organizations
- Monitor support requests and adjust limits if needed

### Security Considerations

1. **Webhook Signature Verification:** Always verify signatures before processing
2. **Access Token Storage:** Store Polar access token in environment variables, never in code
3. **Rate Limiting:** Implement rate limiting on subscription endpoints to prevent abuse
4. **Audit Logging:** Log all subscription changes and usage events for audit trail
5. **PII Handling:** Ensure Linear org IDs don't contain PII when sent to Polar

### Performance Optimizations

1. **Batch Event Ingestion:** Collect events and send in batches every 30 seconds
2. **Customer State Caching:** Cache customer state for 1 minute to reduce API calls
3. **Webhook Async Processing:** Process webhooks asynchronously to avoid blocking
4. **Redis Connection Pooling:** Reuse Redis connections across requests
5. **Parallel Meter Queries:** Query both meters in parallel when displaying dashboard

## Dependencies

### New Dependencies

```json
{
  "dependencies": {
    "@polar-sh/sdk": "^0.x.x"
  }
}
```

### Existing Dependencies (Leveraged)

- `@workos-inc/node`: Authentication (already integrated)
- `@linear/sdk`: Linear API (already integrated)
- `@upstash/redis`: Redis storage (already integrated)
- `@datadog/browser-rum`: Observability (already integrated)
- `vitest`: Testing framework (already integrated)
- `fast-check`: Property-based testing (already integrated)

## Server Actions and API Routes

### New Server Actions to Implement

**Subscription Management (lib/actions/subscription.ts):**
- `getTiersAction()` - List available tiers
- `createCheckoutAction(tierId, successUrl)` - Create checkout session
- `getSubscriptionAction()` - Get current subscription
- `cancelSubscriptionAction()` - Cancel subscription
- `upgradeSubscriptionAction(newTierId, successUrl)` - Upgrade tier

**Usage Tracking (lib/actions/usage.ts):**
- `getMetersAction()` - Get meter balances
- `getUsageHistoryAction()` - Get usage history

### New API Routes to Implement

**Webhooks:**
- `POST /api/webhooks/polar` - Receive Polar webhooks (API route required for external webhook delivery)

### Modified Functions

**Job Description Generation:**
- `lib/cerebras/job-description.ts`
  - Add meter balance check before processing
  - Add usage event recording after completion

**Candidate Screening:**
- `lib/cerebras/candidate-screening.ts`
  - Add meter balance check before processing
  - Add usage event recording after completion

## UI Components

### New Components to Create

1. **SubscriptionTierCard:** Display tier details with pricing and allowances
2. **MeterBalanceWidget:** Show current balance for each meter with progress bar
3. **UsageLimitWarning:** Display warning when meter is running low
4. **UpgradePrompt:** Prompt users to upgrade when limit is reached
5. **UsageHistoryChart:** Visualize usage over time by meter type

### Modified Components

1. **Dashboard:** Add meter balance widgets and usage charts
2. **Job Description Generator:** Add usage limit check and error handling
3. **Application Form:** Add usage limit check for screening

## Deployment Checklist

- [ ] Create Polar organization and products
- [ ] Configure usage meters in Polar
- [ ] Generate and store Polar access token
- [ ] Configure webhook endpoint in Polar
- [ ] Add environment variables to deployment
- [ ] Run database migrations (if needed)
- [ ] Deploy code changes
- [ ] Verify webhook delivery
- [ ] Test checkout flow end-to-end
- [ ] Monitor Datadog for errors
- [ ] Announce feature to users
