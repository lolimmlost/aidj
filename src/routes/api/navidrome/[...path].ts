import { createServerFileRoute } from '@tanstack/react-start/server';
import { getConfig } from '@/lib/config/config';
import { getAuthToken, token, clientId } from '@/lib/services/navidrome';

export const ServerRoute = createServerFileRoute('/api/navidrome/[./path]').methods({
  GET: async ({ params, request }) => {
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
    console.log('Catch-all response content-type:', contentType); // Debug
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
  },
});
