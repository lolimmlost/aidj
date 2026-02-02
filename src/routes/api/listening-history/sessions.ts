/**
 * Longest Listening Sessions API Endpoint
 *
 * GET /api/listening-history/sessions - Get longest continuous listening sessions
 *
 * Query params:
 * - preset: 'week' | 'month' | 'year' (default: 'month')
 * - limit: Number of sessions to return (default: 5, max: 10)
 *
 * Returns the longest continuous listening sessions in the period.
 * A session ends when there's a gap of 15+ minutes between plays.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 1.5
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { getLongestSessions } from '../../../lib/services/listening-history';
import { getPresetRange } from '../../../lib/utils/period-comparison';

export const Route = createFileRoute("/api/listening-history/sessions")({
  server: {
    handlers: {
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
          const preset = (url.searchParams.get('preset') || 'month') as 'week' | 'month' | 'year';
          const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '5'), 1), 10);

          const range = getPresetRange(preset);
          const sessions = await getLongestSessions(session.user.id, range.start, range.end, 15, limit);

          return new Response(
            JSON.stringify({
              success: true,
              preset,
              sessions: sessions.map(s => ({
                startTime: s.startTime.toISOString(),
                endTime: s.endTime.toISOString(),
                durationMinutes: s.durationMinutes,
                songCount: s.songCount,
              })),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('Error getting listening sessions:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});
