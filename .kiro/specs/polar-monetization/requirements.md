# Requirements Document

## Introduction

This document specifies the requirements for monetizing the AI-enriched ATS application using Polar.sh for subscription management and credit-based usage limits. The system will support free and paid tiers with usage tracked via credits, where billing is tied to Linear organizations rather than individual users. Credits are issued at the beginning of each billing cycle and consumed as users utilize AI-powered features (job description generation, candidate screening).

## Glossary

- **Polar**: Third-party subscription and billing management platform (polar.sh)
- **ATS**: Applicant Tracking System - the application being monetized
- **Linear Organization**: A workspace in Linear that represents a company or team
- **Usage Meter**: Polar's mechanism for tracking consumption of specific features (job descriptions, candidate screenings)
- **Benefit**: Polar's term for entitlements granted to subscribers (e.g., usage allowances)
- **Subscription Tier**: A pricing plan (Free, Pro, Enterprise) with associated usage allowances
- **Billing Cycle**: The recurring period (monthly) when usage allowances are issued and usage is reset
- **Job Description Generation**: Feature that creates AI-powered job descriptions, tracked by job_descriptions meter
- **Candidate Screening**: Feature that performs AI pre-screening of candidates, tracked by candidate_screenings meter
- **Customer**: A Linear organization that has subscribed to the ATS
- **External Customer ID**: The Linear organization ID used to identify customers in Polar
- **Usage Event**: A record of feature consumption sent to Polar's event ingestion API
- **Overage**: Usage that exceeds the allocated allowance for a billing cycle
- **WorkOS User**: An authenticated user in the ATS via WorkOS AuthKit (assumed to be a Linear admin)

## Requirements

### Requirement 1

**User Story:** As a Linear organization administrator, I want to subscribe to a paid tier, so that I can access enhanced AI features with higher usage allowances.

#### Acceptance Criteria

1. WHEN a WorkOS User visits the subscription page THEN the ATS SHALL display available subscription tiers with usage allowances and pricing
2. WHEN a user selects a subscription tier THEN the ATS SHALL redirect to Polar's checkout flow with the Linear organization ID as the external customer ID
3. WHEN Polar completes the checkout THEN the ATS SHALL receive a webhook notification and update the organization's subscription status
4. WHERE a subscription is active, WHEN the billing cycle begins THEN Polar SHALL automatically issue usage allowances to the organization's meters
5. WHEN a subscription is cancelled THEN the ATS SHALL revoke access to paid features at the end of the current billing cycle

### Requirement 2

**User Story:** As a system, I want to track feature usage and deduct from usage meters, so that organizations stay within their allocated limits.

#### Acceptance Criteria

1. WHEN a job description generation is requested THEN the ATS SHALL verify the Linear organization has remaining job_descriptions meter balance before processing
2. WHEN a job description generation completes successfully THEN the ATS SHALL ingest a usage event to Polar with the Linear organization ID and meter name job_descriptions
3. WHEN a candidate screening is requested THEN the ATS SHALL verify the Linear organization has remaining candidate_screenings meter balance before processing
4. WHEN a candidate screening completes successfully THEN the ATS SHALL ingest a usage event to Polar with the Linear organization ID and meter name candidate_screenings
5. IF an organization has no active subscription THEN the ATS SHALL apply free tier usage limits

### Requirement 3

**User Story:** As a Linear organization member, I want to view my organization's usage meters and remaining allowances, so that I can monitor consumption and avoid service interruptions.

#### Acceptance Criteria

1. WHEN a WorkOS User accesses the dashboard THEN the ATS SHALL display the current meter balances for job descriptions and candidate screenings for their Linear organization
2. WHEN displaying meter balances THEN the ATS SHALL query Polar's Customer Meters API using the Linear organization ID
3. WHEN usage history is requested THEN the ATS SHALL display a breakdown of consumption by meter type
4. WHEN any meter is running low (below 20% of allocation) THEN the ATS SHALL display a warning notification to organization members
5. WHEN the billing cycle resets THEN the ATS SHALL display the new usage allowances and reset date

### Requirement 4

**User Story:** As a product owner, I want to define subscription tiers with different usage allowances, so that I can offer tiered pricing based on customer outcomes.

#### Acceptance Criteria

1. THE ATS SHALL support a Free tier with 10 job descriptions and 50 candidate screenings per month
2. THE ATS SHALL support a Pro tier with 50 job descriptions and 500 candidate screenings per month at $49/month
3. THE ATS SHALL support an Enterprise tier with unlimited job descriptions and unlimited candidate screenings per month at $199/month
4. WHEN a job description is generated THEN the ATS SHALL increment the job_descriptions meter by 1
5. WHEN a candidate is pre-screened THEN the ATS SHALL increment the candidate_screenings meter by 1

### Requirement 5

**User Story:** As a system administrator, I want to handle Polar webhook events, so that subscription changes are reflected in real-time.

#### Acceptance Criteria

1. WHEN Polar sends a webhook event THEN the ATS SHALL verify the webhook signature using the Polar webhook secret
2. WHEN a subscription.created event is received THEN the ATS SHALL store the subscription details associated with the Linear organization ID
3. WHEN a subscription.updated event is received THEN the ATS SHALL update the organization's subscription tier and usage allowances
4. WHEN a subscription.cancelled event is received THEN the ATS SHALL mark the subscription as cancelled and schedule access revocation
5. WHEN a customer.benefit.granted event is received THEN the ATS SHALL update the organization's meter allowances

### Requirement 6

**User Story:** As a developer, I want to integrate the Polar SDK, so that I can manage subscriptions and track usage programmatically.

#### Acceptance Criteria

1. THE ATS SHALL use the @polar-sh/sdk npm package for all Polar API interactions
2. WHEN the ATS starts THEN the system SHALL initialize the Polar client with the access token from environment variables
3. WHEN ingesting usage events THEN the ATS SHALL use the Polar SDK's events.ingest method
4. WHEN querying credit balances THEN the ATS SHALL use the Polar SDK's customer meters API
5. WHEN errors occur during Polar API calls THEN the ATS SHALL log the error with Datadog and retry with exponential backoff

### Requirement 7

**User Story:** As a Linear organization, I want my subscription to be tied to my organization rather than individual users, so that all team members can benefit from shared usage allowances.

#### Acceptance Criteria

1. WHEN storing subscription data THEN the ATS SHALL use the Linear organization ID as the primary key
2. WHEN any WorkOS User from the same Linear organization performs a metered operation THEN the ATS SHALL deduct from the shared organization meter balance
3. WHEN querying subscription status THEN the ATS SHALL retrieve the subscription using the Linear organization ID
4. WHEN multiple users from the same organization are active THEN the ATS SHALL ensure meter deductions are atomic and prevent race conditions
5. WHEN a user switches Linear organizations THEN the ATS SHALL apply the meter balances of the new organization

### Requirement 8

**User Story:** As a product owner, I want to prevent overage charges, so that customers only pay their fixed subscription fee.

#### Acceptance Criteria

1. THE ATS SHALL NOT create metered pricing in Polar products
2. WHEN an organization exhausts a meter allowance THEN the ATS SHALL block further operations for that feature with a clear error message
3. WHEN displaying the error message THEN the ATS SHALL inform users they have reached their usage limit and provide upgrade options
4. WHEN a meter is exhausted THEN the ATS SHALL allow users to upgrade their subscription tier immediately
5. WHEN a user upgrades mid-cycle THEN Polar SHALL issue the new tier's usage allowances immediately

### Requirement 9

**User Story:** As a developer, I want comprehensive error handling for billing operations, so that payment failures don't break the application.

#### Acceptance Criteria

1. WHEN Polar API calls fail THEN the ATS SHALL log the error with full context to Datadog
2. WHEN event ingestion fails THEN the ATS SHALL queue the event for retry with exponential backoff up to 3 attempts
3. WHEN meter balance queries fail THEN the ATS SHALL return a degraded state allowing limited operations
4. WHEN webhook signature verification fails THEN the ATS SHALL reject the request and log a security event
5. WHEN subscription data is inconsistent THEN the ATS SHALL alert administrators via Datadog events

### Requirement 10

**User Story:** As a system, I want to handle unlimited tier subscriptions correctly, so that Enterprise customers are never blocked from using features.

#### Acceptance Criteria

1. WHEN an organization has an Enterprise subscription THEN the ATS SHALL skip meter balance checks for job descriptions
2. WHEN an organization has an Enterprise subscription THEN the ATS SHALL skip meter balance checks for candidate screenings
3. WHEN ingesting events for Enterprise subscriptions THEN the ATS SHALL still send usage events to Polar for analytics
4. WHEN displaying usage to Enterprise customers THEN the ATS SHALL show usage count without a limit indicator
5. WHEN an Enterprise customer downgrades THEN the ATS SHALL immediately enforce the new tier's meter limits
