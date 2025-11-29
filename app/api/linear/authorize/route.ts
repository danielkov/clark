/**
 * Linear OAuth Authorization Route
 * Redirects to Linear OAuth authorization page
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLinearAuthorizationUrl } from '@/lib/linear/oauth';
import { getSession } from '@/lib/auth/session';
import { config } from '@/lib/config';

export async function GET(request: NextRequest) {
  // Verify user is authenticated with WorkOS first
  const session = await getSession();
  
  if (!session) {
    const loginUrl = new URL('/login', config.app.url);
    loginUrl.searchParams.set('error', 'session_required');
    return NextResponse.redirect(loginUrl);
  }

  // Get redirect destination from query params
  const searchParams = request.nextUrl.searchParams;
  const redirect = searchParams.get('redirect') || '/dashboard';

  // Generate Linear OAuth URL with state parameter
  const authUrl = getLinearAuthorizationUrl(redirect);

  return NextResponse.redirect(authUrl);
}
