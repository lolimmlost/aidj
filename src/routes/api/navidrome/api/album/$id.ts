import { createFileRoute } from "@tanstack/react-router";
import { getConfig } from '@/lib/config/config';
import { getAuthToken, token, clientId } from '@/lib/services/navidrome';
import { requireSession } from '@/lib/utils/api-response';

export const Route = createFileRoute("/api/navidrome/api/album/$id")({
  server: {
    handlers: {
  GET: async ({ params, request }) => {
    try {
      const session = await requireSession(request);
      if (session instanceof Response) return session;

      const config = getConfig();
      if (!config.navidromeUrl) {
        return new Response(JSON.stringify({ error: 'Navidrome not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await getAuthToken();

      const albumId = params.id;
      // Ids are alphanumeric; the param is URL-decoded, so '..%2F' would reach other Navidrome APIs
      if (!/^[A-Za-z0-9]+$/.test(albumId)) {
        return new Response(JSON.stringify({ error: 'Invalid album id' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
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
    },
  },
});
