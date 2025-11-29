# Implementation Plan

- [x] 1. Set up project structure and dependencies
  - Initialize NextJS project with TypeScript and App Router
  - Install and configure WorkOS SDK for authentication
  - Install and configure Linear SDK for API integration
  - Install and configure LiquidMetal SDK for AI services
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

- [ ] 3. Implement onboarding and Linear setup
  - [ ] 3.1 Create Initiative management interface
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
  
  - [ ] 3.4 Implement Tone of Voice Document management
    - Create function to check for existing Tone of Voice Document in Initiative
    - Implement default Tone of Voice Document creation logic
    - Create ensureToneOfVoiceDocument function combining check and creation
    - _Requirements: 1.5, 1.6_
  
  - [ ]* 3.5 Write property test for Tone of Voice Document guarantee
    - **Property 4: Tone of Voice Document existence guarantee**
    - **Validates: Requirements 1.5, 1.6**

- [ ] 4. Implement job board and Project synchronization
  - [ ] 4.1 Create Project synchronization module
    - Implement syncProjects function to fetch Projects from ATS Container
    - Create getPublishedJobs function filtering by "In Progress" status
    - Implement job listing cache with Redis or in-memory store
    - Create cache invalidation logic for Project updates
    - _Requirements: 2.1, 2.2_
  
  - [ ]* 4.2 Write property test for job listing visibility
    - **Property 5: Job listing visibility based on Project status**
    - **Validates: Requirements 2.1, 2.2**
  
  - [ ] 4.3 Create public job board API routes
    - Implement GET /api/jobs endpoint returning published listings
    - Implement GET /api/jobs/[id] endpoint for specific job details
    - Add server-side rendering for job board pages
    - _Requirements: 2.1, 2.2_
  
  - [ ]* 4.4 Write unit tests for job board API
    - Test job listing endpoint with various Project statuses
    - Test job details endpoint with valid and invalid IDs
    - Test cache behavior on Project updates
    - _Requirements: 2.1, 2.2_

- [ ] 5. Implement AI job description generation
  - [ ] 5.1 Create LiquidMetal SmartInference integration
    - Implement SmartInference client initialization
    - Create generateJobDescription function with LLM prompt
    - Design prompt template using Project description and Tone of Voice
    - Implement error handling and retry logic for LLM calls
    - _Requirements: 2.4, 5.2_
  
  - [ ] 5.2 Implement AI generation trigger logic
    - Create checkAIGeneratedLabel function to verify label presence
    - Implement logic to trigger generation for unlabeled "In Progress" Projects
    - Create updateProjectDescription function to update Linear Project
    - Implement label application after successful generation
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

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement Linear webhook handling
  - [ ] 7.1 Create webhook infrastructure
    - Implement POST /api/webhooks/linear endpoint
    - Create webhook signature verification using HMAC
    - Implement webhook event routing to appropriate handlers
    - Add replay attack prevention using timestamps
    - _Requirements: 2.6_
  
  - [ ] 7.2 Implement webhook event handlers
    - Create handler for Project status change events
    - Create handler for Project description update events
    - Create handler for Issue creation events
    - Implement cache invalidation on relevant events
    - _Requirements: 2.6, 4.1_
  
  - [ ]* 7.3 Write unit tests for webhook handling
    - Test signature verification with valid and tampered signatures
    - Test event routing to correct handlers
    - Test replay attack prevention
    - _Requirements: 2.6_

- [ ] 8. Implement application submission and validation
  - [ ] 8.1 Create application form component
    - Build React form component with Name, Email, CV, and Cover Letter fields
    - Implement client-side validation with real-time feedback
    - Add file upload handling with drag-and-drop support
    - Implement file type and size validation (PDF, DOC, DOCX, max 10MB)
    - _Requirements: 3.1_
  
  - [ ] 8.2 Create application submission API
    - Implement POST /api/jobs/[id]/apply endpoint
    - Create validateApplication function with email format and required field checks
    - Implement error response with specific field-level error messages
    - _Requirements: 3.1, 3.2_
  
  - [ ]* 8.3 Write property test for application validation
    - **Property 8: Application validation rules**
    - **Validates: Requirements 3.1**
  
  - [ ]* 8.4 Write property test for validation failure handling
    - **Property 9: Validation failure prevents submission**
    - **Validates: Requirements 3.2**
  
  - [ ]* 8.5 Write unit tests for application form
    - Test form validation with boundary cases (empty strings, whitespace)
    - Test file upload with various file types and sizes
    - Test error message display
    - _Requirements: 3.1, 3.2_

- [ ] 9. Implement candidate Issue creation
  - [ ] 9.1 Create LiquidMetal SmartBuckets integration
    - Implement SmartBuckets client initialization
    - Create uploadToSmartBuckets function with file streaming
    - Implement retrieveFromSmartBuckets function for document access
    - Add error handling and retry logic for uploads
    - _Requirements: 5.1, 5.3_
  
  - [ ] 9.2 Implement Issue creation workflow
    - Create createCandidateIssue function using Linear SDK
    - Implement CV upload to SmartBuckets with streaming
    - Create Linear Document attachment linking CV to Issue
    - Store SmartBuckets reference URL in Issue description or custom field
    - Implement cover letter upload and attachment (conditional)
    - Set Issue state to "Triage" on creation
    - _Requirements: 3.3, 3.4, 3.5, 3.6_
  
  - [ ]* 9.3 Write property test for Issue creation
    - **Property 10: Issue creation for valid applications**
    - **Validates: Requirements 3.3**
  
  - [ ]* 9.4 Write property test for document attachment
    - **Property 11: Document attachment for applications**
    - **Validates: Requirements 3.4, 3.5**
  
  - [ ]* 9.5 Write property test for initial Issue state
    - **Property 12: Initial Issue state assignment**
    - **Validates: Requirements 3.6**
  
  - [ ]* 9.6 Write property test for SmartBuckets storage
    - **Property 17: SmartBuckets storage for AI documents**
    - **Validates: Requirements 5.1, 5.3**
  
  - [ ]* 9.7 Write property test for dual storage
    - **Property 19: Dual storage for applicant files**
    - **Validates: Requirements 5.4**

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement AI pre-screening agent
  - [ ] 11.1 Create AI screening logic
    - Implement screenCandidate function using SmartInference
    - Design prompt template for candidate evaluation with CV and Job Description
    - Create evaluateCandidateFit function to parse LLM response
    - Implement confidence scoring logic (high/low/ambiguous)
    - _Requirements: 4.2_
  
  - [ ] 11.2 Implement screening workflow
    - Create triggerPreScreening function called on Issue creation
    - Implement check for "In Progress" Project status before triggering
    - Retrieve CV content from SmartBuckets using reference
    - Retrieve Job Description from Linear Project
    - Call screenCandidate with both inputs
    - _Requirements: 4.1, 4.2_
  
  - [ ]* 11.3 Write property test for AI pre-screening trigger
    - **Property 13: AI Pre-screening trigger for active Projects**
    - **Validates: Requirements 4.1**
  
  - [ ]* 11.4 Write property test for AI screening inputs
    - **Property 14: AI screening inputs**
    - **Validates: Requirements 4.2**
  
  - [ ]* 11.5 Write property test for SmartInference usage
    - **Property 18: SmartInference for LLM operations**
    - **Validates: Requirements 5.2**

- [ ] 12. Implement Issue state management based on AI results
  - [ ] 12.1 Create state transition logic
    - Implement determineIssueState function mapping confidence to states
    - Create updateIssueState function using Linear SDK
    - Implement state transition: high confidence → "Screening"
    - Implement state transition: low confidence → "Declined"
    - Implement state transition: ambiguous → "Triage" (no change)
    - _Requirements: 4.3, 4.4, 4.5_
  
  - [ ] 12.2 Implement AI reasoning comments
    - Create generateReasoningComment function formatting AI output
    - Implement addIssueComment function using Linear SDK
    - Include specific evidence from CV in comment
    - Add comment whenever state transition occurs
    - _Requirements: 4.6_
  
  - [ ]* 12.3 Write property test for confidence-to-state mapping
    - **Property 15: AI confidence maps to Issue state**
    - **Validates: Requirements 4.3, 4.4, 4.5**
  
  - [ ]* 12.4 Write property test for AI reasoning comments
    - **Property 16: AI reasoning comment on state transition**
    - **Validates: Requirements 4.6**
  
  - [ ]* 12.5 Write unit tests for state management
    - Test state transitions with various confidence scores
    - Test comment formatting with different AI outputs
    - Test error handling for state transition failures
    - _Requirements: 4.3, 4.4, 4.5, 4.6_

- [ ] 13. Implement semantic search capabilities
  - [ ] 13.1 Create vector search integration
    - Implement searchSmartBuckets function with vector similarity
    - Create query embedding generation for search terms
    - Implement result ranking and filtering logic
    - Add caching for frequently accessed embeddings
    - _Requirements: 5.5_
  
  - [ ]* 13.2 Write property test for vector search
    - **Property 20: Vector search for semantic operations**
    - **Validates: Requirements 5.5**
  
  - [ ]* 13.3 Write unit tests for semantic search
    - Test vector search with various query types
    - Test result ranking logic
    - Test embedding cache behavior
    - _Requirements: 5.5_

- [ ] 14. Implement error handling and resilience
  - [ ] 14.1 Add comprehensive error handling
    - Implement exponential backoff for Linear API rate limiting
    - Add retry logic for network failures (max 3 attempts)
    - Implement fallback to manual triage for AI service failures
    - Add virus scanning for uploaded files
    - Create user-friendly error messages for all error types
    - _Requirements: All_
  
  - [ ]* 14.2 Write unit tests for error handling
    - Test retry logic with simulated failures
    - Test fallback behavior for AI timeouts
    - Test error message formatting
    - _Requirements: All_

- [ ] 15. Implement monitoring and logging
  - [ ] 15.1 Add structured logging
    - Implement correlation IDs for request tracing
    - Add logging for all webhook events
    - Log AI operation latency and results
    - Create security event logging for webhook signature failures
    - _Requirements: All_
  
  - [ ] 15.2 Add performance monitoring
    - Track webhook processing time metrics
    - Monitor AI operation latency
    - Track job listing view counts
    - Implement health check endpoints
    - _Requirements: All_

- [ ] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Integration and end-to-end testing
  - [ ]* 17.1 Write integration tests for complete workflows
    - Test complete onboarding flow from WorkOS to Linear setup
    - Test job publication flow from Project status change to public display
    - Test application submission flow from form to AI pre-screening
    - Test webhook processing flow from Linear event to state sync
    - _Requirements: All_
