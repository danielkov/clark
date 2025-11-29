/**
 * Linear Disconnect Route
 * Revokes Linear access and removes tokens from session
 */

import { NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/auth/session';
import { revokeLinearToken } from '@/lib/linear/oauth';

export async function POST() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  if (!session.linearAccessToken) {
    return NextResponse.json(
      { error: 'Linear not connected' },
      { status: 400 }
    );
  }

  try {
    // Revoke Linear access token
    await revokeLinearToken(session.linearAccessToken);

    // Remove Linear tokens from session
    await updateSession({
      linearAccessToken: undefined,
      linearRefreshToken: undefined,
      linearTokenExpiry: undefined,
      atsContainerInitiativeId: undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to disconnect Linear:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Linear' },
      { status: 500 }
    );
  }
}
