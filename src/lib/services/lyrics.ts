/**
 * Lyrics Service
 *
 * All lyrics fetching is routed through the server API endpoint which handles:
 * 1. DB cache lookup (30 days)
 * 2. Navidrome embedded lyrics (via songId or artist/title)
 * 3. LRCLIB external API
 */

export interface LyricLine {
  time: number; // Time in seconds
  text: string;
}

export interface LyricsResponse {
  lyrics: string | null; // Plain lyrics text
  syncedLyrics: LyricLine[] | null; // Parsed synced lyrics
  source: 'navidrome' | 'lrclib' | 'none' | 'cache';
  instrumental?: boolean;
  cached?: boolean;
}

/**
 * Parse LRC format lyrics into structured data
 * LRC format: [mm:ss.xx]Lyrics text
 */
export function parseLRC(lrcText: string): LyricLine[] {
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

  // Sort by time
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/**
 * Get lyrics for a song — routes all requests through the server API
 * which handles Navidrome + LRCLIB + DB caching.
 */
export async function getLyrics(
  artist: string,
  title: string,
  options?: {
    songId?: string;
    album?: string;
    duration?: number;
  }
): Promise<LyricsResponse> {
  try {
    const params = new URLSearchParams({
      artist,
      title,
    });

    if (options?.songId) params.set('songId', options.songId);
    if (options?.album) params.set('album', options.album);
    if (options?.duration) params.set('duration', options.duration.toString());

    const response = await fetch(`/api/lyrics?${params.toString()}`);

    if (!response.ok) {
      console.error('Lyrics API error:', response.status);
      return { lyrics: null, syncedLyrics: null, source: 'none' };
    }

    return await response.json() as LyricsResponse;
  } catch (error) {
    console.error('Error fetching lyrics:', error);
    return { lyrics: null, syncedLyrics: null, source: 'none' };
  }
}

/**
 * Get the current lyric line index based on playback time
 */
export function getCurrentLineIndex(
  syncedLyrics: LyricLine[],
  currentTime: number
): number {
  if (!syncedLyrics || syncedLyrics.length === 0) return -1;

  // Find the last line that has started
  for (let i = syncedLyrics.length - 1; i >= 0; i--) {
    if (syncedLyrics[i].time <= currentTime) {
      return i;
    }
  }

  return -1;
}

/**
 * LRCLIB search result type
 */
export interface LRCLIBSearchResult {
  id: number;
  name: string; // Track name
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/**
 * Search LRCLIB for lyrics
 * API docs: https://lrclib.net/docs
 */
export async function searchLRCLIB(query: string): Promise<LRCLIBSearchResult[]> {
  try {
    const response = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'AIDJ/1.0 (https://github.com/aidj)',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`LRCLIB search error: ${response.status}`);
    }

    const data = await response.json();
    return data as LRCLIBSearchResult[];
  } catch (error) {
    console.error('Error searching LRCLIB:', error);
    return [];
  }
}

/**
 * Convert LRCLIB result to LRC format string
 */
export function lrclibResultToLRC(result: LRCLIBSearchResult): string {
  if (result.syncedLyrics) {
    return result.syncedLyrics;
  }
  return result.plainLyrics || '';
}
