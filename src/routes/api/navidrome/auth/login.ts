import { createFileRoute } from "@tanstack/react-router";
import { getConfig } from '@/lib/config/config';
import { getAuthToken } from '@/lib/services/navidrome';
import { withAuthAndErrorHandling, errorResponse, jsonResponse } from '@/lib/utils/api-response';

/**
 * Navidrome auth proxy.
 *
 * The browser never holds Navidrome credentials. It reaches Navidrome only through the
 * /api/navidrome/* proxies, which sign every request with the server's own credentials
 * (per-user ones for user-scoped calls) and ignore whatever the browser sends. So a
 * session-authenticated user gets placeholders here, not the admin token: handing it out
 * gave every signed-in user admin rights on Navidrome (delete any playlist, start scans).
 *
 * The server still logs in, so a dead Navidrome or bad env credentials fail here as before.
 */
const PROXY_CREDENTIAL = 'aidj-proxy';

const POST = withAuthAndErrorHandling(
  async () => {
    const config = getConfig();
    if (!config.navidromeUrl) {
      return errorResponse('NAVIDROME_CONFIG_ERROR', 'Navidrome not configured', { status: 500 });
    }
    if (!config.navidromeUsername || !config.navidromePassword) {
      return errorResponse(
        'NAVIDROME_CONFIG_ERROR',
        'Navidrome credentials not configured on server (set NAVIDROME_USERNAME / NAVIDROME_PASSWORD)',
        { status: 500 },
      );
    }

    await getAuthToken();

    return jsonResponse({
      id: PROXY_CREDENTIAL,
      username: PROXY_CREDENTIAL,
      token: PROXY_CREDENTIAL,
      subsonicToken: PROXY_CREDENTIAL,
      subsonicSalt: PROXY_CREDENTIAL,
    });
  },
  { service: 'navidrome', operation: 'auth-login' },
);

export const Route = createFileRoute("/api/navidrome/auth/login")({
  server: {
    handlers: {
      POST,
    },
  },
});
