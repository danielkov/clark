# Implementation Plan

- [x] 1. Set up Polar SDK and configuration
  - Install @polar-sh/sdk npm package
  - Add Polar environment variables to .env.example
  - Create lib/polar/client.ts with Polar SDK initialization
  - Add Polar configuration to lib/config.ts
  - _Requirements: 6.2_

- [x] 2. Implement subscription tier definitions and data models
  - Create types/polar.ts with Subscription, SubscriptionTier, MeterBalance, UsageEvent, CustomerState types
  - Define subscription tier constants (Free, Pro, Enterprise) with allowances
  - _Requirements: 4.1, 4.2, 4.3_

- [ ]* 2.1 Write unit tests for tier definitions
  - Test Free tier has 10 job descriptions and 50 candidate screenings
  - Test Pro tier has 50 job descriptions and 500 candidate screenings
  - Test Enterprise tier has unlimited allowances
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 3. Implement Polar client wrapper functions
  - Create lib/polar/client.ts with getCustomerState function
  - Implement ingestUsageEvents function with retry logic
  - Implement listCustomerMeters function
  - Implement createPolarCheckout function
  - Add error handling and Datadog logging
  - _Requirements: 6.5, 9.1_

- [ ]* 3.1 Write property test for API retry logic
  - **Property 9: API errors trigger logging and retry**
  - **Validates: Requirements 6.5, 9.1, 9.2**

- [ ]* 3.2 Write unit tests for Polar client functions
  - Test getCustomerState with valid Linear org ID
  - Test ingestUsageEvents with event batches
  - Test error handling for 4xx and 5xx responses
  - Test exponential backoff timing
  - _Requirements: 6.5, 9.1, 9.2_

- [x] 4. Implement subscription management functions
  - Create lib/polar/subscription.ts with getTiers function
  - Implement createCheckoutSession function with Linear org ID as external_customer_id
  - Implement getSubscription function to retrieve from Redis
  - Implement upgradeSubscription function
  - Implement cancelSubscription function
  - _Requirements: 1.1, 1.2, 1.5_

- [ ]* 4.1 Write property test for checkout session creation
  - **Property 1: Checkout session creation includes organization ID**
  - **Validates: Requirements 1.2**

- [ ]* 4.2 Write property test for subscription cancellation
  - **Property 3: Subscription cancellation sets end-of-period flag**
  - **Validates: Requirements 1.5**

- [ ]* 4.3 Write unit tests for subscription functions
  - Test getTiers returns all three tiers
  - Test createCheckoutSession includes correct URLs
  - Test getSubscription retrieves from Redis by org ID
  - Test cancelSubscription sets cancelAtPeriodEnd flag
  - _Requirements: 1.1, 1.2, 1.5_

- [x] 5. Implement Redis storage for subscriptions
  - Create lib/polar/redis-storage.ts with storeSubscription function
  - Implement retrieveSubscription function using Linear org ID as key
  - Implement updateSubscription function
  - Add failed event queue functions (queueFailedEvent, getFailedEvents)
  - Add degraded mode flag functions (setDegradedMode, isDegradedMode)
  - _Requirements: 7.1, 7.3, 9.2_

- [ ]* 5.1 Write property test for subscription storage keying
  - **Property 10: Subscription data keyed by organization ID**
  - **Validates: Requirements 7.1, 7.3**

- [ ]* 5.2 Write unit tests for Redis storage functions
  - Test storeSubscription uses org ID as key
  - Test retrieveSubscription returns correct subscription
  - Test failed event queue operations
  - Test degraded mode flag operations
  - _Requirements: 7.1, 7.3, 9.2_

- [x] 6. Implement usage meter tracking functions
  - Create lib/polar/usage-meters.ts with checkMeterBalance function
  - Implement recordUsageEvent function
  - Implement getMeterBalances function
  - Implement isUnlimitedTier function for Enterprise tier
  - Add atomic meter deduction logic using Redis
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 10.1, 10.2, 10.3_

- [ ]* 6.1 Write property test for meter balance verification
  - **Property 4: Meter balance verification before operations**
  - **Validates: Requirements 2.1, 2.3**

- [ ]* 6.2 Write property test for usage event recording
  - **Property 5: Successful operations record usage events**
  - **Validates: Requirements 2.2, 2.4, 4.4, 4.5**

- [ ]* 6.3 Write property test for meter balance queries
  - **Property 6: Meter balance queries use organization ID**
  - **Validates: Requirements 3.2**

- [ ]* 6.4 Write property test for exhausted meters
  - **Property 14: Exhausted meters block operations**
  - **Validates: Requirements 8.2**

- [ ]* 6.5 Write property test for Enterprise tier bypass
  - **Property 18: Enterprise tier bypasses balance checks**
  - **Validates: Requirements 10.1, 10.2**

- [ ]* 6.6 Write property test for Enterprise usage tracking
  - **Property 19: Enterprise tier still records usage**
  - **Validates: Requirements 10.3**

- [ ]* 6.7 Write property test for atomic meter deductions
  - **Property 12: Atomic meter deductions prevent race conditions**
  - **Validates: Requirements 7.4**

- [ ]* 6.8 Write unit tests for usage meter functions
  - Test checkMeterBalance returns correct balance
  - Test recordUsageEvent creates correct payload
  - Test isUnlimitedTier returns true for Enterprise
  - Test getMeterBalances returns both meters
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 10.1, 10.2, 10.3_

- [x] 7. Update webhook signature verification to use Polar SDK
  - Add lib/polar/webhooks.ts to use validateEvent from @polar-sh/sdk/webhooks
  - Add security event logging for invalid signatures
  - Handle WebhookVerificationError from SDK
  - _Requirements: 5.1, 9.4_

- [ ]* 7.1 Write property test for signature verification
  - **Property 8: Webhook signature verification**
  - **Validates: Requirements 5.1**

- [ ]* 7.2 Write property test for invalid signature rejection
  - **Property 16: Invalid signatures rejected**
  - **Validates: Requirements 9.4**

- [ ]* 7.3 Write unit tests for webhook signature verification
  - Test valid signatures pass verification using SDK
  - Test invalid signatures fail verification
  - Test WebhookVerificationError is caught and logged
  - Test security events are logged for failures
  - _Requirements: 5.1,

- [x] 8. Implement webhook event processing
  - Create lib/polar/webhook-handlers.ts with handleCustomerStateChanged function
  - Implement processSubscriptionChange function
  - Implement processBenefitGranted function
  - Add async processing with error handling
  - _Requirements: 1.3, 5.2, 5.3, 5.4, 5.5_

- [ ]* 8.1 Write property test for webhook state synchronization
  - **Property 2: Webhook processing updates subscription state**
  - **Validates: Requirements 1.3, 5.2, 5.3, 5.4, 5.5**

- [ ]* 8.2 Write unit tests for webhook handlers
  - Test handleCustomerStateChanged extracts subscription data
  - Test processSubscriptionChange stores to Redis
  - Test processBenefitGranted updates meter allowances
  - Test async processing with failures
  - _Requirements: 1.3, 5.2, 5.3, 5.4, 5.5_

- [x] 9. Create subscription server actions
  - Create lib/actions/subscription.ts with server actions
  - Implement getTiersAction to return subscription tiers
  - Implement createCheckoutAction to create Polar checkout session
  - Implement getSubscriptionAction to retrieve current subscription
  - Implement cancelSubscriptionAction to mark subscription for cancellation
  - Implement upgradeSubscriptionAction to create upgrade checkout
  - Add authentication checks using WorkOS session
  - Extract Linear org ID from session
  - _Requirements: 1.1, 1.2, 1.5_

- [ ]* 9.1 Write unit tests for subscription server actions
  - Test getTiersAction returns all tiers
  - Test createCheckoutAction creates session
  - Test getSubscriptionAction retrieves subscription
  - Test cancelSubscriptionAction sets cancellation flag
  - Test upgradeSubscriptionAction updates tier
  - _Requirements: 1.1, 1.2, 1.5_

- [x] 10. Create usage tracking server actions
  - Create lib/actions/usage.ts with server actions
  - Implement getMetersAction to retrieve meter balances
  - Implement getUsageHistoryAction to retrieve usage breakdown
  - Add authentication checks using WorkOS session
  - Extract Linear org ID from session
  - _Requirements: 3.1, 3.2, 3.3_

- [ ]* 10.1 Write unit tests for usage server actions
  - Test getMetersAction returns balances
  - Test getUsageHistoryAction returns usage breakdown
  - Test authentication is enforced
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 11. Create Polar webhook API route
  - Create app/api/webhooks/polar/route.ts (POST)
  - Verify webhook signature before processing
  - Return 200 OK immediately
  - Process webhook asynchronously
  - Add error handling and retry queue
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ]* 11.1 Write unit tests for webhook API route
  - Test signature verification
  - Test immediate 200 response
  - Test async processing
  - Test failed event queueing
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 12. Integrate usage tracking into job description generation
  - Modify lib/cerebras/job-description.ts to check meter balance before generation
  - Add recordUsageEvent call after successful generation
  - Handle insufficient balance errors with clear messaging
  - Skip balance check for Enterprise tier
  - _Requirements: 2.1, 2.2, 4.4, 10.1, 10.3_

- [ ]* 12.1 Write property test for shared balance across users
  - **Property 11: Shared meter balance across users**
  - **Validates: Requirements 7.2**

- [ ]* 12.2 Write unit tests for job description usage tracking
  - Test balance check before generation
  - Test event recording after generation
  - Test error handling for insufficient balance
  - Test Enterprise tier bypass
  - _Requirements: 2.1, 2.2, 4.4, 10.1, 10.3_

- [x] 13. Integrate usage tracking into candidate screening
  - Modify lib/cerebras/candidate-screening.ts to check meter balance before screening
  - Add recordUsageEvent call after successful screening
  - Handle insufficient balance errors with clear messaging
  - Skip balance check for Enterprise tier
  - _Requirements: 2.3, 2.4, 4.5, 10.2, 10.3_

- [ ]* 13.1 Write property test for organization switch
  - **Property 13: Organization switch applies new balance**
  - **Validates: Requirements 7.5**

- [ ]* 13.2 Write property test for downgrade enforcement
  - **Property 20: Downgrade enforces new limits immediately**
  - **Validates: Requirements 10.5**

- [ ]* 13.3 Write unit tests for candidate screening usage tracking
  - Test balance check before screening
  - Test event recording after screening
  - Test error handling for insufficient balance
  - Test Enterprise tier bypass
  - _Requirements: 2.3, 2.4, 4.5, 10.2, 10.3_

- [x] 14. Implement degraded mode for query failures
  - Create lib/polar/degraded-mode.ts with degraded mode logic
  - Implement fallback to Free tier limits when Polar API fails
  - Add warning banner display logic
  - Add automatic recovery attempts every 5 minutes
  - _Requirements: 9.3_

- [ ]* 14.1 Write property test for degraded mode
  - **Property 15: Query failures enable degraded mode**
  - **Validates: Requirements 9.3**

- [ ]* 14.2 Write unit tests for degraded mode
  - Test fallback to Free tier limits
  - Test recovery attempts
  - Test warning banner logic
  - _Requirements: 9.3_

- [x] 15. Implement data inconsistency detection and alerting
  - Create lib/polar/validation.ts with subscription validation functions
  - Add validation checks for tier existence, non-negative balances, period dates
  - Implement Datadog event alerting for inconsistencies
  - _Requirements: 9.5_

- [ ]* 15.1 Write property test for inconsistency alerts
  - **Property 17: Inconsistent data triggers alerts**
  - **Validates: Requirements 9.5**

- [ ]* 15.2 Write unit tests for validation functions
  - Test tier existence validation
  - Test balance non-negative validation
  - Test period date validation
  - Test Datadog alerting
  - _Requirements: 9.5_

- [x] 16. Create subscription UI components
  - Create components/subscription-tier-card.tsx
  - Create components/meter-balance-widget.tsx
  - Create components/usage-limit-warning.tsx
  - Create components/upgrade-prompt.tsx
  - Create components/usage-history-chart.tsx
  - Style with Tailwind CSS and Radix UI
  - _Requirements: 1.1, 3.1, 3.4, 8.3_

- [ ]* 16.1 Write unit tests for UI components
  - Test SubscriptionTierCard renders tier details
  - Test MeterBalanceWidget displays balance correctly
  - Test UsageLimitWarning shows when balance < 20%
  - Test UpgradePrompt displays upgrade options
  - _Requirements: 1.1, 3.1, 3.4, 8.3_

- [x] 17. Create subscription management page
  - Create app/subscription/page.tsx
  - Display all subscription tiers with SubscriptionTierCard
  - Add checkout button for each tier
  - Display current subscription status
  - Add cancel subscription button
  - _Requirements: 1.1, 1.2, 1.5_

- [ ]* 17.1 Write unit tests for subscription page
  - Test page renders all tiers
  - Test checkout button creates session
  - Test cancel button triggers cancellation
  - _Requirements: 1.1, 1.2, 1.5_

- [x] 18. Integrate meter balance widgets into dashboard
  - Modify app/dashboard/page.tsx to include MeterBalanceWidget
  - Display both job_descriptions and candidate_screenings meters
  - Add UsageLimitWarning when balance < 20%
  - Add link to subscription page
  - _Requirements: 3.1, 3.4_

- [ ]* 18.1 Write property test for low balance warning
  - **Property 7: Low balance triggers warning**
  - **Validates: Requirements 3.4**

- [ ]* 18.2 Write unit tests for dashboard integration
  - Test meter widgets display on dashboard
  - Test warning appears when balance low
  - Test link to subscription page
  - _Requirements: 3.1, 3.4_

- [x] 19. Add usage limit error handling to UI
  - Modify job description generation UI to display UpgradePrompt on limit error
  - Modify candidate screening UI to display UpgradePrompt on limit error
  - Add clear error messages explaining limit reached
  - Add immediate upgrade button
  - _Requirements: 8.2, 8.3, 8.4_

- [ ]* 19.1 Write unit tests for error handling UI
  - Test UpgradePrompt displays on limit error
  - Test error message content
  - Test upgrade button functionality
  - _Requirements: 8.2, 8.3, 8.4_

- [x] 20. Add Datadog metrics for billing operations
  - Add custom metrics to lib/datadog/metrics.ts
  - Track polar.checkout.created
  - Track polar.subscription.active (gauge)
  - Track polar.usage.job_descriptions
  - Track polar.usage.candidate_screenings
  - Track polar.meter.balance (gauge)
  - Track polar.api.latency
  - Track polar.api.error
  - Track polar.webhook.received
  - Track polar.webhook.processing_time
  - _Requirements: 6.5, 9.1_

- [ ]* 20.1 Write unit tests for Datadog metrics
  - Test metrics are recorded correctly
  - Test metric tags are applied
  - Test error metrics include error types
  - _Requirements: 6.5, 9.1_

- [ ] 21. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 22. Update environment variable documentation
  - Add Polar variables to .env.example
  - Document POLAR_ACCESS_TOKEN
  - Document POLAR_WEBHOOK_SECRET
  - Document POLAR_*_PRODUCT_ID variables
  - Document POLAR_*_METER_ID variables
  - _Requirements: 6.2_

- [ ] 24. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
