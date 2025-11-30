import { createServerFileRoute } from '@tanstack/react-start/server';
import { getConfig } from '@/lib/config/config';
import { getAuthToken, token, clientId } from '@/lib/services/navidrome';

export const ServerRoute = createServerFileRoute('/api/navidrome/api/album/$id').methods({
  GET: async ({ params, request }) => {
    try {
      const config = getConfig();
      if (!config.navidromeUrl) {
        return new Response(JSON.stringify({ error: 'Navidrome not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await getAuthToken();

      const albumId = params.id;
      const url = new URL(`${config.navidromeUrl}/api/album/${albumId}`);
      url.search = new URL(request.url).search;

      const headers = new Headers();
      if (token && clientId) {
        headers.set('x-nd-authorization', `Bearer ${token}`);
        headers.set('x-nd-client-unique-id', clientId);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
      });

      const data = await response.json();

      const responseHeaders = new Headers();
      responseHeaders.set('Content-Type', 'application/json');
      responseHeaders.set('Access-Control-Allow-Origin', '*');

      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: responseHeaders,
      });
    } catch (error: unknown) {
      console.error('Navidrome album detail proxy failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
});
