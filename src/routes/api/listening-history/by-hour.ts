/**
 * Listening History By Hour API Endpoint
 *
 * GET /api/listening-history/by-hour - Get listening distribution by hour of day
 *
 * Query params:
 * - preset: 'week' | 'month' | 'year' (default: 'month')
 *
 * Returns an array of 24 entries, one per hour, with play counts.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 1.2
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { getListeningByHour } from '../../../lib/services/listening-history';
import { getPresetRange } from '../../../lib/utils/period-comparison';

export const Route = createFileRoute("/api/listening-history/by-hour")({
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
          const fromParam = url.searchParams.get('from');
          const toParam = url.searchParams.get('to');
          const preset = (url.searchParams.get('preset') || 'month') as 'week' | 'month' | 'year';

          const range = fromParam && toParam
            ? { start: new Date(fromParam), end: new Date(toParam) }
            : getPresetRange(preset);
          const hourlyData = await getListeningByHour(session.user.id, range.start, range.end);

          return new Response(
            JSON.stringify({
              success: true,
              preset,
              data: hourlyData,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('Error getting listening by hour:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});
