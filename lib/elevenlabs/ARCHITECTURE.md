# ElevenLabs Integration Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         SCREENING INVITATION FLOW                         │
└──────────────────────────────────────────────────────────────────────────┘

1. Linear Webhook
   │
   ├─→ Candidate applies
   │   └─→ Issue created in Linear
   │
   ├─→ Issue moved to "Screening" state
   │   └─→ Triggers state machine
   │
   └─→ State Machine (lib/linear/state-machine.ts)
       │
       ├─→ Generate conversation pointers (Cerebras AI)
       │   └─→ AI analyzes CV + job description
       │       └─→ Creates focus areas for interview
       │
       ├─→ Create screening session (lib/elevenlabs/session-secrets.ts)
       │   │
       │   ├─→ Generate cryptographic secret (32 bytes)
       │   │   └─→ randomBytes(32).toString('base64url')
       │   │       └─→ Result: 43-character URL-safe string
       │   │
       │   └─→ Store in Redis
       │       └─→ Key: screening:secret:{secret}
       │           └─→ Value: {
       │                 linearOrg,
       │                 issueId,
       │                 candidateName,
       │                 candidateEmail,
       │                 companyName,
       │                 jobDescription,
       │                 candidateApplication,
       │                 conversationPointers,
       │                 createdAt,
       │                 expiresAt
       │               }
       │           └─→ TTL: 7 days
       │
       └─→ Send invitation email (Resend)
           └─→ Link: https://your-domain.com/interview/{secret}


┌──────────────────────────────────────────────────────────────────────────┐
│                         INTERVIEW SESSION FLOW                            │
└──────────────────────────────────────────────────────────────────────────┘

2. Candidate Clicks Link
   │
   └─→ Browser navigates to /interview/{secret}
       │
       └─→ Interview Page (app/interview/[secret]/page.tsx)
           │
           ├─→ Server Component
           │   │
           │   ├─→ Extract secret from URL params
           │   │
           │   ├─→ Validate secret format
           │   │   └─→ Must be 43 characters
           │   │
           │   ├─→ Retrieve session from Redis
           │   │   └─→ getScreeningSession(secret)
           │   │       └─→ Key: screening:secret:{secret}
           │   │           └─→ Returns session data or null
           │   │
           │   ├─→ Check expiration
           │   │   └─→ If expired: return 404
           │   │
           │   └─→ Render page with candidate name + company
           │
           └─→ Interview Client (interview-client.tsx)
               │
               ├─→ Client Component (React)
               │   │
               │   ├─→ useEffect on mount
               │   │   │
               │   │   └─→ Call getInterviewSession(secret)
               │   │       │
               │   │       └─→ Server Action (lib/actions/interview.ts)
               │   │           │
               │   │           ├─→ Validate secret
               │   │           │
               │   │           ├─→ Get session from Redis
               │   │           │
               │   │           ├─→ Create signed URL
               │   │           │   └─→ createSignedUrl(agentId)
               │   │           │       └─→ POST to ElevenLabs API
               │   │           │           └─→ Returns time-limited signed URL
               │   │           │
               │   │           └─→ Return {
               │   │                 success: true,
               │   │                 signedUrl,
               │   │                 candidateName,
               │   │                 companyName
               │   │               }
               │   │
               │   └─→ User clicks "Start Interview"
               │       │
               │       └─→ Initialize ElevenLabs conversation
               │           │
               │           ├─→ useConversation() from @11labs/react
               │           │   │
               │           │   ├─→ onConnect: () => setStatus('Connected')
               │           │   ├─→ onDisconnect: () => setStatus('Disconnected')
               │           │   ├─→ onMessage: (msg) => console.log(msg)
               │           │   └─→ onError: (err) => setError(err)
               │           │
               │           ├─→ conversation.startSession({
               │           │     signedUrl: signedUrl,
               │           │     dynamicVariables: {
               │           │       company_name: companyName,
               │           │       candidate_name: candidateName,
               │           │       job_description: jobDescription,
               │           │       job_application: candidateApplication,
               │           │       conversation_pointers: conversationPointers
               │           │     }
               │           │   })
               │           │
               │           ├─→ Get conversation ID
               │           │   └─→ conversationId = conversation.getId()
               │           │
               │           └─→ Associate conversation ID with session
               │               └─→ startInterviewSession(secret, conversationId)
               │                   │
               │                   └─→ Server Action
               │                       │
               │                       ├─→ Update session in Redis
               │                       │   └─→ Add conversationId to session data
               │                       │
               │                       └─→ Create reverse lookup
               │                           └─→ Key: screening:conversation:{conversationId}
               │                               └─→ Value: {secret}
               │                               └─→ TTL: 7 days
               │
               └─→ Candidate completes interview
                   └─→ ElevenLabs closes conversation


┌──────────────────────────────────────────────────────────────────────────┐
│                         WEBHOOK PROCESSING FLOW                           │
└──────────────────────────────────────────────────────────────────────────┘

3. ElevenLabs Sends Webhook
   │
   └─→ POST /api/webhooks/elevenlabs
       │
       └─→ Webhook Handler (app/api/webhooks/elevenlabs/route.ts)
           │
           ├─→ Verify signature
           │   └─→ verifyElevenLabsWebhook(body, signature, secret)
           │       └─→ Uses ElevenLabs SDK
           │           └─→ Validates HMAC-SHA256 signature
           │
           ├─→ Parse event
           │   └─→ Extract: {
           │         type: 'conversation.completed',
           │         data: {
           │           conversation_id,
           │           agent_id,
           │           transcript: [...],
           │           duration_seconds,
           │           ended_at
           │         }
           │       }
           │
           ├─→ Lookup session by conversation ID
           │   │
           │   └─→ getScreeningSessionByConversationId(conversationId)
           │       │
           │       ├─→ Step 1: Reverse lookup
           │       │   └─→ Key: screening:conversation:{conversationId}
           │       │       └─→ Value: {secret}
           │       │
           │       └─→ Step 2: Get session data
           │           └─→ Key: screening:secret:{secret}
           │               └─→ Value: {full session data}
           │
           ├─→ Format transcript
           │   └─→ formatTranscript(transcript)
           │       └─→ Convert to readable text format
           │
           ├─→ Evaluate transcript
           │   │
           │   └─→ evaluateTranscript(transcript, jobDesc, application)
           │       │
           │       └─→ Cerebras AI analyzes conversation
           │           │
           │           └─→ Returns: {
           │                 result: 'pass' | 'fail' | 'inconclusive',
           │                 reasoning: string,
           │                 confidence: string,
           │                 keyPoints: string[]
           │               }
           │
           ├─→ Update Linear Issue state
           │   │
           │   ├─→ If result === 'pass'
           │   │   └─→ Move to "Done" state
           │   │
           │   ├─→ If result === 'fail'
           │   │   └─→ Move to "Declined" state
           │   │
           │   └─→ If result === 'inconclusive'
           │       └─→ Keep current state
           │
           ├─→ Attach transcript to Linear Issue
           │   │
           │   ├─→ Try: Upload as file attachment
           │   │   │
           │   │   ├─→ Request upload URL from Linear
           │   │   ├─→ Upload file to URL
           │   │   └─→ Create attachment in Linear
           │   │
           │   └─→ Fallback: Add as comment
           │       └─→ If file upload fails
           │
           ├─→ Add evaluation summary comment
           │   └─→ Include: result, reasoning, key points
           │
           └─→ Return 200 OK
               └─→ Session cleanup handled by Redis TTL


┌──────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW DIAGRAM                                 │
└──────────────────────────────────────────────────────────────────────────┘

Linear Issue
    │
    ├─→ Candidate Info (name, email, CV)
    ├─→ Job Description
    └─→ Project Details
        │
        ▼
State Machine
    │
    ├─→ Cerebras AI
    │   └─→ Conversation Pointers
    │
    └─→ Redis
        │
        ├─→ screening:secret:{secret}
        │   └─→ All session data
        │
        └─→ screening:conversation:{conversationId}
            └─→ Secret reference
                │
                ▼
Interview Page
    │
    ├─→ Retrieve session data
    ├─→ Create signed URL
    └─→ Start conversation
        │
        ▼
ElevenLabs Agent
    │
    ├─→ Dynamic variables injected
    ├─→ Conversation with candidate
    └─→ Transcript generated
        │
        ▼
Webhook
    │
    ├─→ Lookup session by conversation ID
    ├─→ Evaluate transcript (Cerebras AI)
    └─→ Update Linear Issue
        │
        ├─→ Change state
        ├─→ Attach transcript
        └─→ Add evaluation comment


┌──────────────────────────────────────────────────────────────────────────┐
│                         REDIS KEY STRUCTURE                               │
└──────────────────────────────────────────────────────────────────────────┘

screening:secret:{secret}
├─→ Value: ScreeningSessionData
│   ├─→ linearOrg: string
│   ├─→ issueId: string
│   ├─→ candidateName: string
│   ├─→ candidateEmail: string
│   ├─→ companyName: string
│   ├─→ jobDescription: string (can be large)
│   ├─→ candidateApplication: string (can be large)
│   ├─→ conversationPointers: string
│   ├─→ createdAt: ISO timestamp
│   ├─→ expiresAt: ISO timestamp
│   └─→ conversationId?: string (added when session starts)
│
└─→ TTL: 7 days (604800 seconds)

screening:conversation:{conversationId}
├─→ Value: string (the secret)
└─→ TTL: 7 days (604800 seconds)


┌──────────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING                                    │
└──────────────────────────────────────────────────────────────────────────┘

Invalid Secret
├─→ Interview page returns 404
└─→ User sees "Interview not found" message

Expired Session
├─→ Redis returns null
├─→ Interview page returns 404
└─→ User sees "Interview expired" message

Failed to Create Signed URL
├─→ Server action returns error
├─→ Client shows error message
└─→ User can retry

Failed to Start Session
├─→ ElevenLabs connection fails
├─→ Client shows error message
└─→ User can retry

Conversation ID Not Associated
├─→ Webhook can't find session
├─→ Logged as "orphaned transcript"
└─→ Admin notification (TODO)

Webhook Signature Invalid
├─→ Return 401 Unauthorized
├─→ Log security event
└─→ ElevenLabs will retry


┌──────────────────────────────────────────────────────────────────────────┐
│                         SECURITY CONSIDERATIONS                           │
└──────────────────────────────────────────────────────────────────────────┘

Secret Generation
├─→ Uses crypto.randomBytes(32)
├─→ 256 bits of entropy
├─→ Base64url encoding (URL-safe)
└─→ Collision probability: ~1 in 2^256

Time-Limited Access
├─→ Sessions expire after 7 days
├─→ Signed URLs expire (ElevenLabs controlled)
└─→ Automatic cleanup via Redis TTL

No Sensitive Data in URLs
├─→ Only opaque secret in URL
├─→ All PII stored server-side
└─→ No data leakage via browser history/logs

Webhook Verification
├─→ HMAC-SHA256 signature validation
├─→ Uses ElevenLabs SDK
└─→ Rejects invalid signatures

Rate Limiting
└─→ TODO: Implement per-organization limits


┌──────────────────────────────────────────────────────────────────────────┐
│                         PERFORMANCE CHARACTERISTICS                       │
└──────────────────────────────────────────────────────────────────────────┘

Redis Operations
├─→ Session creation: 1 SET (O(1))
├─→ Session retrieval: 1 GET (O(1))
├─→ Conversation association: 2 SET (O(1))
└─→ Webhook lookup: 2 GET (O(1))

Memory Usage
├─→ Per session: ~2-10 KB
├─→ 1000 sessions: ~2-10 MB
└─→ Automatic cleanup via TTL

Latency
├─→ Session creation: <10ms
├─→ Session retrieval: <10ms
├─→ Signed URL creation: ~100-500ms (ElevenLabs API)
└─→ Webhook processing: ~1-5s (includes Cerebras evaluation)

Scalability
├─→ Supports unlimited concurrent sessions
├─→ No race conditions
├─→ No manual cleanup required
└─→ Redis handles all persistence
