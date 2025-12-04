import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../lib/auth/auth';
import { getTopArtists } from '../../../lib/services/navidrome';

export const ServerRoute = createServerFileRoute('/api/library/top-artists').methods({
  /**
   * GET /api/library/top-artists
   * Returns top artists based on play count from Navidrome
   */
  GET: async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '5');

      const artists = await getTopArtists(limit);

      return new Response(JSON.stringify({ artists }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Failed to fetch top artists:', error);
      return new Response(JSON.stringify({
        error: 'Failed to fetch top artists',
        artists: []
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
});
