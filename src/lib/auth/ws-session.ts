/**
 * WebSocket Session Validation
 *
 * Validates session tokens for WebSocket connections.
 * Uses better-auth's session validation.
 */

import { auth } from './auth';

/**
 * Get user ID from HTTP request (for WebSocket upgrade)
 *
 * This validates the session token from cookies and returns the user ID.
 * Used by WebSocket handlers to authenticate connections.
 */
export async function getUserIdFromRequest(request: {
  headers: { cookie?: string; [key: string]: string | undefined };
}): Promise<string | null> {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  try {
    // Create a Headers object for better-auth
    const headers = new Headers();
    headers.set('cookie', cookieHeader);

    // Validate session using better-auth
    const session = await auth.api.getSession({ headers });

    if (!session?.user?.id) {
      return null;
    }

    return session.user.id;
  } catch (err) {
    console.error('[WS Auth] Session validation error:', err);
    return null;
  }
}

/**
 * Get full session from HTTP request (for WebSocket upgrade)
 *
 * Returns the complete session object including user details.
 */
export async function getSessionFromRequest(request: {
  headers: { cookie?: string; [key: string]: string | undefined };
}): Promise<{ user: { id: string; name?: string; email?: string } } | null> {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  try {
    const headers = new Headers();
    headers.set('cookie', cookieHeader);

    const session = await auth.api.getSession({ headers });

    if (!session?.user) {
      return null;
    }

    return {
      user: {
        id: session.user.id,
        name: session.user.name || undefined,
        email: session.user.email || undefined,
      },
    };
  } catch (err) {
    console.error('[WS Auth] Session validation error:', err);
    return null;
  }
}
