# AI-Enriched ATS with Linear Integration

An Applicant Tracking System that uses Linear as its source of truth, with AI-powered candidate screening and job description generation.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Authentication**: WorkOS AuthKit
- **Data Source**: Linear (Projects, Issues, Documents)
- **AI Services**: Cerebras (llama-3.3-70b)
- **Storage**: Upstash Redis
- **Observability**: Datadog (APM, Metrics, Logging)
- **Testing**: Vitest with fast-check for property-based testing
- **UI**: Radix UI + Tailwind CSS

## Features

- **OAuth Integration**: Connect your Linear workspace via OAuth 2.0
- **Automated Job Publishing**: Jobs automatically publish when Linear Projects are marked "In Progress"
- **AI Job Descriptions**: Generate structured job descriptions using Cerebras LLM based on your tone of voice
- **Public Job Listings**: Applicants can browse and apply to open positions
- **AI Pre-screening**: Automatic candidate evaluation comparing CVs against job requirements
- **Document Parsing**: Extract text from PDF and DOCX files for AI analysis
- **Webhook Integration**: Real-time sync with Linear via webhooks
- **Full Observability**: Comprehensive monitoring with Datadog APM, metrics, and logging

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- WorkOS account and API keys
- Linear workspace with OAuth app configured
- Cerebras API key
- Upstash Redis instance
- (Optional) Datadog account for observability

### Installation

1. Clone the repository

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment variables template:
   ```bash
   cp .env.example .env.local
   ```

4. Configure your environment variables in `.env.local`:
   - **WorkOS**: Authentication credentials
   - **Linear**: OAuth client ID, secret, and webhook secret
   - **Cerebras**: API key for AI inference
   - **Upstash Redis**: Connection URL and token
   - **Datadog**: API key and service configuration (optional)

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Run tests with UI:
```bash
npm run test:ui
```

### Building

Build for production:
```bash
npm run build
```

Start production server:
```bash
npm start
```

## Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes (auth, webhooks, health)
│   ├── dashboard/         # Authenticated dashboard
│   ├── jobs/              # Public job listings
│   └── onboarding/        # Linear integration setup
├── components/            # React components
│   ├── ui/               # Radix UI components
│   ├── application-form.tsx
│   ├── initiative-selector.tsx
│   └── tone-of-voice-setup.tsx
├── lib/                   # Core business logic
│   ├── actions/          # Server actions
│   ├── cerebras/         # AI inference (job descriptions, screening)
│   ├── datadog/          # Observability (APM, metrics, logging)
│   ├── linear/           # Linear SDK integration
│   └── utils/            # Utility functions (retry logic, etc.)
├── types/                 # TypeScript type definitions
└── middleware.ts          # Auth and correlation ID middleware
```

## Architecture

The system uses Linear as the single source of truth:
- **Initiatives**: Hiring containers (ATS Container)
- **Projects**: Job openings (published when status is "In Progress")
- **Issues**: Candidates/applicants (with workflow states: Triage → Screening/Declined)
- **Documents**: CVs, cover letters, tone of voice guides

### Data Flow

1. **Onboarding**: User authenticates via WorkOS → connects Linear via OAuth → selects/creates ATS Container Initiative → sets up tone of voice
2. **Job Publishing**: Project marked "In Progress" → AI generates job description → published to public site
3. **Application**: Applicant submits form → CV parsed → Linear Issue created → AI pre-screening triggered → Issue state updated based on match quality
4. **Sync**: Linear webhooks keep job listings and candidate states in sync

### AI Capabilities

- **Job Description Generation**: Uses Cerebras llama-3.3-70b to create structured job descriptions based on project details and organizational tone of voice
- **Candidate Pre-screening**: Compares CV content against job requirements to automatically triage candidates into Screening, Triage, or Declined states

### Observability

Datadog integration provides:
- **APM Tracing**: Distributed traces across all API calls and external services
- **Custom Metrics**: LLM latency, token usage, webhook processing times
- **Error Logging**: Full context with stack traces and correlation IDs
- **Alerting**: Critical operation failures trigger Datadog events

## License

ISC
