import { createFileRoute } from "@tanstack/react-router";
import { getConfig } from '@/lib/config/config';
import { getAuthToken, subsonicToken, subsonicSalt } from '@/lib/services/navidrome';

export const Route = createFileRoute("/api/navidrome/stream/id/id")({
  server: {
    handlers: {
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
    
    console.log('Stream request - songId:', songId);
    console.log('Stream auth - subsonicToken exists:', !!subsonicToken);
    console.log('Stream auth - subsonicSalt exists:', !!subsonicSalt);
    
    const url = new URL(`${config.navidromeUrl}/rest/stream`);
    url.searchParams.append('u', config.navidromeUsername);
    url.searchParams.append('t', subsonicToken);
    url.searchParams.append('s', subsonicSalt);
    url.searchParams.append('f', 'json'); // Match official Navidrome UI
    url.searchParams.append('v', '1.8.0'); // Match official version
    url.searchParams.append('c', 'NavidromeUI'); // Match official client
    url.searchParams.append('id', songId);

    const range = request.headers.get('range');
    if (range) {
      // Official Navidrome uses _range for range requests
      url.searchParams.append('_range', range);
      console.log('Stream range request:', range);
    }

    console.log('Full streaming URL (matching official):', url.toString());

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('Accept', 'audio/*, */*');

    console.log('Stream fetch headers:', Object.fromEntries(headers.entries()));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });

    console.log('Navidrome stream response status:', response.status, response.statusText);
    console.log('Navidrome stream response headers:', Object.fromEntries(response.headers.entries()));
    console.log('Navidrome stream content-type:', response.headers.get('content-type'));
    console.log('Navidrome stream content-length:', response.headers.get('content-length'));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Stream fetch failed - full error:', errorText);
      return new Response(`Failed to stream audio from Navidrome: ${response.status} ${errorText.substring(0, 300)}`, { status: 502 });
    }

    // For audio streaming, don't check content-type strictly as Navidrome may return audio/* or application/octet-stream
    const contentType = response.headers.get('content-type') || '';
    console.log('Stream content-type (may be octet-stream):', contentType);

    const clonedHeaders = new Headers(response.headers);
    // CORS for audio streaming
    clonedHeaders.set('Access-Control-Allow-Origin', '*');
    clonedHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    clonedHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    clonedHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    clonedHeaders.set('Pragma', 'no-cache');
    clonedHeaders.set('Expires', '0');

    // Forward all audio streaming headers
    const streamingHeaders = [
      'accept-ranges', 'content-length', 'content-range', 'content-type', 
      'content-encoding', 'content-disposition', 'transfer-encoding'
    ];
    streamingHeaders.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        clonedHeaders.set(header, value);
      }
    });

    console.log('Stream proxy returning - content-type:', contentType, 'length:', response.headers.get('content-length'));
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: clonedHeaders,
    });
  },
    },
  },
});