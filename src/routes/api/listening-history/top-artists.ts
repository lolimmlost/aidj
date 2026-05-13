/**
 * Top Played Artists API
 *
 * GET /api/listening-history/top-artists
 *
 * Query params:
 *   preset:  'week' | 'month' | 'year'  (default 'month')
 *   from:    ISO date  (optional, overrides preset)
 *   to:      ISO date  (optional, overrides preset)
 *   limit:   1-50      (default 10)
 *
 * Returns: { success, preset, data: [{ artist, plays, uniqueSongs, lastPlayedAt }] }
 *
 * Drives the "Top Played Artists" card on the Analytics → Listening tab.
 */

import { createFileRoute } from '@tanstack/react-router';
import { auth } from '../../../lib/auth/auth';
import { getTopPlayedArtists } from '../../../lib/services/listening-history';
import { getPresetRange } from '../../../lib/utils/period-comparison';

export const Route = createFileRoute('/api/listening-history/top-artists')({
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
          const limitParam = parseInt(url.searchParams.get('limit') || '10', 10);
          const limit = Math.max(1, Math.min(50, Number.isFinite(limitParam) ? limitParam : 10));

          const range = fromParam && toParam
            ? { start: new Date(fromParam), end: new Date(toParam) }
            : getPresetRange(preset);
          const data = await getTopPlayedArtists(session.user.id, range.start, range.end, limit);

          return new Response(
            JSON.stringify({ success: true, preset, data }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        } catch (error) {
          console.error('Error getting top played artists:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          );
        }
      },
    },
  },
});
