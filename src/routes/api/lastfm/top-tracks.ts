/**
 * Last.fm Top Tracks API Route
 * Story 7.2: Last.fm Integration for Discovery Mode
 *
 * GET /api/lastfm/top-tracks?artist=X&limit=10
 * Returns top tracks by the given artist, enriched with library status
 */

import { createFileRoute } from "@tanstack/react-router";
import { getConfig } from '@/lib/config/config';
import { LastFmClient } from '@/lib/services/lastfm';

export const Route = createFileRoute("/api/lastfm/top-tracks")({
  server: {
    handlers: {
  GET: async ({ request }) => {
    try {
      const url = new URL(request.url);
      const artist = url.searchParams.get('artist');
      const limit = parseInt(url.searchParams.get('limit') || '10');

      if (!artist) {
        return new Response(
          JSON.stringify({ error: 'Artist parameter is required' }),
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
      const topTracks = await client.getTopTracks(artist, limit);

      return new Response(JSON.stringify({ tracks: topTracks }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[Last.fm API] Top tracks error:', error);

      const errorResponse = {
        error: error instanceof Error ? error.message : 'Failed to fetch top tracks',
        code: (error as { code?: string }).code || 'LASTFM_ERROR',
      };

      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
    },
  },
});
