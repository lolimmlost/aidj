import { createFileRoute } from '@tanstack/react-router';
import crypto from 'crypto';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';
import {
  isSpotifyConfigured,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  fetchAndSaveSpotifyProfile,
  disconnectSpotify,
} from '../../../lib/services/spotify';

/**
 * Generate CSRF state token: HMAC-signed JSON { userId, nonce, exp }
 */
function generateState(userId: string): string {
  const secret = process.env.BETTER_AUTH_SECRET || '';
  const payload = JSON.stringify({
    userId,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Date.now() + 10 * 60 * 1000, // 10 min expiry
  });
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64url');
}

/**
 * Verify CSRF state token
 */
function verifyState(state: string, expectedUserId: string): boolean {
  try {
    const secret = process.env.BETTER_AUTH_SECRET || '';
    const { payload, sig } = JSON.parse(Buffer.from(state, 'base64url').toString());
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (sig !== expectedSig) return false;

    const data = JSON.parse(payload);
    if (data.userId !== expectedUserId) return false;
    if (Date.now() > data.exp) return false;

    return true;
  } catch {
    return false;
  }
}

// GET — Return Spotify authorization URL
const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    if (!isSpotifyConfigured()) {
      return errorResponse('SPOTIFY_NOT_CONFIGURED', 'Spotify is not configured', { status: 503 });
    }

    const state = generateState(session.user.id);
    const url = getAuthorizationUrl(session.user.id, state);

    return successResponse({ url });
  },
  {
    service: 'playlists/spotify-auth',
    operation: 'get-auth-url',
    defaultCode: 'SPOTIFY_AUTH_ERROR',
    defaultMessage: 'Failed to generate Spotify auth URL',
  }
);

// POST — Exchange code for tokens (called from callback page)
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const { code, state } = body;

    if (!code || !state) {
      return errorResponse('VALIDATION_ERROR', 'Missing code or state parameter', { status: 400 });
    }

    if (!verifyState(state, session.user.id)) {
      return errorResponse('INVALID_STATE', 'Invalid or expired state token', { status: 403 });
    }

    await exchangeCodeForTokens(code, session.user.id);

    // Fetch and store Spotify profile
    const profile = await fetchAndSaveSpotifyProfile(session.user.id);

    return successResponse({
      connected: true,
      username: profile.display_name,
    });
  },
  {
    service: 'playlists/spotify-auth',
    operation: 'exchange-code',
    defaultCode: 'SPOTIFY_AUTH_ERROR',
    defaultMessage: 'Failed to complete Spotify authorization',
  }
);

// DELETE — Disconnect Spotify
const DELETE = withAuthAndErrorHandling(
  async ({ session }) => {
    await disconnectSpotify(session.user.id);
    return successResponse({ disconnected: true });
  },
  {
    service: 'playlists/spotify-auth',
    operation: 'disconnect',
    defaultCode: 'SPOTIFY_DISCONNECT_ERROR',
    defaultMessage: 'Failed to disconnect Spotify',
  }
);

export const Route = createFileRoute('/api/playlists/spotify-auth')({
  server: { handlers: { GET, POST, DELETE } },
});
