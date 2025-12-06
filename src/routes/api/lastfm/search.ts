/**
 * Last.fm Search API Route
 * Story 7.2: Last.fm Integration for Discovery Mode
 *
 * GET /api/lastfm/search?query=X&limit=10
 * Searches for tracks by name, enriched with library status
 */

import { createFileRoute } from "@tanstack/react-router";
import { getConfig } from '@/lib/config/config';
import { LastFmClient } from '@/lib/services/lastfm';

export const Route = createFileRoute("/api/lastfm/search")({
  server: {
    handlers: {
  GET: async ({ request }) => {
    try {
      const url = new URL(request.url);
      const query = url.searchParams.get('query') || url.searchParams.get('q');
      const limit = parseInt(url.searchParams.get('limit') || '10');

      if (!query) {
        return new Response(
          JSON.stringify({ error: 'Query parameter is required' }),
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
      const searchResults = await client.searchTracks(query, limit);

      return new Response(JSON.stringify({ tracks: searchResults }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[Last.fm API] Search error:', error);

      const errorResponse = {
        error: error instanceof Error ? error.message : 'Failed to search tracks',
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
