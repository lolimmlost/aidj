/**
 * Last.fm Similar Tracks API Route
 * Story 7.2: Last.fm Integration for Discovery Mode
 *
 * GET /api/lastfm/similar-tracks?artist=X&track=Y&limit=20
 * Returns tracks similar to the given artist/track, enriched with library status
 */

import { createServerFileRoute } from '@tanstack/react-start/server';
import { getConfig } from '@/lib/config/config';
import { LastFmClient } from '@/lib/services/lastfm';

export const ServerRoute = createServerFileRoute('/api/lastfm/similar-tracks').methods({
  GET: async ({ request }) => {
    try {
      const url = new URL(request.url);
      const artist = url.searchParams.get('artist');
      const track = url.searchParams.get('track');
      const limit = parseInt(url.searchParams.get('limit') || '20');

      if (!artist || !track) {
        return new Response(
          JSON.stringify({ error: 'Artist and track parameters are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const config = getConfig();
      if (!config.lastfmApiKey) {
        return new Response(
          JSON.stringify({
            error: 'Last.fm API key not configured',
            code: 'LASTFM_NOT_CONFIGURED',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const client = new LastFmClient({ apiKey: config.lastfmApiKey });
      const similarTracks = await client.getSimilarTracks(artist, track, limit);

      return new Response(JSON.stringify({ tracks: similarTracks }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[Last.fm API] Similar tracks error:', error);

      const errorResponse = {
        error: error instanceof Error ? error.message : 'Failed to fetch similar tracks',
        code: (error as { code?: string }).code || 'LASTFM_ERROR',
      };

      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
});
