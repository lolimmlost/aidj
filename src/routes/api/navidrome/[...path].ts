import { createServerFileRoute } from '@tanstack/react-start/server';
import { ServiceError } from '../../../lib/utils';
import { getConfig } from '@/lib/config/config';
import { getAuthToken, token, clientId, subsonicToken, subsonicSalt } from '@/lib/services/navidrome';

export const ServerRoute = createServerFileRoute('/api/navidrome/[./path]').methods({
  GET: async ({ params, request }) => {
    try {
      const config = getConfig();
      if (!config.navidromeUrl) {
        return new Response('Navidrome not configured', { status: 500 });
      }

      await getAuthToken();

      // @ts-expect-error Params path joining for catch-all routing
      const path = params.path.join('/');

      // Skip stream paths - let specific route handle /api/navidrome/stream/[id]
      if (path.split('/')[0] === 'stream') {
        console.log('Catch-all skipping stream path:', path, '- handled by specific route');
        return new Response('Stream path handled by specific route', { status: 404 });
      }

      const url = new URL(`${config.navidromeUrl}/${path}`);
      url.search = new URL(request.url).search;

      // For Subsonic API endpoints (/rest/*), add subsonic auth params
      const isSubsonicApi = path.startsWith('rest/');
      if (isSubsonicApi && subsonicToken && subsonicSalt) {
        url.searchParams.set('u', config.navidromeUsername || '');
        url.searchParams.set('t', subsonicToken);
        url.searchParams.set('s', subsonicSalt);
      }

      const headers = new Headers(request.headers);
      // Remove host-related headers if needed
      headers.delete('host');

      // Add Navidrome auth headers
      if (token && clientId) {
        headers.set('x-nd-authorization', `Bearer ${token}`);
        headers.set('x-nd-client-unique-id', clientId);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
      });

      const clonedHeaders = new Headers(response.headers);
      clonedHeaders.set('Access-Control-Allow-Origin', '*');
      clonedHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      clonedHeaders.set('Access-Control-Allow-Headers', '*');

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          status: response.status,
          headers: clonedHeaders,
        });
      } else {
        // For binary content (non-stream)
        const buffer = await response.arrayBuffer();
        return new Response(buffer, {
          status: response.status,
          headers: clonedHeaders,
        });
      }
    } catch (error: unknown) {
      console.error('Navidrome proxy failed:', error);
      let code = 'GENERAL_API_ERROR';
      let message = 'Navidrome proxy error';
      if (error instanceof ServiceError) {
        code = error.code;
        message = error.message;
      } else if (error instanceof Error) {
        message = error.message;
      }
      return new Response(JSON.stringify({ code, message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  POST: async ({ params, request }) => {
    try {
      const config = getConfig();
      if (!config.navidromeUrl) {
        return new Response('Navidrome not configured', { status: 500 });
      }

      // @ts-expect-error Params path joining for catch-all routing
      const path = params.path.join('/');

      // Auth endpoint doesn't require existing auth
      const isAuthEndpoint = path === 'auth/login';

      if (!isAuthEndpoint) {
        // For non-auth endpoints, ensure we have auth
        await getAuthToken();
      }

      const url = new URL(`${config.navidromeUrl}/${path}`);
      url.search = new URL(request.url).search;

      const headers = new Headers();
      headers.set('Content-Type', 'application/json');

      // Add Navidrome auth headers for non-auth endpoints
      if (!isAuthEndpoint && token && clientId) {
        headers.set('x-nd-authorization', `Bearer ${token}`);
        headers.set('x-nd-client-unique-id', clientId);
      }

      // Get request body
      const body = await request.text();

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body,
      });

      const clonedHeaders = new Headers(response.headers);
      clonedHeaders.set('Access-Control-Allow-Origin', '*');
      clonedHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      clonedHeaders.set('Access-Control-Allow-Headers', '*');

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          status: response.status,
          headers: clonedHeaders,
        });
      } else {
        const buffer = await response.arrayBuffer();
        return new Response(buffer, {
          status: response.status,
          headers: clonedHeaders,
        });
      }
    } catch (error: unknown) {
      console.error('Navidrome proxy POST failed:', error);
      let code = 'GENERAL_API_ERROR';
      let message = 'Navidrome proxy error';
      if (error instanceof ServiceError) {
        code = error.code;
        message = error.message;
      } else if (error instanceof Error) {
        message = error.message;
      }
      return new Response(JSON.stringify({ code, message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
