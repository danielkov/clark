/**
 * Configuration for external service integrations
 * 
 * This file centralizes all configuration for:
 * - WorkOS (Authentication)
 * - Linear (Data source)
 * - LiquidMetal (AI services)
 * - Polar (Subscription management)
 */

export const config = {
  workos: {
    apiKey: process.env.WORKOS_API_KEY || '',
    clientId: process.env.WORKOS_CLIENT_ID || '',
    redirectUri: process.env.WORKOS_REDIRECT_URI || '',
  },
  linear: {
    clientId: process.env.LINEAR_CLIENT_ID || '',
    clientSecret: process.env.LINEAR_CLIENT_SECRET || '',
    redirectUri: process.env.LINEAR_REDIRECT_URI || '',
    webhookSecret: process.env.LINEAR_WEBHOOK_SECRET || '',
  },
  liquidmetal: {
    apiKey: process.env.LIQUIDMETAL_API_KEY || '',
    smartBucketsEndpoint: process.env.LIQUIDMETAL_SMARTBUCKETS_ENDPOINT || '',
    smartInferenceEndpoint: process.env.LIQUIDMETAL_SMARTINFERENCE_ENDPOINT || '',
  },
  polar: {
    accessToken: process.env.POLAR_ACCESS_TOKEN || '',
    webhookSecret: process.env.POLAR_WEBHOOK_SECRET || '',
    organizationId: process.env.POLAR_ORGANIZATION_ID || '',
    products: {
      free: process.env.POLAR_FREE_PRODUCT_ID || '',
      pro: process.env.POLAR_PRO_PRODUCT_ID || '',
      enterprise: process.env.POLAR_ENTERPRISE_PRODUCT_ID || '',
    },
    meters: {
      // Meter IDs (UUIDs) used to query meter balances from Polar API
      jobDescriptions: process.env.POLAR_JOB_DESCRIPTIONS_METER_ID || '',
      candidateScreenings: process.env.POLAR_CANDIDATE_SCREENINGS_METER_ID || '',
    },
    events: {
      // Event names used when ingesting usage events to Polar
      jobDescriptions: 'job_description_generated',
      candidateScreenings: 'candidate_screened',
    },
    benefits: {
      customToneOfVoice: process.env.POLAR_CUSTOM_TONE_OF_VOICE_BENEFIT_ID || '',
      emailCommunication: process.env.POLAR_EMAIL_COMMUNICATION_BENEFIT_ID || '',
      aiScreening: process.env.POLAR_AI_SCREENING_BENEFIT_ID || '',
    },
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.RESEND_FROM_EMAIL || '',
    replyDomain: process.env.RESEND_REPLY_DOMAIN || '',
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET || '',
    templates: {
      confirmation: process.env.RESEND_TEMPLATE_CONFIRMATION || '',
      rejection: process.env.RESEND_TEMPLATE_REJECTION || '',
      screeningInvitation: process.env.RESEND_TEMPLATE_SCREENING_INVITATION || '',
      comment: process.env.RESEND_TEMPLATE_COMMENT || '',
    },
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    agentId: process.env.ELEVENLABS_AGENT_ID || '',
    webhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET || '',
  },
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    sessionSecret: process.env.SESSION_SECRET || '',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
} as const;

/**
 * Validates that all required environment variables are set
 * Call this during application startup
 */
export function validateConfig(): { valid: boolean; missing: string[] } {
  const required = [
    'WORKOS_API_KEY',
    'WORKOS_CLIENT_ID',
    'LINEAR_CLIENT_ID',
    'LINEAR_CLIENT_SECRET',
    'LIQUIDMETAL_API_KEY',
    'SESSION_SECRET',
    'POLAR_ACCESS_TOKEN',
  ];

  const missing = required.filter((key) => !process.env[key]);

  return {
    valid: missing.length === 0,
    missing,
  };
}
