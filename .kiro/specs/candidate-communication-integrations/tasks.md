# Implementation Plan

- [x] 1. Set up Resend integration and email templates
- [x] 1.1 Install Resend SDK and configure environment variables
  - Add `resend` package to dependencies
  - Configure `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_DOMAIN`, `RESEND_WEBHOOK_SECRET`
  - Add Resend template IDs to environment variables
  - _Requirements: 1.1, 2.1, 4.1, 5.1_

- [x] 1.2 Create Resend email templates in dashboard
  - Create confirmation email template with variables: `candidate_name`, `organization_name`, `position_title`
  - Create rejection email template with variables: `candidate_name`, `position_title`
  - Create screening invitation template with variables: `candidate_name`, `organization_name`, `position_title`, `session_link`, `job_description`, `conversation_pointers`
  - Create comment email template with variables: `candidate_name`, `position_title`, `comment_body`
  - Publish all templates
  - _Requirements: 1.1, 2.1, 4.1, 5.1_

- [x] 1.3 Create Resend client service
  - Implement `lib/resend/client.ts` with Resend SDK initialization
  - Implement email sending functions using templates
  - Implement webhook signature verification using Resend SDK
  - _Requirements: 1.1, 2.1, 4.1, 5.1, 10.1_

- [ ]* 1.4 Write property test for email sending
  - **Property 1: Application confirmation email delivery**
  - **Validates: Requirements 1.1, 1.3**

- [x] 2. Implement email threading service
- [x] 2.1 Create email threading utilities
  - Implement `lib/resend/email-threading.ts`
  - Implement `generateReplyToAddress()` to encode org and issue ID
  - Implement `parseReplyToAddress()` to extract metadata
  - Implement `cleanEmailContent()` to strip quotes and formatting
  - Implement `extractMessageIdFromComment()` to parse Message-ID from comments
  - Implement `formatEmailCommentWithMetadata()` to add footer
  - Implement `sendThreadedEmail()` with proper headers
  - _Requirements: 2.1, 3.1, 3.2, 3.3_

- [ ]* 2.2 Write property test for reply address encoding
  - **Property 27: Orphaned data error handling** (partial)
  - **Validates: Requirements 3.4**

- [ ]* 2.3 Write property test for email content cleaning
  - **Property 9: Email content preservation**
  - **Validates: Requirements 3.3**

- [x] 3. Add benefit check configuration
- [x] 3.1 Add benefit IDs to configuration
  - Add `POLAR_EMAIL_COMMUNICATION_BENEFIT_ID` to environment variables
  - Add `POLAR_AI_SCREENING_BENEFIT_ID` to environment variables
  - Update `lib/config.ts` with new benefit IDs
  - _Requirements: 9.1, 9.2_

- [x] 3.2 Create benefit check helper functions
  - Create `lib/polar/benefits.ts` with benefit checking utilities
  - Implement `checkEmailCommunicationBenefit(linearOrgId)`
  - Implement `checkAIScreeningBenefit(linearOrgId)`
  - Add error handling and logging for benefit checks
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ]* 3.3 Write property test for benefit enforcement
  - **Property 20: Email communication benefit enforcement**
  - **Property 21: AI screening benefit enforcement**
  - **Property 22: Benefit check failure handling**
  - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [ ] 4. Implement confirmation email on application submission
- [ ] 4.1 Update state machine to send confirmation email
  - Modify `lib/linear/state-machine.ts` to check email communication benefit when "New" label is added
  - Send confirmation email after issue creation
  - Generate dynamic reply-to address with org and issue ID
  - Add comment to Linear Issue documenting email sent with Message-ID
  - Handle email sending failures gracefully
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ]* 4.2 Write property test for confirmation email flow
  - **Property 1: Application confirmation email delivery**
  - **Property 2: Email-comment synchronization** (partial)
  - **Property 3: Email content completeness** (partial)
  - **Property 4: Application processing resilience**
  - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

- [ ] 5. Implement Resend webhook handler for email replies
- [ ] 5.1 Create Resend webhook endpoint
  - Create `app/api/webhooks/resend/route.ts`
  - Implement webhook signature verification using Resend SDK
  - Parse incoming email events
  - Extract Linear org and issue ID from reply-to address
  - Clean email content (remove quotes and formatting)
  - Add email content as system comment to Linear Issue with metadata footer
  - Handle orphaned emails (log and notify)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 10.1, 10.3, 10.4, 10.5_

- [ ]* 5.2 Write property test for webhook processing
  - **Property 8: Email reply webhook processing**
  - **Property 9: Email content preservation**
  - **Property 24: Webhook signature validation** (partial)
  - **Property 25: Invalid webhook rejection** (partial)
  - **Validates: Requirements 3.1, 3.2, 3.3, 10.1, 10.3, 10.4**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement comment-to-email functionality
- [ ] 7.1 Update Linear webhook handler for comments
  - Modify `app/api/webhooks/linear/route.ts` to handle comment events
  - Implement comment detection (user vs system)
  - Check email communication benefit
  - Extract previous Message-ID from last email comment
  - Send comment as email with threading headers
  - Add note to Linear Issue documenting email sent
  - Update `app/api/webhooks/linear/route.ts` to handle Comment events
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ]* 7.2 Write property test for comment-to-email
  - **Property 5: User comment to email conversion**
  - **Property 6: System message filtering**
  - **Property 7: Multiple comment handling**
  - **Validates: Requirements 2.1, 2.2, 2.5**

- [ ] 8. Implement rejection email functionality
- [ ] 8.1 Update state machine for rejection state
  - Add rejection state detection to `lib/linear/state-machine.ts`
  - Detect when Issue moves to "Declined" state
  - Check email communication benefit
  - Check if rejection email already sent (idempotence)
  - Send rejection email with threading headers
  - Add comment to Linear Issue documenting rejection email
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ]* 8.2 Write property test for rejection emails
  - **Property 10: Rejection email delivery**
  - **Property 11: Rejection email idempotence**
  - **Validates: Requirements 4.1, 4.5**

- [ ] 9. Set up ElevenLabs integration
- [ ] 9.1 Install ElevenLabs SDK and configure environment
  - Add `@elevenlabs/elevenlabs-js` package to dependencies
  - Configure `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET`
  - _Requirements: 5.1, 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 9.2 Configure ElevenLabs agent in dashboard
  - Create agent with dynamic variables in system prompt: `{{company_name}}`, `{{candidate_name}}`, `{{job_description}}`, `{{job_application}}`, `{{conversation_pointers}}`
  - Configure first message with dynamic variables
  - Set voice and model settings
  - Configure webhook URL to `/api/webhooks/elevenlabs`
  - Publish agent
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 9.3 Create ElevenLabs client service
  - Implement `lib/elevenlabs/client.ts` with ElevenLabs SDK
  - Implement `createAgentSessionLink()` with base64-encoded variables
  - Implement webhook signature verification
  - _Requirements: 5.1, 6.1, 6.2, 6.3, 6.4, 6.5, 10.2_

- [ ]* 9.4 Write property test for session link generation
  - **Property 13: Agent session context completeness**
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [ ] 10. Implement conversation pointers generation
- [ ] 10.1 Create Cerebras conversation pointers service
  - Implement `lib/cerebras/conversation-pointers.ts`
  - Create prompt for generating conversation pointers
  - Implement `generateConversationPointers()` function
  - Parse and validate Cerebras response
  - Handle errors and fallbacks
  - _Requirements: 6.4_

- [ ]* 10.2 Write property test for conversation pointers
  - **Property 13: Agent session context completeness** (partial)
  - **Validates: Requirements 6.4**

- [ ] 11. Implement screening invitation after pre-screening
- [ ] 11.1 Update state machine to send screening invitations
  - Modify `lib/linear/state-machine.ts` to check AI screening benefit when issue moves to "In Progress" with "Pre-screened" label
  - Generate conversation pointers using Cerebras
  - Create ElevenLabs agent session link with dynamic variables
  - Send screening invitation email with session link
  - Add comment to Linear Issue documenting invitation
  - Store session metadata in Redis
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 11.2 Write property test for screening invitation
  - **Property 12: Screening invitation delivery**
  - **Validates: Requirements 5.1, 5.3**

- [ ] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement transcript evaluation service
- [ ] 13.1 Create Cerebras transcript evaluation service
  - Implement `lib/cerebras/transcript-evaluation.ts`
  - Create prompt for evaluating transcripts
  - Implement `evaluateTranscript()` function
  - Parse evaluation result (pass/fail/inconclusive)
  - Extract reasoning and confidence
  - Handle errors and edge cases
  - _Requirements: 7.2_

- [ ]* 13.2 Write property test for transcript evaluation
  - **Property 14: Transcript webhook processing** (partial)
  - **Validates: Requirements 7.2**

- [ ] 14. Implement ElevenLabs webhook handler
- [ ] 14.1 Create ElevenLabs webhook endpoint
  - Create `app/api/webhooks/elevenlabs/route.ts`
  - Implement webhook signature verification using ElevenLabs SDK
  - Parse conversation completed events
  - Retrieve session metadata from Redis
  - Extract transcript from webhook payload
  - Evaluate transcript using Cerebras
  - Update Linear Issue state based on evaluation
  - Attach transcript as file to Linear Issue (with fallback to comment)
  - Add comment with evaluation summary
  - Handle orphaned transcripts (log and notify)
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 10.2, 10.3, 10.4, 10.5_

- [ ]* 14.2 Write property test for transcript processing
  - **Property 14: Transcript webhook processing**
  - **Property 15: Pass evaluation state transition**
  - **Property 16: Fail evaluation state transition**
  - **Property 17: Inconclusive evaluation state preservation**
  - **Property 18: Transcript attachment**
  - **Property 19: Transcript attachment fallback**
  - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.3, 8.4**

- [ ] 15. Implement error handling and logging
- [ ] 15.1 Add comprehensive error handling
  - Add error handling for all email sending operations
  - Add error handling for all webhook processing
  - Add error handling for all benefit checks
  - Add error handling for all external API calls
  - Implement retry logic where appropriate
  - _Requirements: 1.4, 3.4, 3.5, 5.5, 8.5, 10.3, 10.4, 10.5_

- [ ] 15.2 Add logging and monitoring
  - Add Datadog logging for all email operations
  - Add Datadog logging for all webhook events
  - Add Datadog logging for benefit checks
  - Add Datadog metrics for email send rates
  - Add Datadog metrics for webhook processing times
  - Add security event logging for webhook failures
  - _Requirements: 3.4, 3.5, 5.5, 8.5, 10.3_

- [ ]* 15.3 Write property test for error handling
  - **Property 4: Application processing resilience**
  - **Property 27: Orphaned data error handling**
  - **Property 28: External service failure logging**
  - **Validates: Requirements 1.4, 3.4, 5.5, 8.5**

- [ ] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
