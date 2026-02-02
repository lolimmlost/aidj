/**
 * Listening History Stats API Endpoint
 *
 * GET /api/listening-history/stats - Get listening stats with period comparison
 *
 * Query params:
 * - preset: 'day' | 'week' | 'month' | 'year' (default: 'week')
 *
 * Returns current period stats and percentage changes vs previous period.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 1.1
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { getListeningStatsByPeriod, getArtistDiversity } from '../../../lib/services/listening-history';
import { getPresetRange, getLastPeriod, getPercentChange } from '../../../lib/utils/period-comparison';

export const Route = createFileRoute("/api/listening-history/stats")({
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
          const preset = (url.searchParams.get('preset') || 'week') as 'day' | 'week' | 'month' | 'year';

          const currentRange = getPresetRange(preset);
          const previousRange = getLastPeriod(currentRange.start, currentRange.end);

          // Fetch current and previous period stats in parallel
          const [current, previous, diversity] = await Promise.all([
            getListeningStatsByPeriod(session.user.id, currentRange.start, currentRange.end),
            getListeningStatsByPeriod(session.user.id, previousRange.start, previousRange.end),
            getArtistDiversity(session.user.id, currentRange.start, currentRange.end),
          ]);

          // Normalize entropy to a 0-100 diversity score
          // Score = entropy / maxEntropy * 100, where maxEntropy = ln(uniqueArtists)
          const maxEntropy = diversity.uniqueArtists > 1 ? Math.log(diversity.uniqueArtists) : 1;
          const diversityScore = diversity.uniqueArtists > 0
            ? Math.round((diversity.entropy / maxEntropy) * 100)
            : 0;

          return new Response(
            JSON.stringify({
              success: true,
              preset,
              current,
              previous,
              deltas: {
                totalPlays: getPercentChange(current.totalPlays, previous.totalPlays),
                uniqueTracks: getPercentChange(current.uniqueTracks, previous.uniqueTracks),
                uniqueArtists: getPercentChange(current.uniqueArtists, previous.uniqueArtists),
                totalMinutesListened: getPercentChange(current.totalMinutesListened, previous.totalMinutesListened),
              },
              diversity: {
                entropy: diversity.entropy,
                uniqueArtists: diversity.uniqueArtists,
                score: diversityScore,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('Error getting listening stats:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});
