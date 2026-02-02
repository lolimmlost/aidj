/**
 * Album Age Distribution API Endpoint
 *
 * GET /api/listening-history/album-ages - Get decade distribution of listened albums
 *
 * Query params:
 * - preset: 'week' | 'month' | 'year' (default: 'month')
 *
 * Returns distribution of plays grouped by release decade.
 * Uses batch-by-artist Navidrome search to resolve album years efficiently.
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

function getDecade(year: number): string {
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

function makeKey(artist: string, title: string): string {
  return `${artist.toLowerCase()}:${title.toLowerCase()}`;
}

/**
 * Batch-resolve album years by artist.
 * Instead of 100 individual search(artist+title) calls, groups songs by artist
 * and does ~20-40 search(artist) calls. Each returns multiple songs with year data.
 */
async function batchResolveYears(
  songs: Array<{ artist: string; title: string; plays: number }>
): Promise<Map<string, number>> {
  const cache = getCacheService();
  const yearMap = new Map<string, number>();
  const unresolvedSongs: Array<{ artist: string; title: string }> = [];

  // Step 1: Check cache first for all songs
  for (const song of songs) {
    const cacheKey = `album-year:${song.artist.toLowerCase()}:${song.title.toLowerCase()}`;
    const cached = cache.get<number | null>('general', cacheKey);
    if (cached !== undefined && cached !== null) {
      yearMap.set(makeKey(song.artist, song.title), cached);
    } else {
      unresolvedSongs.push(song);
    }
  }

  if (unresolvedSongs.length === 0) return yearMap;

  // Step 2: Group unresolved songs by artist
  const byArtist = new Map<string, Array<{ artist: string; title: string }>>();
  for (const song of unresolvedSongs) {
    const artistLower = song.artist.toLowerCase();
    if (!byArtist.has(artistLower)) {
      byArtist.set(artistLower, []);
    }
    byArtist.get(artistLower)!.push(song);
  }

  // Step 3: Fetch by artist in batches
  const artistEntries = Array.from(byArtist.entries());
  const BATCH_SIZE = 5;

  for (let i = 0; i < artistEntries.length; i += BATCH_SIZE) {
    const batch = artistEntries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ([, artistSongs]) => {
        const artistName = artistSongs[0].artist;
        const searchResults = await search(artistName, 0, 50);

        // Build lookup from search results
        for (const result of searchResults) {
          if (result.year && result.artist && result.title) {
            const key = makeKey(result.artist, result.title);
            if (!yearMap.has(key)) {
              yearMap.set(key, result.year);
              // Cache for future requests
              const cacheKey = `album-year:${result.artist.toLowerCase()}:${result.title.toLowerCase()}`;
              cache.set('general', cacheKey, result.year, { ttlMs: CACHE_TTL_MS });
            }
          }
        }

        return { artistName, resultCount: searchResults.length };
      })
    );
  }

  // Step 4: Fall back to individual search for still-unresolved songs
  const stillUnresolved = unresolvedSongs.filter(
    song => !yearMap.has(makeKey(song.artist, song.title))
  );

  if (stillUnresolved.length > 0) {
    const FALLBACK_BATCH = 5;
    for (let i = 0; i < stillUnresolved.length; i += FALLBACK_BATCH) {
      const batch = stillUnresolved.slice(i, i + FALLBACK_BATCH);
      await Promise.allSettled(
        batch.map(async song => {
          try {
            const results = await search(`${song.artist} ${song.title}`, 0, 3);
            const match = results.find(s => {
              const artistMatch = s.artist?.toLowerCase().includes(song.artist.toLowerCase()) ||
                                 song.artist.toLowerCase().includes(s.artist?.toLowerCase() || '');
              const titleMatch = s.title?.toLowerCase().includes(song.title.toLowerCase()) ||
                                song.title.toLowerCase().includes(s.title?.toLowerCase() || '');
              return artistMatch && titleMatch;
            });
            if (match?.year) {
              yearMap.set(makeKey(song.artist, song.title), match.year);
              const cacheKey = `album-year:${song.artist.toLowerCase()}:${song.title.toLowerCase()}`;
              cache.set('general', cacheKey, match.year, { ttlMs: CACHE_TTL_MS });
            }
          } catch {
            // Individual fallback failure is fine
          }
        })
      );
    }
  }

  return yearMap;
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
          const fromParam = url.searchParams.get('from');
          const toParam = url.searchParams.get('to');
          const preset = (url.searchParams.get('preset') || 'month') as 'week' | 'month' | 'year';
          const range = fromParam && toParam
            ? { start: new Date(fromParam), end: new Date(toParam) }
            : getPresetRange(preset);

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

          // Batch-resolve years by artist
          const yearMap = await batchResolveYears(songs);

          // Build decade distribution
          const decadeCounts = new Map<string, number>();
          for (const song of songs) {
            const year = yearMap.get(makeKey(song.artist, song.title));
            if (year) {
              const decade = getDecade(year);
              decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + song.plays);
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
