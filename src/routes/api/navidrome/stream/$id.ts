import { createFileRoute } from "@tanstack/react-router";
import { getConfig } from '@/lib/config/config';
import { getAuthToken, subsonicToken, subsonicSalt } from '@/lib/services/navidrome';
import { createHash } from 'crypto';

export const Route = createFileRoute("/api/navidrome/stream/$id")({
  server: {
    handlers: {
  async GET({ request, params }) {
    console.log('Stream route hit:', request.url);
    
    const config = getConfig();
    if (!config.navidromeUrl) {
      console.error('Navidrome URL not configured');
      return new Response('Navidrome not configured', { status: 500 });
    }

    await getAuthToken();

    if (!subsonicToken || !subsonicSalt) {
      console.error('Subsonic authentication missing');
      return new Response('Not authenticated', { status: 401 });
    }

    const { id: songId } = params;
    
    console.log('Song ID from params:', songId);
    
    if (!songId || songId.length < 10) {
      console.error('Invalid song ID:', songId);
      return new Response('Invalid song ID', { status: 400 });
    }

    // Build Subsonic stream URL
    const streamUrl = new URL(`${config.navidromeUrl}/rest/stream`);
    streamUrl.searchParams.set('id', songId);
    streamUrl.searchParams.set('format', 'mp3');
    streamUrl.searchParams.set('maxBitRate', '320');
    streamUrl.searchParams.set('client', 'MusicApp');
    streamUrl.searchParams.set('version', '1.16.0');
    streamUrl.searchParams.set('c', 'MusicApp');
    streamUrl.searchParams.set('f', 'raw');

    // Subsonic authentication parameters
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const salt = subsonicSalt;
    const tokenHash = createHash('md5')
      .update(`${subsonicToken}${timestamp}${salt}`)
      .digest('hex');
    
    streamUrl.searchParams.set('u', config.navidromeUsername || 'admin');
    streamUrl.searchParams.set('t', subsonicToken);
    streamUrl.searchParams.set('s', salt);
    streamUrl.searchParams.set('ts', timestamp);
    streamUrl.searchParams.set('token', tokenHash);
    streamUrl.searchParams.set('v', '1.16.0');

    // Copy additional query params from request
    const requestUrl = new URL(request.url);
    for (const [key, value] of requestUrl.searchParams) {
      if (!streamUrl.searchParams.has(key)) {
        streamUrl.searchParams.set(key, value);
      }
    }

    console.log('Built stream URL with song ID:', songId);

    // Prepare headers for Navidrome
    const headers = new Headers();
    const range = request.headers.get('range');
    if (range) {
      headers.set('Range', range);
      console.log('Forwarding range request:', range);
    }
    
    headers.set('User-Agent', 'MusicApp/1.0');
    headers.set('Accept', '*/*');

    try {
      const response = await fetch(streamUrl.toString(), {
        method: 'GET',
        headers,
      });

      console.log('Navidrome response:', response.status, response.statusText);
      console.log('Content-Type:', response.headers.get('content-type'));
      console.log('Content-Length:', response.headers.get('content-length') || 'unknown');

      if (!response.ok) {
        let errorText = '(no body)';
        try {
          errorText = await response.text();
        } catch {
          // Ignore text extraction error for binary responses
        }
        console.error('Navidrome stream failed:', response.status, errorText);
        return new Response(`Stream failed: ${response.status} - ${errorText}`, {
          status: response.status,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      const clonedHeaders = new Headers(response.headers);
      
      // Essential CORS headers for browser audio playback
      clonedHeaders.set('Access-Control-Allow-Origin', '*');
      clonedHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      clonedHeaders.set('Access-Control-Allow-Headers', 'Range, *');
      clonedHeaders.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');

      // Streaming headers
      clonedHeaders.set('Cache-Control', 'no-cache');
      clonedHeaders.set('Accept-Ranges', 'bytes');

      // Override Cloudflare's restrictive permissions-policy to allow autoplay
      clonedHeaders.set('Permissions-Policy', 'autoplay=(self), camera=(), microphone=(), usb=()');

      // Ensure proper content type for audio
      const contentType = response.headers.get('content-type') || 'audio/mpeg';
      clonedHeaders.set('Content-Type', contentType);

      console.log('Proxying audio stream, content-type:', contentType);
      
      return new Response(response.body, {
        status: response.status,
        headers: clonedHeaders,
      });
      
    } catch (error) {
      console.error('Proxy fetch error:', error);
      return new Response(`Proxy error: ${String(error)}`, { status: 500 });
    }
  },

  OPTIONS() {
    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    headers.set('Access-Control-Max-Age', '86400');
    
    return new Response(null, { status: 204, headers });
  },
    },
  },
});