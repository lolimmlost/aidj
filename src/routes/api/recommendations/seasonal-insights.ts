/**
 * Seasonal Insights API
 * Story 3.11: Task 4 - Endpoint for seasonal pattern data
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { detectSeasonalPreferences } from '../../../lib/services/seasonal-patterns';

export const Route = createFileRoute("/api/recommendations/seasonal-insights")({
  server: {
    handlers: {
  // GET /api/recommendations/seasonal-insights - Get user's seasonal patterns
  GET: async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true,
      },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const preferences = await detectSeasonalPreferences(session.user.id);

      if (preferences.patterns.length === 0) {
        return new Response(JSON.stringify({
          code: 'NO_PATTERNS',
          message: 'Not enough data to detect seasonal patterns'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(preferences), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to get seasonal insights:', error);

      const message = error instanceof Error ? error.message : 'Failed to get seasonal insights';
      return new Response(JSON.stringify({
        code: 'SEASONAL_INSIGHTS_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
    },
  },
});
