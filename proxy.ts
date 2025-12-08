import { authkitMiddleware } from '@workos-inc/authkit-nextjs';
import type { NextRequest, NextFetchEvent } from 'next/server';

// In middleware auth mode, each page is protected by default.
// Exceptions are configured via the `unauthenticatedPaths` option.
const authMiddleware = authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ['/', '/jobs/:path*'],
  },
});

/**
 * Generate a correlation ID for Edge runtime
 * Uses timestamp-based ID since crypto.randomUUID may not be available
 */
function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  // Generate or extract correlation ID
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  
  // Run auth middleware
  const response = await authMiddleware(request, event);
  
  // Add correlation ID to response headers if we have a response
  if (response) {
    response.headers.set('x-correlation-id', correlationId);
  }
  
  return response;
}

// Match against pages that require authentication
// Leave this out if you want authentication on every page in your application
export const config = { 
  matcher: [
    '/',
    '/dashboard/:path*',
    '/onboarding/:path*',
    // Match API routes, EXCEPT the webhook route
    '/api/((?!webhooks).*)', // Matches /api/users, /api/auth, etc., but NOT /api/webhooks
    '/jobs/:path*',
    '/subscription/:path*',
  ]
};
