import { createServerFileRoute } from '@tanstack/react-start/server';
import { getConfig } from '@/lib/config/config';
import { getAuthToken, token, clientId, subsonicToken, subsonicSalt } from '@/lib/services/navidrome';

export const ServerRoute = createServerFileRoute('/api/navidrome/[./path]').methods({
  GET: async ({ params, request }) => {
    const config = getConfig();
    if (!config.navidromeUrl) {
      return new Response('Navidrome not configured', { status: 500 });
    }

    await getAuthToken();

    // @ts-expect-error
    const path = params.path.join('/');
    let url;
    if (path.includes('stream/') ) {
      const songId = path.split('/').pop();
      url = new URL(`${config.navidromeUrl}/rest/stream`);
      url.searchParams.append('u', config.navidromeUsername);
      url.searchParams.append('t', subsonicToken || '');
      url.searchParams.append('s', subsonicSalt || '');
      url.searchParams.append('f', 'json');
      url.searchParams.append('v', '1.8.0');
      url.searchParams.append('c', 'MyApp');
      url.searchParams.append('id', songId);
      const range = request.headers.get('range');
      if (range) {
        url.searchParams.append('_range', range);
      }
    } else {
      url = new URL(`${config.navidromeUrl}/${path}`);
    }
    url.search = new URL(request.url).search;

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
      // For binary/stream
      const buffer = await response.arrayBuffer();
      return new Response(buffer, {
        status: response.status,
        headers: clonedHeaders,
      });
    }
  },
});
