# Implementation Plan

- [x] 1. Set up project structure and dependencies
  - Initialize NextJS project with TypeScript and App Router
  - Install and configure WorkOS SDK for authentication
  - Install and configure Linear SDK for API integration
  - Install and configure Cerebras SDK for AI inference
  - Install pdf-parse, mammoth, and file-type for document parsing
  - Install fast-check for property-based testing
  - Set up testing framework (Jest/Vitest) with TypeScript support
  - Configure environment variables for API keys and secrets
  - _Requirements: All_

- [x] 2. Implement authentication foundation
  - [x] 2.1 Create WorkOS authentication integration
    - Implement WorkOS AuthKit setup with social and email providers
    - Create authentication middleware for protected routes
    - Implement session management with secure cookies
    - Create auth context provider and useAuth hook
    - _Requirements: 1.1_
  
  - [ ]* 2.2 Write property test for WorkOS authentication flow
    - **Property 1: Linear OAuth triggers after WorkOS authentication**
    - **Validates: Requirements 1.2**
  
  - [x] 2.3 Implement Linear OAuth integration
    - Create Linear OAuth 2 actor authorization flow
    - Implement OAuth callback handler to store tokens
    - Create token refresh logic for expired tokens
    - Implement getLinearClient function with authenticated SDK instance
    - _Requirements: 1.2_
  
  - [ ]* 2.4 Write unit tests for authentication module
    - Test WorkOS callback handling with valid/invalid tokens
    - Test Linear OAuth flow error scenarios
    - Test token refresh logic
    - _Requirements: 1.1, 1.2_

- [x] 3. Implement onboarding and Linear setup
  - [x] 3.1 Create Initiative management interface
    - Implement fetchInitiatives function using Linear SDK
    - Create UI component for displaying Initiative list
    - Implement Initiative selection and creation logic
    - Store selected ATS Container Initiative ID in user session
    - _Requirements: 1.3, 1.4_
  
  - [ ]* 3.2 Write property test for Initiative fetch
    - **Property 2: Initiative fetch after Linear authorization**
    - **Validates: Requirements 1.3**
  
  - [ ]* 3.3 Write property test for Initiative selection options
    - **Property 3: Initiative selection provides both options**
    - **Validates: Requirements 1.4**
  
  - [x] 3.4 Implement Tone of Voice Document management
    - Create function to check for existing Tone of Voice Document in Initiative
    - Implement default Tone of Voice Document creation logic
    - Create ensureToneOfVoiceDocument function combining check and creation
    - _Requirements: 1.5, 1.6_
  
  - [ ]* 3.5 Write property test for Tone of Voice Document guarantee
    - **Property 4: Tone of Voice Document existence guarantee**
    - **Validates: Requirements 1.5, 1.6**

- [x] 4. Implement job board and Project synchronization
  - [x] 4.1 Create Project synchronization module
    - Implement syncProjects function to fetch Projects from ATS Container
    - Implement webhook for required Linear events
    - Create getPublishedJobs function filtering by "In Progress" status
    - _Requirements: 2.1, 2.2_
  
  - [ ]* 4.2 Write property test for job listing visibility
    - **Property 5: Job listing visibility based on Project status**
    - **Validates: Requirements 2.1, 2.2**
  
  - [x] 4.3 Create public job board pages
    - Implement GET /jobs/[linearOrg] page for published listings by Linear organization
    - Implement GET /jobs/[linearOrg]/[id] page for specific job details
    - Pages should be server-side rendered
    - _Requirements: 2.1, 2.2_
  
  - [ ]* 4.4 Write unit tests for job board API
    - Test job listing endpoint with various Project statuses
    - Test job details endpoint with valid and invalid IDs
    - Test cache behavior on Project updates
    - _Requirements: 2.1, 2.2_

- [x] 5. Implement AI job description generation
  - [x] 5.1 Create Cerebras integration
    - Implement Cerebras client initialization
    - Create enhanceJobDescription function with LLM prompt
    - Design prompt template using Project description and Tone of Voice
    - Implement error handling and retry logic for LLM calls
    - Use llama-3.3-70b model with temperature 0.2
    - _Requirements: 2.4, 5.1, 5.5_
  
  - [x] 5.2 Implement AI generation trigger logic via webhook
    - Implement webhook handler to detect Projects with "enhance" label
    - Implement logic to trigger generation for Projects with "enhance" label
    - Update Project content with enhanced description
    - Apply "ai-generated" label and remove "enhance" label after successful generation
    - _Requirements: 2.3, 2.4, 2.5_
  
  - [ ]* 5.3 Write property test for AI generation trigger
    - **Property 6: AI generation trigger for unlabeled Projects**
    - **Validates: Requirements 2.3, 2.4**
  
  - [ ]* 5.4 Write property test for description update and labeling
    - **Property 7: Job description update and labeling**
    - **Validates: Requirements 2.5**
  
  - [ ]* 5.5 Write unit tests for job description generation
    - Test LLM prompt construction with various inputs
    - Test error handling for LLM failures
    - Test label application logic
    - _Requirements: 2.4, 2.5_
  
  - [ ]* 5.6 Write property test for Cerebras usage
    - **Property 17: Cerebras for LLM operations**
    - **Validates: Requirements 5.1**
  
  - [ ]* 5.7 Write property test for model configuration
    - **Property 21: Consistent model configuration for job descriptions**
    - **Validates: Requirements 5.5**

- [x] 6. Implement Linear webhook handling
  - [x] 6.1 Create webhook infrastructure
    - Implement POST /api/webhooks/linear endpoint
    - Create webhook signature verification using HMAC
    - Implement webhook event routing to appropriate handlers
    - _Requirements: 2.6_
  
  - [x] 6.2 Implement webhook event handlers
    - Create handler for Project update events (AI enhancement trigger)
    - Create handler for Issue creation events (placeholder for AI pre-screening)
    - _Requirements: 2.6, 4.1_
  
  - [ ] 6.3 Add replay attack prevention
    - Implement timestamp validation in webhook handler
    - Reject webhooks with timestamps older than 5 minutes
    - _Requirements: 2.6_
  
  - [ ]* 6.4 Write unit tests for webhook handling
    - Test signature verification with valid and tampered signatures
    - Test event routing to correct handlers
    - Test replay attack prevention
    - _Requirements: 2.6_

- [x] 7. Implement application submission and validation
  - [x] 7.1 Create application form component
    - Build React form component with Name, Email, CV, and Cover Letter fields
    - Implement client-side validation with real-time feedback
    - Add file upload handling with drag-and-drop support
    - Implement file type and size validation (PDF, DOC, DOCX, max 10MB)
    - _Requirements: 3.1_
  
  - [x] 7.2 Create application submission API
    - Create validateApplication server function with email format and required field checks
    - Implement error response with specific field-level error messages
    - _Requirements: 3.1, 3.2_
  
  - [ ]* 7.3 Write property test for application validation
    - **Property 8: Application validation rules**
    - **Validates: Requirements 3.1**
  
  - [ ]* 7.4 Write property test for validation failure handling
    - **Property 9: Validation failure prevents submission**
    - **Validates: Requirements 3.2**
  
  - [ ]* 7.5 Write unit tests for application form
    - Test form validation with boundary cases (empty strings, whitespace)
    - Test file upload with various file types and sizes
    - Test error message display
    - _Requirements: 3.1, 3.2_

- [x] 8. Implement candidate Issue creation with CV parsing
  - [x] 8.1 Create CV parsing module
    - Create lib/linear/cv-parser.ts file
    - Create parseCV function that accepts file buffer and file type
    - Implement PDF parsing using pdf-parse library
    - Implement DOC/DOCX parsing using mammoth library
    - Use file-type to detect and validate file format
    - Add error handling for corrupted or unsupported files
    - Return extracted text content as string
    - _Requirements: 5.2_
  
  - [x] 8.2 Update Linear Issue creation workflow
    - Update createCandidateIssue function in lib/linear/issues.ts to accept parsed CV text parameter
    - Append parsed CV text to Issue description after a line break
    - Keep existing CV upload as Linear attachment (already implemented)
    - Keep existing cover letter upload logic (already implemented)
    - Issue state "Triage" assignment already implemented
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 5.3, 5.4_
  
  - [x] 8.3 Update application submission flow
    - Update submitApplication in lib/actions/application.ts
    - Parse CV file using parseCV before creating Issue
    - Pass parsed CV text to createCandidateIssue
    - Handle parsing errors gracefully (create Issue without CV text if parsing fails)
    - _Requirements: 3.3, 5.2, 5.3_
  
  - [ ]* 8.4 Write property test for Issue creation
    - **Property 10: Issue creation for valid applications**
    - **Validates: Requirements 3.3**
  
  - [ ]* 8.5 Write property test for document attachment
    - **Property 11: Document attachment for applications**
    - **Validates: Requirements 3.4, 3.5**
  
  - [ ]* 8.6 Write property test for initial Issue state
    - **Property 12: Initial Issue state assignment**
    - **Validates: Requirements 3.6**
  
  - [ ]* 8.7 Write property test for CV parsing
    - **Property 18: CV parsing on upload**
    - **Validates: Requirements 5.2**
  
  - [ ]* 8.8 Write property test for CV content in Issue
    - **Property 19: CV content in Issue description**
    - **Validates: Requirements 5.3**
  
  - [ ]* 8.9 Write property test for Linear Document attachment
    - **Property 20: Linear Document attachment for human access**
    - **Validates: Requirements 5.4**
  
  - [ ]* 8.10 Write unit tests for CV parsing
    - Test PDF parsing with sample PDF files
    - Test DOC/DOCX parsing with sample Word files
    - Test error handling for corrupted files
    - Test file type detection
    - _Requirements: 5.2_

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement AI pre-screening agent
  - [x] 10.1 Create AI screening logic
    - Create lib/cerebras/candidate-screening.ts file
    - Implement screenCandidate function using Cerebras API
    - Design prompt template for candidate evaluation with Issue description (contains CV) and Job Description
    - Use llama-3.3-70b model for screening
    - Parse LLM response to extract confidence level (high/low/ambiguous) and reasoning
    - Return structured screening result with confidence and reasoning
    - _Requirements: 4.2, 5.1_
  
  - [x] 10.2 Implement screening workflow integration
    - Create lib/linear/pre-screening.ts file
    - Implement triggerPreScreening function called on Issue creation
    - Implement check for "In Progress" Project status before triggering
    - Read Issue description directly (contains parsed CV text)
    - Retrieve Job Description from Linear Project
    - Call screenCandidate with Issue description and Job Description
    - _Requirements: 4.1, 4.2_
  
  - [x] 10.3 Update webhook handler for Issue creation
    - Update handleIssueCreation in app/api/webhooks/linear/route.ts
    - Call triggerPreScreening when new Issue is created
    - Handle screening errors gracefully (log and continue)
    - _Requirements: 4.1_
  
  - [ ]* 10.4 Write property test for AI pre-screening trigger
    - **Property 13: AI Pre-screening trigger for active Projects**
    - **Validates: Requirements 4.1**
  
  - [ ]* 10.5 Write property test for AI screening inputs
    - **Property 14: AI screening inputs**
    - **Validates: Requirements 4.2**

- [x] 11. Implement Issue state management based on AI results
  - [x] 11.1 Create state transition logic
    - Create lib/linear/state-management.ts file
    - Implement determineIssueState function mapping confidence to states
    - Create updateIssueState function using Linear SDK
    - Implement state transition: high confidence → "Screening"
    - Implement state transition: low confidence → "Declined"
    - Implement state transition: ambiguous → "Triage" (no change)
    - _Requirements: 4.3, 4.4, 4.5_
  
  - [x] 11.2 Implement AI reasoning comments
    - Create generateReasoningComment function formatting AI output
    - Implement addIssueComment function using Linear SDK
    - Include specific evidence from CV in comment
    - Add comment whenever state transition occurs
    - _Requirements: 4.6_
  
  - [x] 11.3 Integrate state management with pre-screening
    - Update triggerPreScreening in lib/linear/pre-screening.ts
    - Call determineIssueState with screening result
    - Call updateIssueState to transition Issue
    - Call addIssueComment to add AI reasoning
    - _Requirements: 4.3, 4.4, 4.5, 4.6_
  
  - [ ]* 11.4 Write property test for confidence-to-state mapping
    - **Property 15: AI confidence maps to Issue state**
    - **Validates: Requirements 4.3, 4.4, 4.5**
  
  - [ ]* 11.5 Write property test for AI reasoning comments
    - **Property 16: AI reasoning comment on state transition**
    - **Validates: Requirements 4.6**
  
  - [ ]* 11.6 Write unit tests for state management
    - Test state transitions with various confidence scores
    - Test comment formatting with different AI outputs
    - Test error handling for state transition failures
    - _Requirements: 4.3, 4.4, 4.5, 4.6_

- [ ] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement error handling and resilience
  - [x] 13.1 Add comprehensive error handling
    - Create lib/utils/retry.ts with exponential backoff utility
    - Implement retry logic for Linear API calls (max 3 attempts)
    - Add retry logic to Cerebras API calls in job-description.ts and candidate-screening.ts
    - Implement fallback to manual triage for AI service failures in pre-screening
    - Add user-friendly error messages for all error types
    - _Requirements: All_
  
  - [ ]* 13.2 Write unit tests for error handling
    - Test retry logic with simulated failures
    - Test fallback behavior for AI timeouts
    - Test error message formatting
    - _Requirements: All_

- [x] 14. Implement Datadog observability
  - [x] 14.1 Set up Datadog integration
    - Install dd-trace and datadog-api-client packages
    - Create lib/datadog/client.ts with Datadog initialization
    - Implement initializeDatadog function with service name, environment, and version tags
    - Configure Datadog APM tracer for automatic instrumentation
    - Add Datadog initialization to application startup in app/layout.tsx or instrumentation.ts
    - Set up environment variables for Datadog API key and configuration
    - _Requirements: 6.5_
  
  - [x] 14.2 Implement structured logging with Datadog
    - Create lib/datadog/logger.ts with structured logging utilities
    - Implement logger with correlation ID support
    - Add log methods: info, error, warn, debug with Datadog integration
    - Create withCorrelationId middleware for NextJS routes
    - Integrate logger throughout codebase replacing console.log statements
    - _Requirements: 6.2_
  
  - [x] 14.3 Add API request metrics tracking
    - Create lib/datadog/metrics.ts for metrics utilities
    - Implement trackAPIRequest function to record duration, status code, and endpoint
    - Create Datadog middleware for automatic API request tracking
    - Add middleware to NextJS middleware.ts for all API routes
    - _Requirements: 6.1_
  
  - [x] 14.4 Implement AI operation metrics
    - Create trackAIOperation function in lib/datadog/metrics.ts
    - Add metrics tracking to lib/cerebras/job-description.ts for job description generation
    - Add metrics tracking to lib/cerebras/candidate-screening.ts for candidate screening
    - Track LLM latency, token usage, and operation success/failure rate
    - _Requirements: 6.3_
  
  - [x] 14.5 Add webhook processing metrics
    - Create trackWebhookProcessing function in lib/datadog/metrics.ts
    - Add metrics tracking to app/api/webhooks/linear/route.ts
    - Track event type, processing duration, and outcome for all webhook events
    - _Requirements: 6.4_
  
  - [x] 14.6 Implement error logging with full context
    - Update error handling throughout codebase to use Datadog logger
    - Ensure all errors include stack trace, correlation ID, and relevant metadata
    - Add error logging to lib/utils/retry.ts for retry failures
    - Add error logging to all API routes and server actions
    - _Requirements: 6.2_
  
  - [x] 14.7 Add critical failure event emission
    - Create lib/datadog/events.ts for Datadog event utilities
    - Implement emitDatadogEvent function for custom events
    - Implement emitCriticalFailure function for high-priority alerts
    - Implement emitSecurityEvent function for security-related events
    - Add critical failure events to AI operation failures, webhook processing failures, and authentication failures
    - _Requirements: 6.6_
  
  - [x] 14.8 Create distributed tracing for key workflows
    - Add custom span creation for onboarding workflow
    - Add custom span creation for job publication workflow
    - Add custom span creation for application submission workflow
    - Add custom span creation for AI pre-screening workflow
    - Ensure correlation IDs propagate across all service calls
    - _Requirements: 6.5_
  
  - [x] 14.9 Add health check endpoint
    - Create app/api/health/route.ts for health check endpoint
    - Implement basic health check returning service status
    - Add checks for critical dependencies (Linear API, Cerebras API, database)
    - _Requirements: 6.1_
  
  - [ ]* 14.10 Write property test for API request metrics
    - **Property 22: API request metrics to Datadog**
    - **Validates: Requirements 6.1**
  
  - [ ]* 14.11 Write property test for error logging
    - **Property 23: Error logging to Datadog**
    - **Validates: Requirements 6.2**
  
  - [ ]* 14.12 Write property test for AI operation metrics
    - **Property 24: AI operation metrics tracking**
    - **Validates: Requirements 6.3**
  
  - [ ]* 14.13 Write property test for webhook metrics
    - **Property 25: Webhook processing metrics**
    - **Validates: Requirements 6.4**
  
  - [ ]* 14.14 Write property test for APM initialization
    - **Property 26: Datadog APM initialization**
    - **Validates: Requirements 6.5**
  
  - [ ]* 14.15 Write property test for critical failure events
    - **Property 27: Critical failure events**
    - **Validates: Requirements 6.6**
  
  - [ ]* 14.16 Write unit tests for Datadog integration
    - Test logger with various log levels and contexts
    - Test metrics tracking with mock Datadog client
    - Test event emission with various event types
    - Test correlation ID propagation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Integration and end-to-end testing
  - [ ]* 16.1 Write integration tests for complete workflows
    - Test complete onboarding flow from WorkOS to Linear setup
    - Test job publication flow from Project status change to public display
    - Test application submission flow from form to AI pre-screening
    - Test webhook processing flow from Linear event to state sync
    - _Requirements: All_
