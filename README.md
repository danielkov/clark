# AI-Enriched ATS with Linear Integration

An Applicant Tracking System that uses Linear as its source of truth, with AI capabilities powered by LiquidMetal.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Authentication**: WorkOS
- **Data Source**: Linear (Projects, Issues, Documents)
- **AI Services**: LiquidMetal (SmartBuckets, SmartInference)
- **Testing**: Vitest with fast-check for property-based testing

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- WorkOS account and API keys
- Linear workspace and OAuth credentials
- LiquidMetal API access

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

4. Fill in your API keys and secrets in `.env.local`

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
├── components/             # React components
├── lib/                    # Utility functions and integrations
│   ├── auth/              # WorkOS authentication
│   ├── linear/            # Linear SDK integration
│   └── liquidmetal/       # LiquidMetal AI services
├── types/                  # TypeScript type definitions
└── tests/                  # Test files
```

## Architecture

The system uses Linear as the single source of truth:
- **Initiatives**: Hiring containers (ATS Container)
- **Projects**: Job openings
- **Issues**: Candidates/applicants
- **Documents**: CVs, cover letters, tone of voice guides

AI capabilities are provided by LiquidMetal:
- **SmartBuckets**: Document storage with vector embeddings
- **SmartInference**: LLM operations for job descriptions and candidate screening

## License

ISC
