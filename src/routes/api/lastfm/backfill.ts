/**
 * Last.fm Scrobble Backfill API Endpoint
 *
 * POST /api/lastfm/backfill - Start a scrobble backfill from Last.fm
 *
 * Body:
 * - username: Last.fm username (required)
 * - fromDate: ISO date string to start from (optional)
 * - maxPages: Maximum pages to fetch (optional, default: 50)
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 3.1
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { runScrobbleBackfill } from '../../../lib/services/lastfm-backfill';

export const Route = createFileRoute("/api/lastfm/backfill")({
  server: {
    handlers: {
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

          let body: { username?: string; fromDate?: string; maxPages?: number } = {};
          try {
            body = await request.json();
          } catch {
            return new Response(
              JSON.stringify({ error: 'Invalid request body' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }

          if (!body.username || typeof body.username !== 'string') {
            return new Response(
              JSON.stringify({ error: 'Last.fm username is required' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }

          const fromDate = body.fromDate ? new Date(body.fromDate) : undefined;
          const maxPages = body.maxPages ? Math.min(Math.max(body.maxPages, 1), 100) : 50;

          console.log(`📥 [BackfillAPI] Starting backfill for user ${session.user.id}, Last.fm: ${body.username}`);

          const result = await runScrobbleBackfill({
            username: body.username,
            userId: session.user.id,
            fromDate,
            maxPages,
          });

          return new Response(
            JSON.stringify({
              success: result.status === 'completed',
              data: {
                status: result.status,
                totalScrobbles: result.totalScrobbles,
                imported: result.imported,
                skipped: result.skipped,
                pagesProcessed: result.currentPage,
                error: result.error,
              },
            }),
            { status: result.status === 'error' ? 500 : 200, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('📥 [BackfillAPI] Error:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});
