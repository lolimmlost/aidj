/**
 * API endpoint for compound score operations
 *
 * GET /api/listening-history/compound-scores - Get recommendations ranked by compound score
 * POST /api/listening-history/compound-scores - Trigger compound score calculation
 */
import { createServerFileRoute } from '@tanstack/react-start/server';
import {
  calculateCompoundScores,
  getCompoundScoredRecommendations,
} from '../../../lib/services/compound-scoring';
import { auth } from '../../../lib/auth/auth';

export const ServerRoute = createServerFileRoute('/api/listening-history/compound-scores').methods({
  // Get compound-scored recommendations
  GET: async ({ request }) => {
    try {
      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
      });

      if (!session?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const minSourceCount = parseInt(url.searchParams.get('minSourceCount') || '1');
      const excludeArtists = url.searchParams.get('excludeArtists')?.split(',').filter(Boolean) || [];
      const excludeSongIds = url.searchParams.get('excludeSongIds')?.split(',').filter(Boolean) || [];

      const recommendations = await getCompoundScoredRecommendations(session.user.id, {
        limit,
        minSourceCount,
        excludeArtists,
        excludeSongIds,
      });

      return new Response(
        JSON.stringify({
          success: true,
          recommendations,
          count: recommendations.length,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('Error getting compound scores:', error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },

  // Trigger compound score calculation
  POST: async ({ request }) => {
    try {
      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
      });

      if (!session?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const count = await calculateCompoundScores(session.user.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Calculated ${count} compound scores`,
          count,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('Error calculating compound scores:', error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
});
