/**
 * Linear OAuth Callback Handler
 * Processes authorization code and stores tokens in WorkOS user metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/linear/oauth';
import { storeLinearTokens } from '@/lib/linear/metadata';
import { config } from '@/lib/config';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { emitAuthenticationFailure } from '@/lib/datadog/events';
import { logger } from '@/lib/datadog/logger';

export async function GET(request: NextRequest) {
  const { user } = await withAuth();
  
  if (!user) {
    emitAuthenticationFailure('Linear OAuth callback without user session', {
      reason: 'session_required',
    });
    
    const loginUrl = new URL('/api/auth/login', config.app.url);
    loginUrl.searchParams.set('error', 'session_required');
    return NextResponse.redirect(loginUrl);
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    emitAuthenticationFailure('Linear OAuth error', {
      error,
      userId: user.id,
    });
    
    const errorUrl = new URL('/dashboard', config.app.url);
    errorUrl.searchParams.set('error', `linear_auth_${error}`);
    return NextResponse.redirect(errorUrl);
  }

  // Validate authorization code
  if (!code) {
    emitAuthenticationFailure('Linear OAuth missing authorization code', {
      userId: user.id,
    });
    
    const errorUrl = new URL('/dashboard', config.app.url);
    errorUrl.searchParams.set('error', 'linear_missing_code');
    return NextResponse.redirect(errorUrl);
  }

  try {
    // Exchange code for access token
    const { accessToken, refreshToken, expiresIn } = await exchangeCodeForToken(code);

    // Calculate token expiry timestamp
    const expiresAt = Date.now() + expiresIn * 1000;

    // Store tokens in WorkOS user metadata
    await storeLinearTokens(user.id, {
      accessToken,
      refreshToken,
      expiresAt,
    });

    // Fetch organization info and store in Redis
    try {
      const { LinearClient } = await import('@linear/sdk');
      const { storeOrgConfig } = await import('@/lib/redis');
      const { getATSContainerInitiativeId } = await import('@/lib/linear/metadata');
      
      const linearClient = new LinearClient({ accessToken });
      const organization = await linearClient.organization;
      
      // Get ATS container initiative ID if it exists
      const atsContainerInitiativeId = await getATSContainerInitiativeId(user.id) || '';
      
      // Store org config in Redis
      await storeOrgConfig(organization.name, {
        accessToken,
        refreshToken,
        expiresAt,
        orgId: organization.id,
        orgName: organization.name,
        atsContainerInitiativeId,
      });
      
      logger.info('Linear organization config stored in Redis', {
        userId: user.id,
        orgId: organization.id,
        orgName: organization.name,
      });
    } catch (redisErr) {
      // Log but don't fail the auth flow if Redis storage fails
      logger.error('Failed to store org config in Redis', redisErr instanceof Error ? redisErr : new Error(String(redisErr)), {
        userId: user.id,
      });
    }

    // Redirect to original destination or dashboard
    const redirectPath = state || '/dashboard';
    const redirectUrl = new URL(redirectPath, config.app.url);
    redirectUrl.searchParams.set('success', 'linear_connected');
    
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    logger.error('Linear OAuth callback error', err instanceof Error ? err : new Error(String(err)), {
      userId: user.id,
    });
    
    emitAuthenticationFailure('Linear OAuth token exchange failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    
    const errorUrl = new URL('/dashboard', config.app.url);
    errorUrl.searchParams.set('error', 'linear_auth_failed');
    return NextResponse.redirect(errorUrl);
  }
}
