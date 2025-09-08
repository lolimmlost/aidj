import { createServerFileRoute } from '@tanstack/react-start/server';
import { getConfig } from '@/lib/config/config';

export const ServerRoute = createServerFileRoute('/api/navidrome/[./path]').methods({
  async all({ params, request }: { params: { path: string[] }, request: Request }) {
    const config = getConfig();
    if (!config.navidromeUrl) {
      return new Response('Navidrome not configured', { status: 500 });
    }

    const path = params.path.join('/');
    const url = new URL(`${config.navidromeUrl}/${path}`);
    url.search = new URL(request.url).search;

    const headers = new Headers(request.headers);
    // Remove host-related headers if needed
    headers.delete('host');

    const response = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.body,
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
