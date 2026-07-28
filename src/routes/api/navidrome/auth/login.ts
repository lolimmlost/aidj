import { createFileRoute } from "@tanstack/react-router";
import { getConfig } from '@/lib/config/config';
import { withAuthAndErrorHandling, errorResponse } from '@/lib/utils/api-response';

/**
 * Navidrome auth proxy.
 *
 * The client never holds Navidrome credentials (they were stripped from
 * defaults.json — public repo). A session-authenticated AIDJ user calls this
 * with an empty body and the server logs in with its own env-configured
 * admin credentials, returning Navidrome's token + subsonicToken/subsonicSalt
 * for shared read ops (browse/search/stream). Per-user writes still go
 * through navidrome-users.ts.
 */
const POST = withAuthAndErrorHandling(
  async () => {
    const config = getConfig();
    if (!config.navidromeUrl) {
      return errorResponse('NAVIDROME_CONFIG_ERROR', 'Navidrome not configured', { status: 500 });
    }

    // Ignore any client-supplied credentials — always authenticate with the
    // server's own credentials so they never need to exist client-side.
    const username = config.navidromeUsername;
    const password = config.navidromePassword;
    if (!username || !password) {
      return errorResponse(
        'NAVIDROME_CONFIG_ERROR',
        'Navidrome credentials not configured on server (set NAVIDROME_USERNAME / NAVIDROME_PASSWORD)',
        { status: 500 },
      );
    }

    const response = await fetch(`${config.navidromeUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
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
