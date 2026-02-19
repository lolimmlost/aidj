/**
 * Catch-all for Subsonic API endpoints - proxies to Navidrome's Subsonic API
 * Handles: getCoverArt, search3, getPlaylists, etc.
 *
 * For user-scoped endpoints (star, unstar, getStarred2, playlists, scrobble),
 * uses per-user Navidrome credentials when the user is authenticated.
 * For shared endpoints (getCoverArt, stream, search, etc.), uses admin credentials.
 *
 * GET /api/navidrome/rest/*
 */
import { createFileRoute } from "@tanstack/react-router";
import { getConfig } from '@/lib/config/config';
import { getAuthToken, subsonicToken, subsonicSalt } from '@/lib/services/navidrome';

/** Subsonic endpoints that are user-scoped and need per-user credentials */
const USER_SCOPED_ENDPOINTS = [
  'star', 'star.view',
  'unstar', 'unstar.view',
  'getStarred2', 'getStarred2.view',
  'getPlaylists', 'getPlaylists.view',
  'getPlaylist', 'getPlaylist.view',
  'createPlaylist', 'createPlaylist.view',
  'updatePlaylist', 'updatePlaylist.view',
  'deletePlaylist', 'deletePlaylist.view',
  'scrobble', 'scrobble.view',
];

function isUserScopedEndpoint(endpoint: string): boolean {
  return USER_SCOPED_ENDPOINTS.some(e => endpoint === e || endpoint.startsWith(e + '?'));
}

export const Route = createFileRoute("/api/navidrome/rest/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const config = getConfig();
          if (!config.navidromeUrl) {
            return new Response('Navidrome not configured', { status: 500 });
          }

          await getAuthToken();

          // Get the endpoint name from params (e.g., "getCoverArt", "search3")
          // @ts-expect-error TanStack router splat param
          const endpoint = params['_splat'] || params['$'] || '';

          const url = new URL(`${config.navidromeUrl}/rest/${endpoint}`);

          // Copy query params from original request
          const originalUrl = new URL(request.url);
          originalUrl.searchParams.forEach((value, key) => {
            url.searchParams.set(key, value);
          });

          // For user-scoped endpoints, try per-user creds
          if (isUserScopedEndpoint(endpoint)) {
            let usedPerUserCreds = false;
            try {
              const { auth } = await import('@/lib/auth/auth');
              const session = await auth.api.getSession({
                headers: request.headers,
                query: { disableCookieCache: true },
              });

              if (session) {
                const { ensureNavidromeUser } = await import('@/lib/services/navidrome-users');
                const creds = await ensureNavidromeUser(session.user.id, session.user.name, session.user.email);
                url.searchParams.set('u', creds.username);
                url.searchParams.set('t', creds.token);
                url.searchParams.set('s', creds.salt);
                url.searchParams.set('v', '1.16.1');
                url.searchParams.set('c', 'aidj');
                usedPerUserCreds = true;
              }
            } catch (credsError) {
              console.warn(`[REST Proxy] Failed to get per-user creds for ${endpoint}, falling back to admin:`, credsError);
            }

            if (!usedPerUserCreds) {
              // Fall back to admin creds
              if (subsonicToken && subsonicSalt) {
                url.searchParams.set('u', config.navidromeUsername || '');
                url.searchParams.set('t', subsonicToken);
                url.searchParams.set('s', subsonicSalt);
                url.searchParams.set('v', '1.16.1');
                url.searchParams.set('c', 'aidj');
              }
            }
          } else {
            // Shared endpoints: use admin creds
            if (subsonicToken && subsonicSalt) {
              url.searchParams.set('u', config.navidromeUsername || '');
              url.searchParams.set('t', subsonicToken);
              url.searchParams.set('s', subsonicSalt);
              url.searchParams.set('v', '1.16.1');
              url.searchParams.set('c', 'aidj');
            }
          }

          // Auto-add f=json for non-binary endpoints to get JSON instead of XML
          const binaryEndpoints = ['getCoverArt', 'stream', 'download', 'getAvatar'];
          const isBinaryEndpoint = binaryEndpoints.some(e => endpoint.startsWith(e));
          if (!isBinaryEndpoint && !url.searchParams.has('f')) {
            url.searchParams.set('f', 'json');
          }

          console.log(`[REST Proxy] Fetching: ${url.pathname}`);

          const response = await fetch(url.toString(), {
            method: 'GET',
          });

          if (!response.ok) {
            console.error(`[REST Proxy] Failed: ${response.status} ${response.statusText}`);
            return new Response(`Subsonic API error: ${response.statusText}`, { status: response.status });
          }

          // Get the response content type
          const contentType = response.headers.get('content-type') || 'application/octet-stream';

          // Handle binary content (images, etc.)
          if (contentType.startsWith('image/') || contentType === 'application/octet-stream') {
            const buffer = await response.arrayBuffer();
            return new Response(buffer, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          // Handle JSON content
          if (contentType.includes('application/json')) {
            const data = await response.json();
            return new Response(JSON.stringify(data), {
              status: response.status,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          // Default: pass through as-is
          const text = await response.text();
          return new Response(text, {
            status: response.status,
            headers: {
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (error: unknown) {
          console.error('[REST Proxy] Error:', error);
          const message = error instanceof Error ? error.message : 'Unknown error';
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
