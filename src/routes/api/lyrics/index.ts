/**
 * Lyrics API Route
 *
 * Fetches lyrics from multiple sources with server-side caching:
 * 1. Database cache (30 days)
 * 2. Navidrome (embedded lyrics)
 * 3. LRCLIB (free synced lyrics API)
 */

import { createFileRoute } from '@tanstack/react-router';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { lyricsCache } from '@/lib/db/schema/lyrics-cache.schema';

interface LyricLine {
  time: number;
  text: string;
}

interface LyricsResponse {
  lyrics: string | null;
  syncedLyrics: LyricLine[] | null;
  source: 'navidrome' | 'lrclib' | 'none' | 'cache';
  instrumental?: boolean;
  cached?: boolean;
}

/**
 * Parse LRC format lyrics
 */
function parseLRC(lrcText: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const lrcRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;

  let match;
  while ((match = lrcRegex.exec(lrcText)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
    const text = match[4].trim();

    if (text) {
      const time = minutes * 60 + seconds + milliseconds / 1000;
      lines.push({ time, text });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/**
 * Process LRCLIB API response data
 */
function processLRCLIBData(data: any): LyricsResponse {
  if (data.instrumental) {
    return {
      lyrics: null,
      syncedLyrics: null,
      source: 'lrclib',
      instrumental: true,
    };
  }

  if (data.syncedLyrics) {
    const parsed = parseLRC(data.syncedLyrics);
    return {
      lyrics: data.plainLyrics || parsed.map(l => l.text).join('\n'),
      syncedLyrics: parsed,
      source: 'lrclib',
    };
  }

  if (data.plainLyrics) {
    return {
      lyrics: data.plainLyrics,
      syncedLyrics: null,
      source: 'lrclib',
    };
  }

  return {
    lyrics: null,
    syncedLyrics: null,
    source: 'lrclib',
  };
}

/**
 * Fetch lyrics from LRCLIB
 */
async function fetchFromLRCLIB(
  artist: string,
  title: string,
  album?: string,
  duration?: number
): Promise<LyricsResponse | null> {
  try {
    // Try exact match first (requires all params)
    if (album && duration && duration > 0) {
      const params = new URLSearchParams({
        artist_name: artist,
        track_name: title,
        album_name: album,
        duration: Math.round(duration).toString(),
      });

      console.log(`🎵 LRCLIB exact match attempt: ${params.toString()}`);

      const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
        headers: {
          'User-Agent': 'AIDJ/1.0 (https://github.com/aidj)',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ LRCLIB exact match found!`);
        return processLRCLIBData(data);
      }

      console.log(`❌ LRCLIB exact match failed: ${response.status}`);
    }

    // Fallback: Try search API
    console.log(`🔍 LRCLIB search fallback: ${artist} - ${title}`);
    const searchParams = new URLSearchParams({
      track_name: title,
      artist_name: artist,
    });

    const searchResponse = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
      headers: {
        'User-Agent': 'AIDJ/1.0 (https://github.com/aidj)',
      },
    });

    if (!searchResponse.ok) {
      console.log(`❌ LRCLIB search failed: ${searchResponse.status}`);
      return null;
    }

    const searchResults = await searchResponse.json();

    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      console.log(`❌ LRCLIB search returned no results`);
      return null;
    }

    // Use the first result
    console.log(`✅ LRCLIB search found ${searchResults.length} results, using first match`);
    return processLRCLIBData(searchResults[0]);
  } catch (error) {
    console.error('Error fetching from LRCLIB:', error);
    return null;
  }
}

/**
 * Get cache key for lyrics lookup
 */
function getCacheKey(artist: string, title: string, album?: string, duration?: number): string {
  const parts = [
    artist.toLowerCase().trim(),
    title.toLowerCase().trim(),
  ];
  if (album) parts.push(album.toLowerCase().trim());
  if (duration) parts.push(Math.round(duration).toString());
  return parts.join('::');
}

/**
 * Check cache for lyrics
 */
async function checkCache(
  artist: string,
  title: string,
  album?: string,
  duration?: number
): Promise<LyricsResponse | null> {
  try {
    const now = new Date();

    // Build where clause to match song
    const result = await db
      .select()
      .from(lyricsCache)
      .where(sql`
        LOWER(TRIM(${lyricsCache.artist})) = ${artist.toLowerCase().trim()}
        AND LOWER(TRIM(${lyricsCache.title})) = ${title.toLowerCase().trim()}
        AND ${lyricsCache.expiresAt} > ${now}
      `)
      .limit(1);

    if (result.length > 0) {
      const cached = result[0];
      return {
        lyrics: cached.lyrics || null,
        syncedLyrics: cached.syncedLyrics || null,
        source: 'cache',
        instrumental: cached.instrumental || false,
        cached: true,
      };
    }

    return null;
  } catch (error) {
    console.error('Error checking lyrics cache:', error);
    return null;
  }
}

/**
 * Save lyrics to cache
 */
async function saveToCache(
  artist: string,
  title: string,
  lyricsData: LyricsResponse,
  album?: string,
  duration?: number
): Promise<void> {
  try {
    await db.insert(lyricsCache).values({
      artist: artist.trim(),
      title: title.trim(),
      album: album?.trim(),
      duration: duration ? duration.toString() : null,
      lyrics: lyricsData.lyrics,
      syncedLyrics: lyricsData.syncedLyrics,
      source: lyricsData.source,
      instrumental: lyricsData.instrumental || false,
    }).onConflictDoNothing();
  } catch (error) {
    console.error('Error saving to lyrics cache:', error);
  }
}

async function getLyricsData(params: {
  artist: string;
  title: string;
  album?: string;
  duration?: number;
}): Promise<LyricsResponse> {
  const { artist, title, album, duration } = params;

  // Clean up artist and title
  const cleanTitle = title
    .replace(/\s*\(feat\..*?\)/gi, '')
    .replace(/\s*\[feat\..*?\]/gi, '')
    .replace(/\s*ft\..*$/gi, '')
    .replace(/\s*\(remix\)/gi, '')
    .replace(/\s*\[remix\]/gi, '')
    .trim();

  const cleanArtist = artist
    .replace(/\s*feat\..*$/gi, '')
    .replace(/\s*ft\..*$/gi, '')
    .trim();

  // 1. Check cache first
  const cached = await checkCache(cleanArtist, cleanTitle, album, duration);
  if (cached) {
    console.log(`✅ Lyrics cache HIT: ${cleanArtist} - ${cleanTitle}`);
    return cached;
  }

  console.log(`🔍 Lyrics cache MISS: ${cleanArtist} - ${cleanTitle}`);

  // 2. Try LRCLIB (Navidrome fetching happens client-side for now)
  const lrclibResult = await fetchFromLRCLIB(cleanArtist, cleanTitle, album, duration);

  if (lrclibResult) {
    // Cache the result
    await saveToCache(cleanArtist, cleanTitle, lrclibResult, album, duration);
    return lrclibResult;
  }

  // 3. No lyrics found - cache the miss to prevent repeated lookups
  const noLyricsResult: LyricsResponse = {
    lyrics: null,
    syncedLyrics: null,
    source: 'none',
  };

  await saveToCache(cleanArtist, cleanTitle, noLyricsResult, album, duration);
  return noLyricsResult;
}

const GET = async ({ request }: { request: Request }) => {
  try {
    const url = new URL(request.url);
    const artist = url.searchParams.get('artist');
    const title = url.searchParams.get('title');
    const album = url.searchParams.get('album') || undefined;
    const durationStr = url.searchParams.get('duration');
    const duration = durationStr ? parseFloat(durationStr) : undefined;

    if (!artist || !title) {
      return Response.json(
        { error: 'Missing required parameters: artist, title' },
        { status: 400 }
      );
    }

    const result = await getLyricsData({ artist, title, album, duration });
    return Response.json(result);
  } catch (error) {
    console.error('Lyrics API error:', error);
    return Response.json(
      { error: 'Failed to fetch lyrics' },
      { status: 500 }
    );
  }
};

export const Route = createFileRoute('/api/lyrics/')({
  server: {
    handlers: {
      GET,
    },
  },
});
