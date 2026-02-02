/**
 * Album Age Distribution API Endpoint
 *
 * GET /api/listening-history/album-ages - Get decade distribution of listened albums
 *
 * Query params:
 * - preset: 'week' | 'month' | 'year' (default: 'month')
 *
 * Returns distribution of plays grouped by release decade.
 * Uses Navidrome song search to resolve album years for listened songs.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 1.4
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { listeningHistory } from '../../../lib/db/schema';
import { and, eq, gte, lte, sql, desc } from 'drizzle-orm';
import { search } from '../../../lib/services/navidrome';
import { getCacheService } from '../../../lib/services/cache';
import { getPresetRange } from '../../../lib/utils/period-comparison';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getAlbumYear(artist: string, title: string): Promise<number | null> {
  const cache = getCacheService();
  const cacheKey = `album-year:${artist.toLowerCase()}:${title.toLowerCase()}`;

  const cached = cache.get<number | null>('general', cacheKey);
  if (cached !== undefined && cached !== null) return cached;

  try {
    const results = await search(`${artist} ${title}`, 0, 3);
    const match = results.find(s => {
      const artistMatch = s.artist?.toLowerCase().includes(artist.toLowerCase()) ||
                         artist.toLowerCase().includes(s.artist?.toLowerCase() || '');
      const titleMatch = s.title?.toLowerCase().includes(title.toLowerCase()) ||
                        title.toLowerCase().includes(s.title?.toLowerCase() || '');
      return artistMatch && titleMatch;
    });

    const year = match?.year || null;
    cache.set('general', cacheKey, year, { ttlMs: CACHE_TTL_MS });
    return year;
  } catch {
    return null;
  }
}

function getDecade(year: number): string {
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

export const Route = createFileRoute("/api/listening-history/album-ages")({
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
          const range = getPresetRange(preset);

          // Get unique songs from listening history
          const songs = await db
            .select({
              artist: listeningHistory.artist,
              title: listeningHistory.title,
              plays: sql<number>`count(*)::int`,
            })
            .from(listeningHistory)
            .where(
              and(
                eq(listeningHistory.userId, session.user.id),
                gte(listeningHistory.playedAt, range.start),
                lte(listeningHistory.playedAt, range.end)
              )
            )
            .groupBy(listeningHistory.artist, listeningHistory.title)
            .orderBy(desc(sql`count(*)`))
            .limit(100); // Top 100 most played songs

          // Resolve years (with concurrency limit)
          const decadeCounts = new Map<string, number>();
          const BATCH_SIZE = 5;

          for (let i = 0; i < songs.length; i += BATCH_SIZE) {
            const batch = songs.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
              batch.map(async song => {
                const year = await getAlbumYear(song.artist, song.title);
                return { year, plays: song.plays };
              })
            );

            for (const result of results) {
              if (result.status === 'fulfilled' && result.value.year) {
                const decade = getDecade(result.value.year);
                decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + result.value.plays);
              }
            }
          }

          // Sort decades chronologically
          const distribution = Array.from(decadeCounts.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([decade, plays]) => ({ decade, plays }));

          const totalWithYear = distribution.reduce((sum, d) => sum + d.plays, 0);
          const avgYear = totalWithYear > 0
            ? Math.round(
                distribution.reduce(
                  (sum, d) => sum + parseInt(d.decade) * d.plays,
                  0
                ) / totalWithYear
              )
            : null;

          return new Response(
            JSON.stringify({
              success: true,
              preset,
              distribution,
              avgDecade: avgYear ? getDecade(avgYear) : null,
              songsAnalyzed: songs.length,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('Error getting album ages:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});
