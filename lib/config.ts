/**
 * Configuration for external service integrations
 * 
 * This file centralizes all configuration for:
 * - WorkOS (Authentication)
 * - Linear (Data source)
 * - LiquidMetal (AI services)
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
  ];

  const missing = required.filter((key) => !process.env[key]);

  return {
    valid: missing.length === 0,
    missing,
  };
}
