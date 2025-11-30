# Design Document

## Overview

The AI-enriched ATS is a NextJS full-stack application that uses Linear as its source of truth for all recruitment data. The system architecture follows a hybrid state model where Linear maintains authoritative data while the NextJS application provides the user interface, public job board, and AI orchestration layer. WorkOS handles authentication, and Cerebras provides fast AI inference capabilities for LLM operations.

The core design principle is to treat Linear as the single source of truth, with the NextJS application acting as a view layer and orchestration engine. All state changes flow through Linear's API, and the application subscribes to Linear webhooks to maintain synchronization.

## Architecture

### System Components

1. **NextJS Application Layer**
   - Server-side rendering for public job board
   - API routes for webhook handling and form submissions
   - Client-side React components for authenticated user interface
   - Middleware for authentication and authorization

2. **Authentication Layer (WorkOS)**
   - Social login providers (Google, GitHub, etc.)
   - Email/password authentication
   - Session management and token refresh

3. **Data Layer (Linear)**
   - Initiative: ATS Container
   - Projects: Job Openings
   - Issues: Candidates/Applicants
   - Documents: CVs, Cover Letters, Tone of Voice guides
   - Webhooks: Real-time synchronization

4. **AI Layer (Cerebras)**
   - Fast LLM inference for job description generation and candidate screening
   - Uses llama-3.3-70b model for high-quality text generation

### Data Flow Patterns

**Pattern 1: User Authentication Flow**
```
User → WorkOS Login → NextJS Callback → Linear OAuth → Store Session → Redirect to Dashboard
```

**Pattern 2: Job Listing Publication Flow**
```
Linear Project Status Change → Webhook → NextJS API → Check ai-generated Label → 
(If missing) → Cerebras API (Generate Description) → Update Linear Project → 
Update Public Job Board Cache
```

**Pattern 3: Candidate Application Flow**
```
Website Form → NextJS API → Validate Input → 
Parse CV (pdf-parse/mammoth) → Create Linear Issue with CV text in description → 
Upload CV as Document Attachment → Trigger AI Pre-screening → Update Issue State → Add Comment
```

**Pattern 4: AI Pre-screening Flow**
```
New Issue Created → Webhook → NextJS API → 
Read Issue Description (contains CV text) → Retrieve Job Description → 
Cerebras API (Compare & Score) → Update Issue State → Add Reasoning Comment
```

## Components and Interfaces

### 1. Authentication Module

**WorkOS Integration**
- `AuthProvider`: React context for authentication state
- `useAuth()`: Hook for accessing current user and session
- `authMiddleware()`: Server middleware for protecting routes
- `handleCallback()`: OAuth callback handler for WorkOS

**Linear OAuth Integration**
- `initiateLinearAuth()`: Starts Linear OAuth 2 actor authorization flow
- `handleLinearCallback()`: Processes Linear OAuth callback and stores tokens
- `getLinearClient()`: Returns authenticated Linear SDK client for current user

### 2. Linear Synchronization Module

**Initiative Management**
- `fetchInitiatives()`: Retrieves all Initiatives from user's Linear workspace
- `createInitiative()`: Creates new Initiative for ATS Container
- `setATSContainer()`: Designates an Initiative as the ATS Container
- `ensureToneOfVoiceDocument()`: Creates default Tone of Voice Document if missing

**Project Synchronization**
- `syncProjects()`: Fetches all Projects within ATS Container Initiative
- `getPublishedJobs()`: Returns Projects with status "In Progress"
- `checkAIGeneratedLabel()`: Verifies presence of "ai-generated" label
- `updateProjectDescription()`: Updates Linear Project description field

**Issue Management**
- `createCandidateIssue()`: Creates new Issue for applicant
- `updateIssueState()`: Transitions Issue to different workflow state
- `addIssueComment()`: Adds comment to Issue with AI reasoning
- `attachDocumentToIssue()`: Links Document to Issue

**Webhook Handler**
- `handleLinearWebhook()`: Processes incoming Linear webhook events
- `verifyWebhookSignature()`: Validates webhook authenticity
- Event handlers for: Project updates, Issue creation, Issue state changes

### 3. Job Board Module

**Public API**
- `GET /api/jobs`: Returns list of published job listings
- `GET /api/jobs/[id]`: Returns specific job listing details
- `POST /api/jobs/[id]/apply`: Handles application submission

**Job Listing Cache**
- `refreshJobCache()`: Updates cached job listings from Linear
- `invalidateJobCache()`: Clears cache for specific job
- Cache invalidation triggers: Project status change, description update

**Application Form**
- `ApplicationForm`: React component with validation
- `validateApplicationInput()`: Client and server-side validation
- File upload handling with size and type restrictions

### 4. AI Services Module

**Document Parsing Module**
- `parseCV()`: Extracts text content from uploaded CV files
  - Uses pdf-parse for PDF files
  - Uses mammoth for DOC/DOCX files
  - Uses file-type to detect file format
  - Returns extracted text content

**Cerebras Integration**
- `cerebras`: Initialized Cerebras client with API key
- `enhanceJobDescription()`: Invokes Cerebras LLM to create job description
  - Inputs: Project description, Tone of Voice Document
  - Model: llama-3.3-70b
  - Output: Structured job description in Markdown format
- `screenCandidate()`: Invokes Cerebras LLM to evaluate candidate fit
  - Inputs: Issue description (includes CV content), Job Description
  - Model: llama-3.3-70b
  - Output: Match confidence (High/Low/Ambiguous) and reasoning

**AI Pre-screening Agent**
- `triggerPreScreening()`: Initiates screening workflow for new candidate
- `evaluateCandidateFit()`: Compares Issue content (with CV) against job requirements using Cerebras
- `determineIssueState()`: Maps AI confidence to Linear workflow state
- `generateReasoningComment()`: Creates human-readable explanation

### 5. Monitoring Module (Datadog)

**Datadog Integration**
- `initializeDatadog()`: Initializes Datadog APM tracer with service configuration
- `datadogMiddleware()`: NextJS middleware for automatic request tracing and metrics
- `tracer`: Datadog tracer instance for manual span creation

**Metrics Tracking**
- `trackAPIRequest()`: Records API request metrics (duration, status, endpoint)
- `trackAIOperation()`: Records AI operation metrics (latency, tokens, success/failure)
- `trackWebhookProcessing()`: Records webhook processing metrics (type, duration, outcome)
- `trackJobView()`: Records job listing view metrics
- `trackApplicationSubmission()`: Records application submission metrics

**Logging Utilities**
- `logger`: Structured logger with Datadog integration
- `logger.info()`: Info-level logging with correlation ID
- `logger.error()`: Error logging with stack trace and context
- `logger.warn()`: Warning-level logging
- `logger.debug()`: Debug-level logging
- `withCorrelationId()`: Middleware to attach correlation IDs to requests

**Event Emission**
- `emitDatadogEvent()`: Emits custom Datadog events for alerting
- `emitCriticalFailure()`: Emits critical failure events with high priority
- `emitSecurityEvent()`: Emits security-related events (auth failures, webhook tampering)

**Tracing Utilities**
- `createSpan()`: Creates custom trace span for specific operations
- `addSpanTags()`: Adds metadata tags to current span
- `recordException()`: Records exception in current span

### 6. Data Models

**User Session**
```typescript
interface UserSession {
  userId: string;
  workosId: string;
  linearAccessToken: string;
  linearRefreshToken: string;
  linearTokenExpiry: Date;
  atsContainerInitiativeId: string | null;
}
```

**Job Listing**
```typescript
interface JobListing {
  id: string; // Linear Project ID
  title: string;
  description: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  isAIGenerated: boolean;
}
```

**Candidate Application**
```typescript
interface CandidateApplication {
  name: string;
  email: string;
  cvFile: File;
  coverLetterFile?: File;
  jobId: string;
}
```

**AI Screening Result**
```typescript
interface ScreeningResult {
  confidence: 'high' | 'low' | 'ambiguous';
  reasoning: string;
  matchedCriteria: string[];
  concerns: string[];
  recommendedState: 'Screening' | 'Declined' | 'Triage';
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Linear OAuth triggers after WorkOS authentication
*For any* user who successfully authenticates via WorkOS without an existing Linear connection, the system should prompt for Linear OAuth authorization.
**Validates: Requirements 1.2**

### Property 2: Initiative fetch after Linear authorization
*For any* user who completes Linear OAuth authorization, the system should fetch and display the list of Initiatives from their Linear workspace.
**Validates: Requirements 1.3**

### Property 3: Initiative selection provides both options
*For any* displayed Initiative list, the interface should provide both the ability to select an existing Initiative and create a new Initiative.
**Validates: Requirements 1.4**

### Property 4: Tone of Voice Document existence guarantee
*For any* Initiative designated as the ATS Container, if no Tone of Voice Document exists within it, the system should create a default Tone of Voice Document.
**Validates: Requirements 1.5, 1.6**

### Property 5: Job listing visibility based on Project status
*For any* Linear Project within the ATS Container Initiative, it should appear in public job listings if and only if its status is "In Progress".
**Validates: Requirements 2.1, 2.2**

### Property 6: AI generation trigger for unlabeled Projects
*For any* Linear Project transitioning to "In Progress" status without the "ai-generated" label, the system should invoke the LLM to generate a job description using the Project description and Tone of Voice Document as inputs.
**Validates: Requirements 2.3, 2.4**

### Property 7: Job description update and labeling
*For any* successful LLM job description generation, the system should both update the Linear Project description with the generated content and apply the "ai-generated" label.
**Validates: Requirements 2.5**

### Property 8: Application validation rules
*For any* application form submission, validation should pass if and only if the Name field is non-empty, the Email field contains a valid email format, and a CV file is present.
**Validates: Requirements 3.1**

### Property 9: Validation failure prevents submission
*For any* application with validation errors, the system should return specific error messages and not create a Linear Issue.
**Validates: Requirements 3.2**

### Property 10: Issue creation for valid applications
*For any* valid application submission, the system should create a new Linear Issue within the Linear Project associated with the Job Listing.
**Validates: Requirements 3.3**

### Property 11: Document attachment for applications
*For any* application submission, the CV should always be uploaded as a Document attachment to the Issue, and the cover letter should be uploaded if provided.
**Validates: Requirements 3.4, 3.5**

### Property 12: Initial Issue state assignment
*For any* newly created candidate Issue, the system should set its state to "Triage" or the configured default entry state.
**Validates: Requirements 3.6**

### Property 13: AI Pre-screening trigger for active Projects
*For any* new Linear Issue created within a Linear Project with status "In Progress", the system should trigger the AI Pre-screening Agent.
**Validates: Requirements 4.1**

### Property 14: AI screening inputs
*For any* AI Pre-screening Agent execution, the system should provide both the candidate's CV content and the Job Description as inputs for comparison.
**Validates: Requirements 4.2**

### Property 15: AI confidence maps to Issue state
*For any* AI Pre-screening result, the Issue state should be "Screening" if confidence is high, "Declined" if confidence is low, and "Triage" if confidence is ambiguous.
**Validates: Requirements 4.3, 4.4, 4.5**

### Property 16: AI reasoning comment on state transition
*For any* Issue state transition performed by the AI Pre-screening Agent, the system should add a comment to the Issue containing the AI's reasoning and specific evidence.
**Validates: Requirements 4.6**

### Property 17: Cerebras for LLM operations
*For any* LLM operation (job description generation or candidate screening), the system should use Cerebras API to execute the operation.
**Validates: Requirements 5.1**

### Property 18: CV parsing on upload
*For any* uploaded CV file, the system should parse the content using pdf-parse for PDFs and mammoth for DOC/DOCX files.
**Validates: Requirements 5.2**

### Property 19: CV content in Issue description
*For any* candidate Issue created, the Issue description should contain the parsed CV text content appended after a line break.
**Validates: Requirements 5.3**

### Property 20: Linear Document attachment for human access
*For any* CV file uploaded by an applicant, the system should store it as a Linear Document attachment for human recruiter access.
**Validates: Requirements 5.4**

### Property 21: Consistent model configuration for job descriptions
*For any* job description generation request, the system should use the Cerebras llama-3.3-70b model with temperature 0.2 for consistent output quality.
**Validates: Requirements 5.5**

### Property 22: API request metrics to Datadog
*For any* API request processed by the system, metrics including duration, status code, and endpoint should be sent to Datadog.
**Validates: Requirements 6.1**

### Property 23: Error logging to Datadog
*For any* error that occurs in the system, the error should be logged to Datadog with full context including stack trace, correlation ID, and relevant metadata.
**Validates: Requirements 6.2**

### Property 24: AI operation metrics tracking
*For any* AI operation executed (job description generation or candidate screening), custom metrics including LLM latency, token usage, and operation success rate should be tracked in Datadog.
**Validates: Requirements 6.3**

### Property 25: Webhook processing metrics
*For any* webhook event received from Linear, processing metrics including event type, processing duration, and outcome should be logged to Datadog.
**Validates: Requirements 6.4**

### Property 26: Datadog APM initialization
*For any* application startup, Datadog APM tracing should be initialized to capture distributed traces across all service calls.
**Validates: Requirements 6.5**

### Property 27: Critical failure events
*For any* critical operation failure, a Datadog event should be emitted that can trigger alerts for on-call engineers.
**Validates: Requirements 6.6**

## Error Handling

### Authentication Errors
- **WorkOS Authentication Failure**: Display user-friendly error message and retry option
- **Linear OAuth Failure**: Provide clear instructions and link to retry authorization
- **Token Expiration**: Automatically refresh tokens using refresh token flow
- **Invalid Session**: Redirect to login with session expired message

### Linear API Errors
- **Rate Limiting**: Implement exponential backoff and queue requests
- **Network Failures**: Retry with exponential backoff (max 3 attempts)
- **Invalid Initiative/Project/Issue**: Log error and display user-friendly message
- **Webhook Signature Validation Failure**: Log security event and reject webhook
- **Concurrent Modification**: Use optimistic locking and retry logic

### File Upload Errors
- **File Too Large**: Validate size client-side (max 10MB) and server-side, display error
- **Invalid File Type**: Accept only PDF, DOC, DOCX for CVs, display error for others
- **CV Parsing Failure**: Log error with file details, create Issue without CV text, notify user
- **Linear Document Upload Failure**: Retry upload (max 3 attempts), display error to user
- **Virus Detection**: Reject file and notify user if malware detected

### AI Service Errors
- **Cerebras API Timeout**: Set 30-second timeout, fallback to manual triage
- **LLM Generation Failure**: Log error, leave Project without ai-generated label for retry
- **Low Confidence Score**: Default to "Triage" state for human review

### Data Validation Errors
- **Invalid Email Format**: Display inline error with format requirements
- **Missing Required Fields**: Highlight missing fields with specific messages
- **Malformed Webhook Payload**: Log error and return 400 status code

### System Errors
- **Database Connection Failure**: Retry connection, display maintenance message if persistent
- **Cache Invalidation Failure**: Log warning, continue operation (eventual consistency)
- **Webhook Processing Failure**: Return 500 to trigger Linear retry mechanism

## Testing Strategy

The testing strategy employs a dual approach combining unit tests for specific scenarios and property-based tests for universal correctness guarantees.

### Unit Testing Approach

Unit tests will verify specific examples, edge cases, and integration points:

**Authentication Module**
- Test WorkOS callback handling with valid and invalid tokens
- Test Linear OAuth flow with various error scenarios
- Test session management and token refresh logic

**Linear Integration**
- Test webhook signature verification with valid and tampered signatures
- Test Initiative creation and selection flows
- Test Project status change handling
- Test Issue creation with various field combinations

**Job Board**
- Test job listing cache invalidation on Project updates
- Test application form validation with boundary cases (empty strings, whitespace)
- Test file upload handling with various file types and sizes

**AI Services**
- Test Cerebras integration with mock responses
- Test job description enhancement with mock LLM outputs
- Test AI Pre-screening logic with predefined confidence scores

### Property-Based Testing Approach

Property-based tests will verify universal properties across all inputs using **fast-check** (JavaScript/TypeScript property-based testing library).

**Configuration**: Each property-based test will run a minimum of 100 iterations to ensure thorough coverage of the input space.

**Tagging Convention**: Each property-based test will include a comment tag in this exact format:
```typescript
// **Feature: ai-ats-linear-integration, Property {number}: {property_text}**
```

**Property Test Coverage**:

Each correctness property listed in the Correctness Properties section will be implemented as a single property-based test. The tests will generate random valid inputs and verify the specified behavior holds across all generated cases.

**Example Property Test Structure**:
```typescript
// **Feature: ai-ats-linear-integration, Property 8: Application validation rules**
test('application validation accepts valid inputs and rejects invalid inputs', () => {
  fc.assert(
    fc.property(
      fc.record({
        name: fc.string(),
        email: fc.emailAddress(),
        cv: fc.constant(mockFile)
      }),
      (validApp) => {
        expect(validateApplication(validApp)).toBe(true);
      }
    ),
    { numRuns: 100 }
  );
  
  fc.assert(
    fc.property(
      fc.oneof(
        fc.record({ name: fc.constant(''), email: fc.emailAddress(), cv: fc.constant(mockFile) }),
        fc.record({ name: fc.string(), email: fc.string(), cv: fc.constant(mockFile) }),
        fc.record({ name: fc.string(), email: fc.emailAddress(), cv: fc.constant(null) })
      ),
      (invalidApp) => {
        expect(validateApplication(invalidApp)).toBe(false);
      }
    ),
    { numRuns: 100 }
  );
});
```

**Generator Strategies**:
- Use smart generators that constrain inputs to valid domains (e.g., valid email formats, realistic file sizes)
- Generate edge cases automatically (empty strings, null values, boundary values)
- Create custom generators for domain objects (JobListing, CandidateApplication, ScreeningResult)

### Integration Testing

Integration tests will verify end-to-end workflows:
- Complete onboarding flow from WorkOS login through Linear setup
- Job listing publication flow from Project status change through public website display
- Application submission flow from form submission through AI pre-screening
- Webhook processing flow from Linear event through state synchronization

### Test Data Management

- Use factories for generating test data with realistic values
- Mock external services (WorkOS, Linear, LiquidMetal) in unit tests
- Use test Linear workspace for integration tests
- Clean up test data after each test run

## Security Considerations

### Authentication & Authorization
- Use WorkOS session tokens with secure HTTP-only cookies
- Implement CSRF protection for all state-changing operations
- Validate Linear OAuth tokens on every API request
- Implement rate limiting per user session

### Data Protection
- Encrypt sensitive data at rest (Linear tokens, applicant PII)
- Use HTTPS for all communications
- Implement file upload virus scanning
- Sanitize all user inputs to prevent XSS attacks

### Webhook Security
- Verify Linear webhook signatures using HMAC
- Implement webhook replay attack prevention using timestamps
- Rate limit webhook endpoints
- Log all webhook events for audit trail

### API Security
- Implement API key rotation for LiquidMetal services
- Use least-privilege access for Linear API scopes
- Validate all input parameters against schemas
- Implement request size limits to prevent DoS

## Performance Considerations

### Caching Strategy
- Cache published job listings with 5-minute TTL
- Invalidate cache on Project updates via webhooks
- Use Redis for distributed caching in production
- Implement cache warming for frequently accessed jobs

### File Upload Optimization
- Parse CV content immediately on upload before creating Issue
- Upload files directly to Linear Documents API
- Implement client-side file compression before upload
- Use multipart upload for files larger than 5MB
- Validate file types and sizes before upload

### AI Operation Optimization
- Batch multiple screening operations when possible
- Implement queue system for AI operations to prevent overload
- Use async processing for non-blocking AI operations
- Leverage Cerebras' fast inference speeds for real-time responses
- Read CV content directly from Issue description (no additional API calls needed)

### Database Optimization
- Index Linear IDs for fast lookups
- Implement connection pooling for database connections
- Use pagination for large result sets
- Implement query result caching for expensive operations

## Deployment Architecture

### NextJS Deployment
- Deploy on Vercel or similar serverless platform
- Use edge functions for authentication middleware
- Configure environment variables for API keys and secrets
- Implement health check endpoints

### Database
- Use PostgreSQL for session storage and caching
- Implement automated backups with point-in-time recovery
- Use connection pooling (PgBouncer)
- Configure read replicas for scaling

### Monitoring & Observability (Datadog)

**Datadog Integration**
- Initialize Datadog APM tracer on application startup
- Configure Datadog SDK with service name, environment, and version tags
- Use dd-trace for automatic instrumentation of HTTP requests, database queries, and external API calls

**Metrics Collection**
- Track API request metrics: duration, status code, endpoint, user ID
- Monitor AI operation metrics: LLM latency, token usage, success/failure rate, model used
- Track webhook processing metrics: event type, processing duration, success/failure outcome
- Monitor job listing metrics: view counts, application submission rates
- Track authentication metrics: login success/failure, token refresh rates

**Logging Strategy**
- Implement structured logging with correlation IDs for request tracing
- Log all errors with full context: stack trace, correlation ID, user ID, request parameters
- Log security events: webhook signature failures, authentication failures, rate limit violations
- Log AI operations: prompts (sanitized), responses (truncated), latency, token counts
- Use Datadog log levels: DEBUG, INFO, WARN, ERROR, CRITICAL

**Distributed Tracing**
- Trace complete workflows: onboarding, job publication, application submission, AI pre-screening
- Propagate correlation IDs across service boundaries (Linear API, Cerebras API, WorkOS)
- Tag traces with relevant metadata: user ID, organization ID, job ID, candidate ID

**Alerting**
- Configure alerts for error rate thresholds (>5% error rate over 5 minutes)
- Alert on AI operation failures (>10% failure rate over 10 minutes)
- Alert on webhook processing delays (>30 seconds average processing time)
- Alert on authentication failures (>20 failures per minute)
- Emit Datadog events for critical failures to trigger PagerDuty/Slack notifications

**Dashboards**
- Create dashboard for API performance: request rates, latency percentiles, error rates
- Create dashboard for AI operations: LLM latency, token usage trends, success rates
- Create dashboard for webhook processing: event volumes, processing times, failure rates
- Create dashboard for business metrics: job views, application submissions, candidate pipeline

### Scalability
- Horizontal scaling of NextJS instances
- Queue-based processing for AI operations
- CDN for static assets and public job board
- Database read replicas for query scaling
