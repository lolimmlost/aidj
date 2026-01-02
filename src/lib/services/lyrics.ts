/**
 * Lyrics Service
 * Fetches lyrics from multiple sources:
 * 1. Navidrome (embedded lyrics in files)
 * 2. LRCLIB (free synced lyrics API)
 */

export interface LyricLine {
  time: number; // Time in seconds
  text: string;
}

export interface LyricsResponse {
  lyrics: string | null; // Plain lyrics text
  syncedLyrics: LyricLine[] | null; // Parsed synced lyrics
  source: 'navidrome' | 'lrclib' | 'none';
  instrumental?: boolean;
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
 * Fetch lyrics from Navidrome using Subsonic API
 */
async function fetchFromNavidrome(
  artist: string,
  title: string,
  songId?: string
): Promise<LyricsResponse | null> {
  try {
    // Try getLyricsBySongId first (OpenSubsonic extension) if we have songId
    if (songId) {
      const response = await fetch(
        `/api/navidrome/rest/getLyricsBySongId?id=${encodeURIComponent(songId)}`
      );

      if (response.ok) {
        const data = await response.json();
        const lyricsData = data?.['subsonic-response']?.lyricsList?.structuredLyrics;

        if (lyricsData && lyricsData.length > 0) {
          // Prefer synced lyrics if available
          const syncedLyrics = lyricsData.find((l: { synced: boolean }) => l.synced);
          const plainLyrics = lyricsData.find((l: { synced: boolean }) => !l.synced);

          if (syncedLyrics?.line) {
            const lines: LyricLine[] = syncedLyrics.line.map((l: { start: number; value: string }) => ({
              time: l.start / 1000, // Convert ms to seconds
              text: l.value,
            }));
            return {
              lyrics: lines.map(l => l.text).join('\n'),
              syncedLyrics: lines,
              source: 'navidrome',
            };
          }

          if (plainLyrics?.line) {
            const text = plainLyrics.line.map((l: { value: string }) => l.value).join('\n');
            return {
              lyrics: text,
              syncedLyrics: null,
              source: 'navidrome',
            };
          }
        }
      }
    }

    // Fallback to getLyrics (original Subsonic API)
    const response = await fetch(
      `/api/navidrome/rest/getLyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`
    );

    if (response.ok) {
      const data = await response.json();
      const lyrics = data?.['subsonic-response']?.lyrics;

      if (lyrics?.value) {
        // Check if it's LRC format
        if (lyrics.value.includes('[') && /\[\d{2}:\d{2}/.test(lyrics.value)) {
          const parsed = parseLRC(lyrics.value);
          return {
            lyrics: parsed.map(l => l.text).join('\n'),
            syncedLyrics: parsed,
            source: 'navidrome',
          };
        }

        return {
          lyrics: lyrics.value,
          syncedLyrics: null,
          source: 'navidrome',
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching lyrics from Navidrome:', error);
    return null;
  }
}

/**
 * Fetch lyrics from LRCLIB
 * API docs: https://lrclib.net/docs
 */
async function fetchFromLRCLIB(
  artist: string,
  title: string,
  album?: string,
  duration?: number
): Promise<LyricsResponse | null> {
  try {
    // Build query parameters
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
    });

    if (album) {
      params.set('album_name', album);
    }

    if (duration && duration > 0) {
      params.set('duration', Math.round(duration).toString());
    }

    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: {
        'User-Agent': 'AIDJ/1.0 (https://github.com/aidj)',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // No lyrics found
      }
      throw new Error(`LRCLIB API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.instrumental) {
      return {
        lyrics: null,
        syncedLyrics: null,
        source: 'lrclib',
        instrumental: true,
      };
    }

    // Prefer synced lyrics
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

    return null;
  } catch (error) {
    console.error('Error fetching lyrics from LRCLIB:', error);
    return null;
  }
}

/**
 * Get lyrics for a song, trying multiple sources
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
  // Clean up title (remove feat., remix info, etc. for better matching)
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

  // Try Navidrome first (local/embedded lyrics)
  const navidromeResult = await fetchFromNavidrome(cleanArtist, cleanTitle, options?.songId);
  if (navidromeResult && (navidromeResult.lyrics || navidromeResult.syncedLyrics)) {
    return navidromeResult;
  }

  // Try our API which fetches from LRCLIB with server-side caching
  const apiResult = await fetchFromAPI(
    cleanArtist,
    cleanTitle,
    options?.album,
    options?.duration
  );
  if (apiResult) {
    return apiResult;
  }

  // No lyrics found
  return {
    lyrics: null,
    syncedLyrics: null,
    source: 'none',
  };
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
 * Fetch lyrics from our API (which uses server-side caching)
 */
async function fetchFromAPI(
  artist: string,
  title: string,
  album?: string,
  duration?: number
): Promise<LyricsResponse | null> {
  try {
    const params = new URLSearchParams({
      artist,
      title,
    });

    if (album) params.set('album', album);
    if (duration) params.set('duration', duration.toString());

    const response = await fetch(`/api/lyrics?${params.toString()}`);

    if (!response.ok) {
      console.error('Lyrics API error:', response.status);
      return null;
    }

    const data = await response.json();
    return data as LyricsResponse;
  } catch (error) {
    console.error('Error fetching lyrics from API:', error);
    return null;
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
