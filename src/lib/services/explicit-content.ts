/**
 * Explicit Content Lookup Service
 *
 * Uses Deezer's free API to determine if songs contain explicit lyrics.
 * Results are cached in the explicit_content_cache DB table.
 *
 * Rate limiting: max 2 concurrent Deezer requests, 100ms delay between requests.
 */

import { db } from '../db';
import { explicitContentCache } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { Song } from '../types/song';

const DEEZER_API_BASE = 'https://api.deezer.com';
const MAX_CONCURRENT = 2;
const REQUEST_DELAY_MS = 100;

/**
 * Normalize artist/title for cache key consistency
 */
function normalize(str: string): string {
  return str.toLowerCase().trim();
}

/**
 * Build a cache key from artist + title
 */
function cacheKey(artist: string, title: string): string {
  return `${normalize(artist)}::${normalize(title)}`;
}

/**
 * Simple concurrency limiter
 */
async function withConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  delayMs: number,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    while (index < tasks.length) {
      const current = index++;
      if (current > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      results[current] = await tasks[current]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

/**
 * Check if a Deezer result matches the requested artist/title.
 * Uses substring matching to handle slight naming differences.
 */
function isMatch(
  resultArtist: string,
  resultTitle: string,
  queryArtist: string,
  queryTitle: string,
): boolean {
  const ra = normalize(resultArtist);
  const rt = normalize(resultTitle);
  const qa = normalize(queryArtist);
  const qt = normalize(queryTitle);

  const artistMatch = ra.includes(qa) || qa.includes(ra);
  const titleMatch = rt.includes(qt) || qt.includes(rt);

  return artistMatch && titleMatch;
}

/**
 * Look up explicit status for a single song via Deezer API.
 * Returns true if explicit, false if clean, null on error.
 */
export async function lookupExplicitStatus(
  artist: string,
  title: string,
): Promise<boolean | null> {
  const normArtist = normalize(artist);
  const normTitle = normalize(title);

  // Check cache first
  const cached = await db
    .select()
    .from(explicitContentCache)
    .where(
      and(
        eq(explicitContentCache.artist, normArtist),
        eq(explicitContentCache.title, normTitle),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (cached) {
    return cached.isExplicit;
  }

  // Query Deezer
  try {
    const query = `${artist} ${title}`;
    const res = await fetch(
      `${DEEZER_API_BASE}/search/track?q=${encodeURIComponent(query)}&limit=3`,
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const tracks = data.data as Array<{
      artist?: { name?: string };
      title?: string;
      explicit_lyrics?: boolean;
    }> | undefined;

    if (!tracks || tracks.length === 0) {
      // No results — save as not explicit with low confidence
      await saveToCache(normArtist, normTitle, false, 0.0);
      return false;
    }

    // Find a matching track
    const match = tracks.find((t) =>
      isMatch(t.artist?.name || '', t.title || '', artist, title),
    );

    if (match) {
      const isExplicit = match.explicit_lyrics === true;
      await saveToCache(normArtist, normTitle, isExplicit, 1.0);
      return isExplicit;
    }

    // No good match — default to not explicit with low confidence
    await saveToCache(normArtist, normTitle, false, 0.0);
    return false;
  } catch (error) {
    console.warn(`Deezer explicit lookup failed for "${artist} - ${title}":`, error);
    return null;
  }
}

/**
 * Save an explicit content result to the DB cache.
 */
async function saveToCache(
  artist: string,
  title: string,
  isExplicit: boolean,
  confidence: number,
): Promise<void> {
  try {
    await db
      .insert(explicitContentCache)
      .values({
        artist,
        title,
        isExplicit,
        confidence,
        source: 'deezer',
      })
      .onConflictDoUpdate({
        target: [explicitContentCache.artist, explicitContentCache.title],
        set: {
          isExplicit,
          confidence,
          checkedAt: new Date(),
        },
      });
  } catch (error) {
    console.warn('Failed to cache explicit content result:', error);
  }
}

/**
 * Batch lookup explicit status for multiple songs.
 * Checks DB cache first, then queries Deezer for uncached songs.
 *
 * @returns Map of "artist::title" -> isExplicit
 */
export async function batchLookupExplicit(
  songs: Array<{ artist: string; title: string }>,
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();

  if (songs.length === 0) return result;

  // Normalize all inputs
  const normalized = songs.map((s) => ({
    artist: normalize(s.artist),
    title: normalize(s.title),
    key: cacheKey(s.artist, s.title),
    originalArtist: s.artist,
    originalTitle: s.title,
  }));

  // Batch query cache — get all unique artists and check DB
  const uniqueArtists = [...new Set(normalized.map((s) => s.artist))];
  const cachedRows = await db
    .select()
    .from(explicitContentCache)
    .where(inArray(explicitContentCache.artist, uniqueArtists));

  // Build lookup map from cache
  const cacheMap = new Map<string, boolean>();
  for (const row of cachedRows) {
    cacheMap.set(cacheKey(row.artist, row.title), row.isExplicit);
  }

  // Separate cached and uncached
  const uncached: typeof normalized = [];
  for (const song of normalized) {
    const cached = cacheMap.get(song.key);
    if (cached !== undefined) {
      result.set(song.key, cached);
    } else {
      uncached.push(song);
    }
  }

  if (uncached.length === 0) return result;

  // Lookup uncached songs from Deezer with concurrency limit
  const tasks = uncached.map((song) => async () => {
    const isExplicit = await lookupExplicitStatus(song.originalArtist, song.originalTitle);
    return { key: song.key, isExplicit: isExplicit ?? false };
  });

  const lookupResults = await withConcurrencyLimit(tasks, MAX_CONCURRENT, REQUEST_DELAY_MS);
  for (const { key, isExplicit } of lookupResults) {
    result.set(key, isExplicit);
  }

  return result;
}

/**
 * Filter out explicit songs from an array.
 * Convenience function: batch-lookup all songs, return only non-explicit ones.
 */
export async function filterExplicitSongs(songs: Song[]): Promise<Song[]> {
  if (songs.length === 0) return songs;

  const lookupInput = songs
    .filter((s) => s.artist && (s.title || s.name))
    .map((s) => ({
      artist: s.artist!,
      title: s.title || s.name,
    }));

  const explicitMap = await batchLookupExplicit(lookupInput);

  return songs.filter((s) => {
    if (!s.artist) return true; // Can't determine, keep it
    const title = s.title || s.name;
    const key = cacheKey(s.artist, title);
    return !explicitMap.get(key);
  });
}
