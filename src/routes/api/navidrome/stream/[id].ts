import { createServerFileRoute } from '@tanstack/react-start/server';
import { getConfig } from '@/lib/config/config';
import { getAuthToken, subsonicToken, subsonicSalt } from '@/lib/services/navidrome';

export const ServerRoute = createServerFileRoute('/api/navidrome/stream/id').methods({
  GET: async ({ params, request }) => {
    const config = getConfig();
    if (!config.navidromeUrl || !config.navidromeUsername) {
      return new Response('Navidrome not configured', { status: 500 });
    }

    await getAuthToken();

    if (!subsonicToken || !subsonicSalt) {
      return new Response('Authentication not ready', { status: 401 });
    }

    // @ts-expect-error Params not typed
    const songId = params.id;
    const url = new URL(`${config.navidromeUrl}/rest/stream`);
    url.searchParams.append('u', config.navidromeUsername);
    url.searchParams.append('t', subsonicToken);
    url.searchParams.append('s', subsonicSalt);
    url.searchParams.append('f', 'json');
    url.searchParams.append('v', '1.8.0');
    url.searchParams.append('c', 'MyApp');
    url.searchParams.append('id', songId);

    const range = request.headers.get('range');
    if (range) {
      url.searchParams.append('_range', range);
    }

    const headers = new Headers(request.headers);
    headers.delete('host');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });

    const clonedHeaders = new Headers(response.headers);
    clonedHeaders.set('Access-Control-Allow-Origin', '*');
    clonedHeaders.set('Access-Control-Allow-Methods', 'GET');
    clonedHeaders.set('Access-Control-Allow-Headers', '*');
    if (response.headers.get('accept-ranges')) {
      clonedHeaders.set('accept-ranges', response.headers.get('accept-ranges')!);
    }
    if (response.headers.get('content-length')) {
      clonedHeaders.set('content-length', response.headers.get('content-length')!);
    }
    if (response.headers.get('content-range')) {
      clonedHeaders.set('content-range', response.headers.get('content-range')!);
    }

    return new Response(response.body, {
      status: response.status,
      headers: clonedHeaders,
    });
  },
});