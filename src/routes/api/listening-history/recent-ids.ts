/**
 * Recently Played Song Ids
 *
 * GET /api/listening-history/recent-ids - Song ids played in the last 14 days
 *
 * Used by shuffle to place recently heard songs after everything else.
 */
import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { getRecentlyPlayedSongIds } from '../../../lib/services/listening-history';

export const Route = createFileRoute("/api/listening-history/recent-ids")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const songIds = await getRecentlyPlayedSongIds(session.user.id);
          return new Response(JSON.stringify({ songIds }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' },
          });
        } catch (error) {
          console.error('Error fetching recently played song ids:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});
