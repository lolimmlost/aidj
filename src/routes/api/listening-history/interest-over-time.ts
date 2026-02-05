/**
 * Interest Tracking Over Time API Endpoint
 *
 * GET /api/listening-history/interest-over-time - Get artist interest curves
 *
 * Query params:
 * - artist: Artist name to track (optional, returns top 5 if omitted)
 * - months: Number of months to look back (default: 6, max: 12)
 *
 * Returns monthly play counts for tracked artists, showing rising/falling interest.
 * Inspired by Koito's interest tracking curves.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 3.2
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { listeningHistory } from '../../../lib/db/schema';
import { and, eq, gte, sql, desc } from 'drizzle-orm';

export const Route = createFileRoute("/api/listening-history/interest-over-time")({
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
          const artistFilter = url.searchParams.get('artist');
          const fromParam = url.searchParams.get('from');
          const toParam = url.searchParams.get('to');
          const months = Math.min(Math.max(parseInt(url.searchParams.get('months') || '6'), 1), 12);

          let cutoffDate: Date;
          let endDate: Date;
          let effectiveMonths: number;

          if (fromParam && toParam) {
            cutoffDate = new Date(fromParam);
            endDate = new Date(toParam);
            // Calculate months between from and to
            effectiveMonths = Math.max(1,
              (endDate.getFullYear() - cutoffDate.getFullYear()) * 12
              + endDate.getMonth() - cutoffDate.getMonth() + 1
            );
          } else {
            endDate = new Date();
            cutoffDate = new Date();
            cutoffDate.setMonth(cutoffDate.getMonth() - months);
            effectiveMonths = months;
          }

          if (artistFilter) {
            // Single artist mode - monthly play counts
            const data = await db
              .select({
                month: sql<string>`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`,
                plays: sql<number>`count(*)::int`,
              })
              .from(listeningHistory)
              .where(
                and(
                  eq(listeningHistory.userId, session.user.id),
                  eq(listeningHistory.artist, artistFilter),
                  gte(listeningHistory.playedAt, cutoffDate)
                )
              )
              .groupBy(sql`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`)
              .orderBy(sql`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`);

            // Fill in missing months
            const filled = fillMonths(data, effectiveMonths, endDate);

            return new Response(
              JSON.stringify({
                success: true,
                mode: 'single',
                artist: artistFilter,
                data: filled,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          // Multi-artist mode - top 5 artists by recent play count
          const topArtists = await db
            .select({
              artist: listeningHistory.artist,
              totalPlays: sql<number>`count(*)::int`,
            })
            .from(listeningHistory)
            .where(
              and(
                eq(listeningHistory.userId, session.user.id),
                gte(listeningHistory.playedAt, cutoffDate)
              )
            )
            .groupBy(listeningHistory.artist)
            .orderBy(desc(sql`count(*)`))
            .limit(5);

          // Get monthly data for each top artist
          const artistData = await Promise.all(
            topArtists.map(async ({ artist }) => {
              const monthlyData = await db
                .select({
                  month: sql<string>`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`,
                  plays: sql<number>`count(*)::int`,
                })
                .from(listeningHistory)
                .where(
                  and(
                    eq(listeningHistory.userId, session.user.id),
                    eq(listeningHistory.artist, artist),
                    gte(listeningHistory.playedAt, cutoffDate)
                  )
                )
                .groupBy(sql`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`)
                .orderBy(sql`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`);

              const filled = fillMonths(monthlyData, effectiveMonths, endDate);

              // Calculate trend (rising/falling/stable)
              const recentHalf = filled.slice(-Math.ceil(filled.length / 2));
              const olderHalf = filled.slice(0, Math.floor(filled.length / 2));
              const recentAvg = recentHalf.reduce((s, d) => s + d.plays, 0) / (recentHalf.length || 1);
              const olderAvg = olderHalf.reduce((s, d) => s + d.plays, 0) / (olderHalf.length || 1);

              let trend: 'rising' | 'falling' | 'stable' = 'stable';
              if (olderAvg > 0) {
                const change = (recentAvg - olderAvg) / olderAvg;
                if (change > 0.2) trend = 'rising';
                else if (change < -0.2) trend = 'falling';
              } else if (recentAvg > 0) {
                trend = 'rising';
              }

              return { artist, data: filled, trend };
            })
          );

          return new Response(
            JSON.stringify({
              success: true,
              mode: 'multi',
              artists: artistData,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('Error getting interest over time:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});

/**
 * Fill in missing months with 0 plays
 */
function fillMonths(
  data: Array<{ month: string; plays: number }>,
  monthsBack: number,
  referenceDate?: Date
): Array<{ month: string; plays: number }> {
  const monthMap = new Map(data.map(d => [d.month, d.plays]));
  const result: Array<{ month: string; plays: number }> = [];

  const ref = referenceDate || new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.push({ month: key, plays: monthMap.get(key) || 0 });
  }

  return result;
}
