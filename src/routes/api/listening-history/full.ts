/**
 * Full Listening History API Endpoint
 *
 * GET /api/listening-history/full?limit=50&days=7
 * GET /api/listening-history/full?limit=50&days=7&before=2026-02-15T12:00:00.000Z
 *
 * Returns all plays (not deduplicated), newest first, with summary stats.
 * Includes playDuration, songDuration, completed, skipDetected.
 *
 * Uses cursor-based pagination: pass the `playedAt` of the last item as `before`
 * to fetch the next page. Summary stats are only returned on the first page (no cursor).
 *
 * Query params:
 * - limit: number (default: 50, max: 200)
 * - days: number (default: 7) - time period filter
 * - before: ISO date string — cursor for next page (omit for first page)
 *
 * Response:
 * {
 *   history: [...],
 *   summary?: { totalPlays, uniqueSongs, repeatCount },   // first page only
 *   songPlayCounts?: Record<string, number>,                // first page only
 *   hasMore: boolean,
 *   nextCursor: string | null                               // playedAt of last item
 * }
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { listeningHistory } from '../../../lib/db/schema/listening-history.schema';
import { eq, desc, gte, and, lt, sql, count, countDistinct } from 'drizzle-orm';

export const Route = createFileRoute("/api/listening-history/full")({
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
          const safeInt = (v: string | null, fallback: number) => {
            const n = Number(v);
            return Number.isFinite(n) ? Math.floor(n) : fallback;
          };
          const limit = Math.min(Math.max(1, safeInt(url.searchParams.get('limit'), 50)), 200);
          const days = Math.min(Math.max(1, safeInt(url.searchParams.get('days'), 7)), 365);
          const beforeParam = url.searchParams.get('before');

          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);

          // Base conditions: user + time period
          const baseConditions = and(
            eq(listeningHistory.userId, session.user.id),
            gte(listeningHistory.playedAt, cutoff)
          );

          // Cursor condition: only rows older than the cursor
          const cursorDate = beforeParam ? new Date(beforeParam) : null;
          const isFirstPage = !cursorDate || isNaN(cursorDate.getTime());

          const rowConditions = isFirstPage
            ? baseConditions
            : and(baseConditions, lt(listeningHistory.playedAt, cursorDate));

          // History rows (always fetched)
          const historyQuery = db
            .select({
              id: listeningHistory.id,
              songId: listeningHistory.songId,
              artist: listeningHistory.artist,
              title: listeningHistory.title,
              album: listeningHistory.album,
              genre: listeningHistory.genre,
              playedAt: listeningHistory.playedAt,
              playDuration: listeningHistory.playDuration,
              songDuration: listeningHistory.songDuration,
              completed: listeningHistory.completed,
              skipDetected: listeningHistory.skipDetected,
            })
            .from(listeningHistory)
            .where(rowConditions)
            .orderBy(desc(listeningHistory.playedAt))
            .limit(limit + 1); // Fetch one extra to determine hasMore

          if (isFirstPage) {
            // First page: fetch rows + summary stats in parallel
            const [results, summaryResult, repeatResult, songCountsResult] = await Promise.all([
              historyQuery,

              // Summary: totalPlays and uniqueSongs
              db
                .select({
                  totalPlays: count(),
                  uniqueSongs: countDistinct(listeningHistory.songId),
                })
                .from(listeningHistory)
                .where(baseConditions),

              // Repeat count: songs appearing 2+ times
              db
                .select({
                  repeatCount: count(),
                })
                .from(
                  db
                    .select({
                      songId: listeningHistory.songId,
                      playCount: count().as('play_count'),
                    })
                    .from(listeningHistory)
                    .where(baseConditions)
                    .groupBy(listeningHistory.songId)
                    .having(sql`count(*) >= 2`)
                    .as('repeated_songs')
                ),

              // Per-song play counts for the full period (for accurate repeat badges)
              db
                .select({
                  songId: listeningHistory.songId,
                  playCount: count().as('play_count'),
                })
                .from(listeningHistory)
                .where(baseConditions)
                .groupBy(listeningHistory.songId)
                .having(sql`count(*) >= 2`),
            ]);

            const hasMore = results.length > limit;
            const rows = hasMore ? results.slice(0, limit) : results;
            const history = formatRows(rows);
            const lastRow = rows[rows.length - 1];

            const summary = {
              totalPlays: summaryResult[0]?.totalPlays ?? 0,
              uniqueSongs: summaryResult[0]?.uniqueSongs ?? 0,
              repeatCount: repeatResult[0]?.repeatCount ?? 0,
            };

            const songPlayCounts: Record<string, number> = {};
            for (const row of songCountsResult) {
              songPlayCounts[row.songId] = row.playCount;
            }

            return new Response(
              JSON.stringify({
                history,
                summary,
                songPlayCounts,
                hasMore,
                nextCursor: hasMore && lastRow ? lastRow.playedAt.toISOString() : null,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          } else {
            // Subsequent pages: only fetch rows (summary already shown)
            const results = await historyQuery;
            const hasMore = results.length > limit;
            const rows = hasMore ? results.slice(0, limit) : results;
            const history = formatRows(rows);
            const lastRow = rows[rows.length - 1];

            return new Response(
              JSON.stringify({
                history,
                hasMore,
                nextCursor: hasMore && lastRow ? lastRow.playedAt.toISOString() : null,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        } catch (error) {
          console.error('Error fetching full listening history:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});

function formatRows(rows: Array<{
  id: number;
  songId: string;
  artist: string;
  title: string;
  album: string | null;
  genre: string | null;
  playedAt: Date;
  playDuration: number | null;
  songDuration: number | null;
  completed: number | null;
  skipDetected: number | null;
}>) {
  return rows.map(row => ({
    id: row.id,
    songId: row.songId,
    artist: row.artist,
    title: row.title,
    album: row.album,
    genre: row.genre,
    playedAt: row.playedAt.toISOString(),
    playDuration: row.playDuration,
    songDuration: row.songDuration,
    completed: row.completed === 1,
    skipDetected: row.skipDetected === 1,
  }));
}
