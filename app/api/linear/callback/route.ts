/**
 * Linear OAuth Callback Handler
 * Processes authorization code and stores tokens in session
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/linear/oauth';
import { getSession, updateSession } from '@/lib/auth/session';
import { config } from '@/lib/config';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Verify user is authenticated with WorkOS
  const session = await getSession();
  
  if (!session) {
    const loginUrl = new URL('/login', config.app.url);
    loginUrl.searchParams.set('error', 'session_required');
    return NextResponse.redirect(loginUrl);
  }

  // Handle OAuth errors
  if (error) {
    const errorUrl = new URL('/dashboard', config.app.url);
    errorUrl.searchParams.set('error', `linear_auth_${error}`);
    return NextResponse.redirect(errorUrl);
  }

  // Validate authorization code
  if (!code) {
    const errorUrl = new URL('/dashboard', config.app.url);
    errorUrl.searchParams.set('error', 'linear_missing_code');
    return NextResponse.redirect(errorUrl);
  }

  try {
    // Exchange code for access token
    const { accessToken, refreshToken, expiresIn } = await exchangeCodeForToken(code);

    // Calculate token expiry timestamp
    const tokenExpiry = Date.now() + expiresIn * 1000;

    // Update session with Linear tokens
    await updateSession({
      linearAccessToken: accessToken,
      linearRefreshToken: refreshToken,
      linearTokenExpiry: tokenExpiry,
    });

    // Redirect to onboarding or original destination
    const redirectPath = state || '/onboarding';
    const redirectUrl = new URL(redirectPath, config.app.url);
    
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error('Linear OAuth callback error:', err);
    const errorUrl = new URL('/dashboard', config.app.url);
    errorUrl.searchParams.set('error', 'linear_auth_failed');
    return NextResponse.redirect(errorUrl);
  }
}
