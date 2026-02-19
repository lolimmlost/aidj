/**
 * Scrobble endpoint - proxies to Navidrome's Subsonic API
 * Records song plays/now playing status
 *
 * Uses per-user Navidrome credentials so scrobbles are attributed to the correct user.
 *
 * GET /api/navidrome/rest/scrobble
 */
import { createFileRoute } from "@tanstack/react-router";
import { getConfig } from '../../../../lib/config/config';
import { getAuthToken, subsonicToken, subsonicSalt } from '../../../../lib/services/navidrome';
import { auth } from '../../../../lib/auth/auth';
import { ensureNavidromeUser } from '../../../../lib/services/navidrome-users';

export const Route = createFileRoute("/api/navidrome/rest/scrobble")({
  server: {
    handlers: {
  GET: async ({ request }) => {
    try {
      const config = getConfig();
      if (!config.navidromeUrl) {
        return new Response(JSON.stringify({ error: 'Navidrome not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Build the scrobble URL
      const requestUrl = new URL(request.url);
      const url = new URL(`${config.navidromeUrl}/rest/scrobble`);

      // Copy query params from request
      requestUrl.searchParams.forEach((value, key) => {
        url.searchParams.set(key, value);
      });

      // Try to get per-user credentials for the authenticated user
      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
      });

      if (session) {
        try {
          const creds = await ensureNavidromeUser(session.user.id, session.user.name, session.user.email);
          url.searchParams.set('u', creds.username);
          url.searchParams.set('t', creds.token);
          url.searchParams.set('s', creds.salt);
        } catch (credsError) {
          console.warn('Failed to get per-user creds for scrobble, falling back to admin:', credsError);
          // Fall back to admin creds
          await getAuthToken();
          if (!subsonicToken || !subsonicSalt) {
            return new Response(JSON.stringify({ error: 'Not authenticated with Navidrome' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          url.searchParams.set('u', config.navidromeUsername || '');
          url.searchParams.set('t', subsonicToken);
          url.searchParams.set('s', subsonicSalt);
        }
      } else {
        // No session — fall back to admin creds
        await getAuthToken();
        if (!subsonicToken || !subsonicSalt) {
          return new Response(JSON.stringify({ error: 'Not authenticated with Navidrome' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        url.searchParams.set('u', config.navidromeUsername || '');
        url.searchParams.set('t', subsonicToken);
        url.searchParams.set('s', subsonicSalt);
      }

      console.log(`🎵 Proxying scrobble to: ${url.toString().replace(/t=[^&]+/, 't=***')}`);

      const response = await fetch(url.toString(), {
        method: 'GET',
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Scrobble failed:', text);
        return new Response(JSON.stringify({ error: 'Scrobble failed', details: text }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const data = await response.json();

      // Check for Subsonic API error
      if (data?.['subsonic-response']?.status !== 'ok') {
        const errorMsg = data?.['subsonic-response']?.error?.message || 'Unknown error';
        console.error('Subsonic scrobble error:', errorMsg);
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Scrobble proxy error:', error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
    },
  },
});
