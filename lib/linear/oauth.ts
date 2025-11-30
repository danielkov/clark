/**
 * Linear OAuth 2 Authorization Flow
 * 
 * Handles OAuth 2 actor authorization for Linear integration
 */

import { config } from '../config';

/**
 * Generate Linear OAuth authorization URL
 */
export function getLinearAuthorizationUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: config.linear.clientId,
    redirect_uri: config.linear.redirectUri,
    response_type: 'code',
    scope: 'read,write',
    actor: 'app',
  });

  if (state) {
    params.append('state', state);
  }

  return `https://linear.app/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  try {
    const response = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.linear.clientId,
        client_secret: config.linear.clientSecret,
        redirect_uri: config.linear.redirectUri,
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Linear OAuth token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    console.error('Linear OAuth error:', error);
    throw new Error('Failed to exchange code for Linear access token');
  }
}

/**
 * Refresh Linear access token using refresh token
 */
export async function refreshLinearToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  try {
    const response = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.linear.clientId,
        client_secret: config.linear.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Linear token refresh failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    console.error('Linear token refresh error:', error);
    throw new Error('Failed to refresh Linear access token');
  }
}

/**
 * Revoke Linear access token
 */
export async function revokeLinearToken(accessToken: string): Promise<void> {
  try {
    const response = await fetch('https://api.linear.app/oauth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.linear.clientId,
        client_secret: config.linear.clientSecret,
        token: accessToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Linear token revocation failed: ${error}`);
    }
  } catch (error) {
    console.error('Linear token revocation error:', error);
    throw new Error('Failed to revoke Linear access token');
  }
}
