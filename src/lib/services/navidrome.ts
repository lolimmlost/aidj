import { getConfig } from '@/lib/config/config';
import { mobileOptimization } from '@/lib/performance/mobile-optimization';
import { ServiceError } from '../utils';

export type Artist = {
  id: string;
  name: string;
};

export type ArtistDetail = {
  id: string;
  name: string;
  albumCount: number;
  songCount: number;
  genres: string | null;
  fullText: string;
  orderArtistName: string;
  size: number;
  externalUrl?: string;
  externalInfoUpdatedAt?: string;
};

export type ArtistWithDetails = Artist & Omit<ArtistDetail, 'id' | 'name'>;

export interface RawSong {
  id: string;
  name: string;
  title?: string; // From search2 response
  artist?: string;
  albumId: string;
  artistId?: string;
  album?: string;
  path?: string;
  duration: number;
  track: number;
  trackNumber?: number; // From search2
}

interface SubsonicSearchResponse {
  searchResult: {
    song: SubsonicSong[];
  };
}

interface SubsonicTopSongsResponse {
  'subsonic-response'?: {
    topSongs: {
      song: SubsonicSong[];
    };
  };
  topSongs?: {
    song: SubsonicSong[];
  };
  song?: SubsonicSong[];
}

export interface SubsonicSong {
  id: string;
  title: string;
  artist: string;
  albumId: string;
  artistId?: string;
  album?: string;
  duration: string;
  track: string;
}

export interface NavidromePlaylist {
  id: string;
  name: string;
  songCount: number;
  duration: number; // seconds
  owner: string;
  public: boolean;
  created: string; // ISO timestamp
  changed: string; // ISO timestamp
}

export interface NavidromePlaylistWithSongs extends NavidromePlaylist {
  entry: SubsonicSong[]; // Array of songs in playlist
}

export type Album = {
  id: string;
  name: string;
  artistId: string;
  year?: number;
  artwork?: string;
};

export type Song = {
  id: string;
  name: string;
  artist?: string;
  albumId: string;
  duration: number;
  track: number;
  url: string;
  title?: string;
  artistId?: string;
  album?: string;
  trackNumber?: number;
  explicitContent?: 'true' | 'false' | boolean;
  discNumber?: string | number;
};


let token: string | null = null;
export { token };
let clientId: string | null = null;
export { clientId };
let subsonicToken: string | null = null;
export { subsonicToken };
let subsonicSalt: string | null = null;
export { subsonicSalt };
let tokenExpiry = 0;
export { tokenExpiry };

// Rate limiting
const requestQueue = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // Max 60 requests per minute (increased for better UX)

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  if (!requestQueue.has(key)) {
    requestQueue.set(key, [now]);
    return true;
  }

  const requests = requestQueue.get(key)!;
  // Remove old requests outside the window
  const validRequests = requests.filter(timestamp => timestamp > windowStart);

  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  validRequests.push(now);
  requestQueue.set(key, validRequests);
  return true;
}

export function resetAuthState() {
  token = null;
  clientId = null;
  subsonicToken = null;
  subsonicSalt = null;
  tokenExpiry = 0;
}

const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry

export async function getAuthToken(): Promise<string> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  const username = config.navidromeUsername;
  const password = config.navidromePassword;
  if (!username || !password) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome credentials incomplete');
  }

  const now = Date.now();
  if (token && now < tokenExpiry - TOKEN_REFRESH_THRESHOLD) {
    return token;
  }

  // Use adaptive timeout based on network conditions
  const adaptiveTimeout = mobileOptimization.getAdaptiveTimeout();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);

  try {
    const response = await fetch(`${config.navidromeUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response?.ok) {
      throw new ServiceError('NAVIDROME_AUTH_ERROR', `Login failed: ${response?.statusText ?? 'unknown error'}`);
    }

    const data = await response.json();
    if (!data.token || !data.id) {
      throw new ServiceError('NAVIDROME_AUTH_ERROR', 'No token or id received from login');
    }
    token = data.token as string;
    clientId = data.id as string;
    subsonicToken = data.subsonicToken as string;
    subsonicSalt = data.subsonicSalt as string;
    tokenExpiry = now + 3600 * 1000; // Assume 1 hour
    return token as string;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServiceError('NAVIDROME_TIMEOUT_ERROR', `Login request timed out (${adaptiveTimeout}ms)`);
    }
    throw new ServiceError('NAVIDROME_AUTH_ERROR', `Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Retry helper with exponential backoff for recoverable errors
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  isRetriable: (error: unknown) => boolean = () => true
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if error is not retriable
      if (!isRetriable(error)) {
        throw error;
      }

      // Don't retry if we've exhausted attempts
      if (attempt > maxRetries) {
        throw error;
      }

      // Exponential backoff: 500ms, 1000ms
      const delay = Math.pow(2, attempt - 1) * 500;
      console.log(`🔄 Navidrome retry attempt ${attempt}/${maxRetries + 1} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  let authRetries = 0;
  const maxAuthRetries = 1; // Retry once on 401

  while (authRetries <= maxAuthRetries) {
    const authToken = await getAuthToken();

    try {
      // Wrap the fetch with retry logic for network/timeout errors
      return await retryWithBackoff(
        async () => {
          // Use adaptive timeout based on network conditions
          const adaptiveTimeout = mobileOptimization.getAdaptiveTimeout();
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);

          try {
            const config = getConfig();
            const ndId = clientId;
            if (!ndId) {
              throw new ServiceError('NAVIDROME_CLIENT_ERROR', 'Client ID not available');
            }

            let url = `${config.navidromeUrl}${endpoint}`;
            let headers: Record<string, string> = {};
            if (options.headers) {
              if (options.headers instanceof Headers) {
                options.headers.forEach((value, key) => {
                  headers[key] = value;
                });
              } else if (typeof options.headers === 'object') {
                Object.assign(headers, options.headers);
              }
            }

            if (endpoint.startsWith('/rest/')) {
              // Subsonic API: use query params for auth
              const params = new URLSearchParams({
                u: ndId,
                t: subsonicToken || '',
                s: subsonicSalt || '',
                f: 'json',
                c: 'MusicApp',
              });
              if (url.includes('?')) {
                url += `&${params.toString()}`;
              } else {
                url += `?${params.toString()}`;
              }
            } else {
              // Native API: use headers
              headers = {
                'x-nd-authorization': `Bearer ${authToken}`,
                'x-nd-client-unique-id': ndId,
                ...headers,
              };
            }

            const response = await fetch(url, {
              ...options,
              headers,
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (response?.status === 401) {
              token = null; // Invalidate token
              clientId = null;
              authRetries++;
              // Throw special error to break out of retry loop and retry auth
              throw new ServiceError('NAVIDROME_AUTH_RETRY', 'Auth token expired, retrying with new token');
            }

            if (!response?.ok) {
              // 5xx errors are retriable, 4xx are not (except 401 handled above)
              const isRetriable = (response?.status ?? 0) >= 500;
              const error = new ServiceError(
                'NAVIDROME_API_ERROR',
                `API request failed: ${response?.status ?? 'unknown'} ${response?.statusText ?? 'unknown error'}`
              );
              (error as any).isRetriable = isRetriable;
              throw error;
            }

            if (!response) {
              throw new ServiceError('NAVIDROME_NETWORK_ERROR', 'No response received from server');
            }

            const contentType = response.headers?.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              return await response.json();
            }
            // Fallback: if no content-type header but response has json method, use it
            if (typeof response.json === 'function') {
              return await response.json();
            }
            // Final fallback to text if available
            if (typeof response.text === 'function') {
              return await response.text();
            }
            return response;
          } catch (error: unknown) {
            clearTimeout(timeoutId);

            // Timeout errors are retriable
            if (error instanceof Error && error.name === 'AbortError') {
              const timeoutError = new ServiceError('NAVIDROME_TIMEOUT_ERROR', `API request timed out (${adaptiveTimeout}ms limit)`);
              (timeoutError as any).isRetriable = true;
              throw timeoutError;
            }

            // Network errors are retriable
            if (error instanceof TypeError && error.message.includes('fetch')) {
              const networkError = new ServiceError('NAVIDROME_NETWORK_ERROR', 'Network request failed');
              (networkError as any).isRetriable = true;
              throw networkError;
            }

            throw error;
          }
        },
        2, // Max 2 retries
        (error) => {
          // Only retry if error is marked as retriable
          if (error instanceof ServiceError && error.code === 'NAVIDROME_AUTH_RETRY') {
            return false; // Don't retry auth errors here, handle in outer loop
          }
          return (error as any).isRetriable === true;
        }
      );
    } catch (error: unknown) {
      // If it's an auth retry error, continue the auth retry loop
      if (error instanceof ServiceError && error.code === 'NAVIDROME_AUTH_RETRY') {
        if (authRetries <= maxAuthRetries) {
          continue;
        }
      }

      // Otherwise, throw the error
      if (authRetries < maxAuthRetries && error instanceof ServiceError && error.code === 'NAVIDROME_API_ERROR') {
        authRetries++;
        continue;
      }

      throw error;
    }
  }

  throw new ServiceError('NAVIDROME_FETCH_ERROR', 'Max retries exceeded for API request');
}

export async function getArtists(start: number = 0, limit: number = 1000): Promise<Artist[]> {
  try {
    const endpoint = `/api/artist?_start=${start}&_end=${start + limit - 1}`;
    const data = await apiFetch(endpoint) as Artist[];
    return data || [];
  } catch (error) {
    console.error('Error fetching artists:', error);
    return [];
  }
}

export async function getArtistDetail(id: string): Promise<ArtistDetail> {
  try {
    const data = await apiFetch(`/api/artist/${id}`) as ArtistDetail;
    return data;
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch artist detail: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getArtistsWithDetails(start: number = 0, limit: number = 1000): Promise<ArtistWithDetails[]> {
  try {
    const basicArtists = await getArtists(start, limit);
    const detailedArtists = await Promise.all(
      basicArtists.map(async (artist) => {
        const detail = await getArtistDetail(artist.id);
        return { ...artist, ...detail };
      })
    );
    return detailedArtists;
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch artists with details: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getAlbums(artistId: string, start: number = 0, limit: number = 50): Promise<Album[]> {
  try {
    const data = await apiFetch(`/api/album?artist_id=${artistId}&_start=${start}&_end=${start + limit - 1}`) as Album[];
    return data || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch albums: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getSongs(albumId: string, start: number = 0, limit: number = 50): Promise<Song[]> {
  try {
    const data = await apiFetch(`/api/song?album_id=${albumId}&_start=${start}&_end=${start + limit - 1}`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Search for songs with prioritization logic:
 * 1. Search for albums with name containing the query
 * 2. If albums found, return all songs from those albums
 * 3. If no albums, search for artists with name containing the query
 * 4. If artists found, return top songs from those artists
 * 5. If no artists, fallback to Subsonic song search
 * 6. If Subsonic fails, fallback to native song search
 *
 * This ensures that searching for "uzi" will find albums/artists related to Uzi,
 * rather than just songs that happen to match the query.
 */
export async function search(query: string, start: number = 0, limit: number = 50): Promise<Song[]> {
  try {
    const config = getConfig();
    if (!config.navidromeUrl) {
      return [];
    }

    // Rate limiting check
    if (!checkRateLimit('search')) {
      console.warn('⚠️ Search rate limit reached, throttling request');
      throw new ServiceError('RATE_LIMIT_ERROR', 'Too many search requests. Please wait a moment.');
    }

    await getAuthToken(); // Ensure auth

    // Check cache first for mobile devices
    const cacheKey = `navidrome_search_${query}_${start}_${limit}`;
    const cached = mobileOptimization.getCache<Song[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Use mobile-optimized batched requests
    const qualitySettings = mobileOptimization.getQualitySettings();
    
    // For individual song lookup, prioritize direct song search first
    // Use Subsonic API for song search
    const songEndpoint = `/rest/search.view?query=${encodeURIComponent(query)}&songCount=${limit}&artistCount=0&albumCount=0&offset=${start}`;
    console.log('Searching songs with Subsonic endpoint:', songEndpoint);

    let songs: Song[] = [];
    
    try {
      const response = await apiFetch(songEndpoint) as SubsonicSearchResponse;
      if (response.searchResult?.song && response.searchResult.song.length > 0) {
        console.log('🔍 Search API response (first song):', response.searchResult.song[0]);
        songs = response.searchResult.song.map((song: SubsonicSong) => {
          const mappedSong = {
            id: song.id,
            name: song.title,
            title: song.title,
            artist: song.artist || 'Unknown Artist',
            albumId: song.albumId,
            artistId: song.artistId,
            album: song.album,
            duration: Math.floor(parseFloat(song.duration) || 0),
            track: parseInt(song.track) || 0,
            trackNumber: parseInt(song.track) || 0,
            url: `/api/navidrome/stream/${song.id}`,
          };
          console.log('🎵 Mapped song:', { name: mappedSong.name, artist: mappedSong.artist, duration: mappedSong.duration });
          return mappedSong;
        });
      }
    } catch (error) {
      console.log('Direct song search failed:', error);
    }

    // If no direct song matches, try album search with batching for mobile
    if (songs.length === 0) {
      try {
        const albumEndpoint = `/api/album?name=${encodeURIComponent(query)}&_start=0&_end=${Math.min(10, qualitySettings.preloadCount)}`;
        const albums = await apiFetch(albumEndpoint) as Album[];
        if (albums && albums.length > 0) {
          // Get songs for each album with mobile-optimized batching
          const albumSongs = await mobileOptimization.batchRequests(
            albums.map(album => () => getSongs(album.id, 0, 50)),
            qualitySettings.concurrentRequests
          );
          songs = albumSongs.flat().slice(start, start + limit);
        }
      } catch (albumError) {
        console.log('Album search failed, trying artist search:', albumError);
      }
    }

    // Finally, try artist search with batching for mobile
    if (songs.length === 0) {
      try {
        const artistEndpoint = `/api/artist?name=${encodeURIComponent(query)}&_start=0&_end=${Math.min(4, qualitySettings.preloadCount)}`;
        const artists = await apiFetch(artistEndpoint) as Artist[];
        if (artists && artists.length > 0) {
          // Get top songs for each artist with mobile-optimized batching
          const artistSongs = await mobileOptimization.batchRequests(
            artists.map(artist => () => getTopSongs(artist.id, 10)),
            qualitySettings.concurrentRequests
          );
          songs = artistSongs.flat().slice(start, start + limit);
        }
      } catch (artistError) {
        console.log('Artist search failed:', artistError);
      }
    }

    // Cache the result for mobile devices
    mobileOptimization.setCache(cacheKey, songs, 300000);

    // If no songs found anywhere, return empty array
    return songs;

  } catch (error) {
    console.error('Search error:', error);
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to search music: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getTopSongs(artistId: string, count: number = 10): Promise<Song[]> {
  try {
    const endpoint = `/rest/getTopSongs?artistId=${artistId}&count=${count}`;
    const data = await apiFetch(endpoint) as SubsonicTopSongsResponse;
    // Handle Subsonic JSON response structure
    const topSongs = data['subsonic-response']?.topSongs?.song || data.topSongs?.song || data.song || [];
    const songs = topSongs.map((song: SubsonicSong) => ({
      id: song.id,
      name: song.title || 'Unknown Title',
      title: song.title,
      artist: song.artist || 'Unknown Artist',
      albumId: song.albumId,
      artistId: song.artistId,
      album: song.album,
      duration: parseInt(song.duration) || 0,
      track: parseInt(song.track) || 1,
      trackNumber: parseInt(song.track) || 1,
      url: `/api/navidrome/stream/${song.id}`,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch top songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getSongsGlobal(start: number = 0, limit: number = 50): Promise<Song[]> {
  try {
    const data = await apiFetch(`/api/song?_start=${start}&_end=${start + limit - 1}`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch global songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export interface LibrarySummary {
  artists: Array<{ name: string; genres: string }>;
  songs: string[];
}

export async function getLibrarySummary(): Promise<LibrarySummary> {
  try {
    const topArtists = await getArtistsWithDetails(0, 15); // Increased to 15 for more variety
    const topSongs = await getSongsGlobal(0, 10); // Increased to 10 for more variety
    console.log(`📚 Library summary: ${topArtists.length} artists, ${topSongs.length} songs`);
    return {
      artists: topArtists.map(a => ({
        name: a.name,
        genres: a.genres || 'Unknown'
      })),
      songs: topSongs.map(s => s.name),
    };
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch library summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Resolve a song by parsing "Artist - Title" format
 * Searches for songs by the artist with matching title
 */
export async function resolveSongByArtistTitle(artistTitle: string): Promise<Song | null> {
  try {
    const match = artistTitle.match(/^(.+?)\s*-\s*(.+)$/);
    if (!match) {
      // Not in "Artist - Title" format, fallback to general search
      const songs = await search(artistTitle, 0, 1);
      return songs[0] || null;
    }

    const artistName = match[1].trim();
    const songTitle = match[2].trim();

    // First, find the artist
    const artists = await getArtistsWithDetails(0, 100); // Get more artists
    const artist = artists.find(a => a.name.toLowerCase() === artistName.toLowerCase());
    if (!artist) {
      // Artist not found, fallback to general search
      const songs = await search(artistTitle, 0, 1);
      return songs[0] || null;
    }

    // Get artist's albums
    const albums = await getAlbums(artist.id, 0, 50);
    for (const album of albums) {
      try {
        const songs = await getSongs(album.id, 0, 50);
        const song = songs.find(s => s.title?.toLowerCase() === songTitle.toLowerCase() || (s.name && s.name.toLowerCase() === songTitle.toLowerCase()));
        if (song) {
          return song;
        }
      } catch (error) {
        console.log(`Failed to get songs for album ${album.id}:`, error);
      }
    }

    // Song not found in albums, fallback to general search
    const songs = await search(songTitle, 0, 5);
    const song = songs.find(s => s.artist?.toLowerCase() === artistName.toLowerCase());
    return song || null;
  } catch (error) {
    console.error('Error resolving song by artist-title:', error);
    return null;
  }
}

/**
 * Star a song in Navidrome (mark as "loved")
 * Uses Subsonic API star endpoint
 */
export async function starSong(songId: string): Promise<void> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  if (!subsonicToken || !subsonicSalt) {
    // Ensure we have Subsonic auth tokens
    await getAuthToken();
  }

  try {
    const url = new URL(`${config.navidromeUrl}/rest/star`);
    url.searchParams.append('u', config.navidromeUsername || '');
    url.searchParams.append('t', subsonicToken || '');
    url.searchParams.append('s', subsonicSalt || '');
    url.searchParams.append('v', '1.16.1');
    url.searchParams.append('c', 'aidj');
    url.searchParams.append('f', 'json');
    url.searchParams.append('id', songId);

    const response = await fetch(url.toString(), {
      method: 'GET',
    });

    if (!response?.ok) {
      throw new ServiceError('NAVIDROME_API_ERROR', `Failed to star song: ${response?.statusText ?? 'unknown error'}`);
    }

    const data = await response.json();
    if (data?.['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data?.['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    console.log(`⭐ Starred song ${songId} in Navidrome`);
  } catch (error) {
    console.error('Failed to star song in Navidrome:', error);
    throw error instanceof ServiceError ? error : new ServiceError('NAVIDROME_API_ERROR', `Failed to star song: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Unstar a song in Navidrome (remove "loved" flag)
 * Uses Subsonic API unstar endpoint
 */
export async function unstarSong(songId: string): Promise<void> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  if (!subsonicToken || !subsonicSalt) {
    // Ensure we have Subsonic auth tokens
    await getAuthToken();
  }

  try {
    const url = new URL(`${config.navidromeUrl}/rest/unstar`);
    url.searchParams.append('u', config.navidromeUsername || '');
    url.searchParams.append('t', subsonicToken || '');
    url.searchParams.append('s', subsonicSalt || '');
    url.searchParams.append('v', '1.16.1');
    url.searchParams.append('c', 'aidj');
    url.searchParams.append('f', 'json');
    url.searchParams.append('id', songId);

    const response = await fetch(url.toString(), {
      method: 'GET',
    });

    if (!response?.ok) {
      throw new ServiceError('NAVIDROME_API_ERROR', `Failed to unstar song: ${response?.statusText ?? 'unknown error'}`);
    }

    const data = await response.json();
    if (data?.['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data?.['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    console.log(`⭐ Unstarred song ${songId} in Navidrome`);
  } catch (error) {
    console.error('Failed to unstar song in Navidrome:', error);
    throw error instanceof ServiceError ? error : new ServiceError('NAVIDROME_API_ERROR', `Failed to unstar song: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get starred (favorited/loved) songs from Navidrome
 * Uses Subsonic API getStarred2 endpoint
 */
export async function getStarredSongs(): Promise<SubsonicSong[]> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  if (!subsonicToken || !subsonicSalt) {
    // Ensure we have Subsonic auth tokens
    await getAuthToken();
  }

  try {
    const url = new URL(`${config.navidromeUrl}/rest/getStarred2`);
    url.searchParams.append('u', config.navidromeUsername || '');
    url.searchParams.append('t', subsonicToken || '');
    url.searchParams.append('s', subsonicSalt || '');
    url.searchParams.append('v', '1.16.1');
    url.searchParams.append('c', 'aidj');
    url.searchParams.append('f', 'json');

    const response = await fetch(url.toString(), {
      method: 'GET',
    });

    if (!response?.ok) {
      throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch starred songs: ${response?.statusText ?? 'unknown error'}`);
    }

    const data = await response.json();
    if (data?.['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data?.['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    const starredSongs = data['subsonic-response']?.starred2?.song || [];
    console.log(`⭐ Fetched ${starredSongs.length} starred songs from Navidrome`);

    // Map to SubsonicSong format
    return starredSongs.map((song: any) => ({
      id: song.id,
      title: song.title || song.name || '',
      artist: song.artist || '',
      album: song.album || '',
      albumId: song.albumId || '',
      duration: song.duration?.toString() || '0',
      track: song.track?.toString() || '0',
    }));
  } catch (error) {
    console.error('Failed to fetch starred songs from Navidrome:', error);
    throw error instanceof ServiceError ? error : new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch starred songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Scrobble a song play in Navidrome (register play count)
 * Uses Subsonic API scrobble endpoint
 *
 * @param songId - The Navidrome song ID
 * @param submission - If true, registers a play. If false, updates "now playing" status
 * @param time - Optional timestamp (defaults to now)
 */
export async function scrobbleSong(songId: string, submission: boolean = true, time?: Date): Promise<void> {
  const config = getConfig();
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  if (!subsonicToken || !subsonicSalt) {
    // Ensure we have Subsonic auth tokens
    await getAuthToken();
  }

  try {
    const url = new URL(`${config.navidromeUrl}/rest/scrobble`);
    url.searchParams.append('u', config.navidromeUsername || '');
    url.searchParams.append('t', subsonicToken || '');
    url.searchParams.append('s', subsonicSalt || '');
    url.searchParams.append('v', '1.16.1');
    url.searchParams.append('c', 'aidj');
    url.searchParams.append('f', 'json');
    url.searchParams.append('id', songId);
    url.searchParams.append('submission', submission.toString());

    if (time) {
      // Subsonic expects time in milliseconds since epoch
      url.searchParams.append('time', time.getTime().toString());
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
    });

    if (!response?.ok) {
      throw new ServiceError('NAVIDROME_API_ERROR', `Failed to scrobble song: ${response?.statusText ?? 'unknown error'}`);
    }

    const data = await response.json();
    if (data?.['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data?.['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    if (submission) {
      console.log(`🎵 Scrobbled song ${songId} in Navidrome (play count updated)`);
    } else {
      console.log(`▶️ Updated now playing status for song ${songId} in Navidrome`);
    }
  } catch (error) {
    console.error('Failed to scrobble song in Navidrome:', error);
    // Don't throw error - scrobbling should fail silently to not disrupt playback
    // Just log for debugging
  }
}

/**
 * Check if Navidrome server is available
 * Returns true if connection successful, false if unavailable
 */
export async function checkNavidromeConnectivity(): Promise<boolean> {
  try {
    // Use ping endpoint with minimal timeout to check connectivity
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout for health check

    try {
      const config = getConfig();
      const response = await fetch(`${config.navidromeUrl}/rest/ping?v=1.16.1&c=MusicApp&f=json`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      return response.ok;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Get all playlists for the authenticated user
 * Uses Subsonic API getPlaylists endpoint
 */
export async function getPlaylists(): Promise<NavidromePlaylist[]> {
  try {
    const endpoint = `/rest/getPlaylists`;
    const data = await apiFetch(endpoint) as any;

    // Handle Subsonic response structure
    const playlists = data['subsonic-response']?.playlists?.playlist || data.playlists?.playlist || [];
    console.log(`📋 Fetched ${playlists.length} playlists from Navidrome`);
    return playlists as NavidromePlaylist[];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch playlists: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get a single playlist with all its songs
 * Uses Subsonic API getPlaylist endpoint
 */
export async function getPlaylist(id: string): Promise<NavidromePlaylistWithSongs> {
  try {
    const endpoint = `/rest/getPlaylist?id=${encodeURIComponent(id)}`;
    const data = await apiFetch(endpoint) as any;

    // Handle Subsonic response structure
    const playlist = data['subsonic-response']?.playlist || data.playlist;
    if (!playlist) {
      throw new ServiceError('NAVIDROME_API_ERROR', `Playlist not found: ${id}`);
    }

    console.log(`📋 Fetched playlist "${playlist.name}" with ${playlist.songCount} songs`);
    return playlist as NavidromePlaylistWithSongs;
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a new playlist in Navidrome
 * Uses Subsonic API createPlaylist endpoint
 */
export async function createPlaylist(name: string, songIds?: string[]): Promise<NavidromePlaylist> {
  try {
    let endpoint = `/rest/createPlaylist?name=${encodeURIComponent(name)}`;

    // Add song IDs if provided
    if (songIds && songIds.length > 0) {
      songIds.forEach(id => {
        endpoint += `&songId=${encodeURIComponent(id)}`;
      });
    }

    const data = await apiFetch(endpoint, { method: 'POST' }) as any;

    // Handle Subsonic response structure
    const playlist = data['subsonic-response']?.playlist || data.playlist;
    if (!playlist) {
      throw new ServiceError('NAVIDROME_API_ERROR', 'Failed to create playlist: no response data');
    }

    console.log(`✅ Created playlist "${name}" with ${songIds?.length || 0} songs`);
    return playlist as NavidromePlaylist;
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to create playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update an existing playlist (name and/or songs)
 * Uses Subsonic API updatePlaylist endpoint
 */
export async function updatePlaylist(id: string, name?: string, songIds?: string[]): Promise<void> {
  try {
    let endpoint = `/rest/updatePlaylist?playlistId=${encodeURIComponent(id)}`;

    if (name) {
      endpoint += `&name=${encodeURIComponent(name)}`;
    }

    // Add song IDs if provided (replaces all songs in playlist)
    if (songIds && songIds.length > 0) {
      songIds.forEach(songId => {
        endpoint += `&songIdToAdd=${encodeURIComponent(songId)}`;
      });
    }

    const data = await apiFetch(endpoint, { method: 'POST' }) as any;

    // Check for Subsonic response status
    if (data['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    console.log(`✅ Updated playlist ${id}`);
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to update playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete a playlist from Navidrome
 * Uses Subsonic API deletePlaylist endpoint
 */
export async function deletePlaylist(id: string): Promise<void> {
  try {
    const endpoint = `/rest/deletePlaylist?id=${encodeURIComponent(id)}`;
    const data = await apiFetch(endpoint, { method: 'POST' }) as any;

    // Check for Subsonic response status
    if (data['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    console.log(`🗑️ Deleted playlist ${id}`);
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to delete playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Search for songs matching smart playlist criteria
 * Uses Navidrome's search API to find songs by genre, year, artist, etc.
 */
/**
 * Get similar songs for a given song ID (recommendations)
 * Uses Subsonic API getSimilarSongs endpoint with Last.fm data
 */
export async function getSimilarSongs(songId: string, count: number = 50): Promise<SubsonicSong[]> {
  try {
    const endpoint = `/rest/getSimilarSongs?id=${encodeURIComponent(songId)}&count=${count}`;
    const data = await apiFetch(endpoint) as any;
    const songs = data['subsonic-response']?.similarSongs?.song || data.similarSongs?.song || [];
    console.log(`🎵 Found ${songs.length} similar songs for ${songId}`);
    return songs as SubsonicSong[];
  } catch (error) {
    console.warn('Failed to get similar songs:', error);
    return [];
  }
}

export async function searchSongsByCriteria(criteria: {
  genre?: string[];
  yearFrom?: number;
  yearTo?: number;
  artists?: string[];
  rating?: number;
  recentlyAdded?: '7d' | '30d' | '90d';
}, limit: number = 100): Promise<SubsonicSong[]> {
  try {
    const matchedSongs: SubsonicSong[] = [];
    const seedSongIds: string[] = [];

    console.log('🎯 Smart Playlist Criteria:', JSON.stringify(criteria, null, 2));

    // Strategy 1: If artists specified, find seed songs and get recommendations
    if (criteria.artists && criteria.artists.length > 0) {
      console.log('🎨 Building recommendations from seed artists:', criteria.artists);

      for (const artistName of criteria.artists) {
        try {
          // First, get the actual artist's songs
          console.log(`🔍 Searching for artist: ${artistName}`);
          const artistSongs = await search(artistName, 0, 20);
          console.log(`📝 Found ${artistSongs.length} songs for ${artistName}`);

          // Add the artist's own songs first
          matchedSongs.push(...artistSongs.map(song => ({
            id: song.id,
            title: song.name || song.title || '',
            artist: song.artist || '',
            albumId: song.albumId,
            album: '',
            duration: (song.duration || 0).toString(),
            track: (song.track || 0).toString(),
          } as SubsonicSong)));

          // Then try to get similar songs for variety
          seedSongIds.push(...artistSongs.slice(0, 3).map(s => s.id));
        } catch (error) {
          console.warn(`Failed to find songs for artist ${artistName}:`, error);
        }
      }

      // Get similar songs for each seed (recommendations)
      console.log(`🎵 Getting recommendations from ${seedSongIds.length} seed songs...`);
      for (const seedId of seedSongIds.slice(0, 5)) {
        try {
          const similar = await getSimilarSongs(seedId, 20);
          if (similar.length > 0) {
            console.log(`🎯 Got ${similar.length} similar songs`);
            matchedSongs.push(...similar);
          } else {
            console.log(`⚠️ No similar songs found (Last.fm might not be configured)`);
          }
        } catch (error) {
          console.warn(`Failed to get similar songs:`, error);
        }
      }
    }

    // Strategy 2: For genre searches, try multiple approaches
    if (criteria.genre && criteria.genre.length > 0 && matchedSongs.length < limit) {
      console.log('🎼 Searching for songs in genres:', criteria.genre);

      for (const genre of criteria.genre) {
        try {
          // Approach 1: Try getAlbumList2 with byGenre (requires genre tags)
          const genreEndpoint = `/rest/getAlbumList2?type=byGenre&genre=${encodeURIComponent(genre)}&size=50`;
          console.log(`🔍 Trying genre filter: ${genreEndpoint}`);
          const genreData = await apiFetch(genreEndpoint) as any;
          const genreAlbums = genreData['subsonic-response']?.albumList2?.album || genreData.albumList2?.album || [];

          console.log(`📀 Found ${genreAlbums.length} albums with genre tag "${genre}"`);

          if (genreAlbums.length > 0) {
            // Genre tags exist! Use them
            const shuffled = genreAlbums.sort(() => Math.random() - 0.5);
            const albumsToSample = Math.min(20, shuffled.length);

            for (const album of shuffled.slice(0, albumsToSample)) {
              try {
                const albumSongs = await getSongs(album.id, 0, 50);
                const songsPerAlbum = Math.min(5, Math.ceil(limit / albumsToSample));
                const randomFromAlbum = albumSongs
                  .sort(() => Math.random() - 0.5)
                  .slice(0, songsPerAlbum);

                matchedSongs.push(...randomFromAlbum.map(song => ({
                  id: song.id,
                  title: song.name || song.title || '',
                  artist: song.artist || '',
                  albumId: song.albumId,
                  album: album.name,
                  duration: (song.duration || 0).toString(),
                  track: (song.track || 0).toString(),
                } as SubsonicSong)));

                if (matchedSongs.length >= limit) break;
              } catch (error) {
                console.warn(`Failed to get songs for album ${album.id}:`, error);
              }
            }
          } else {
            // Approach 2: No genre tags - use random albums instead
            console.log(`⚠️ No genre tags found. Getting random recent albums instead...`);
            const randomEndpoint = `/rest/getAlbumList2?type=random&size=30`;
            const randomData = await apiFetch(randomEndpoint) as any;
            const randomAlbums = randomData['subsonic-response']?.albumList2?.album || randomData.albumList2?.album || [];

            console.log(`🎲 Got ${randomAlbums.length} random albums`);

            // Get songs from random albums with variety
            for (const album of randomAlbums.slice(0, 20)) {
              try {
                const albumSongs = await getSongs(album.id, 0, 50);
                // Take fewer songs per album for more artist diversity
                const songsToTake = Math.min(3, albumSongs.length);
                const randomFromAlbum = albumSongs
                  .sort(() => Math.random() - 0.5)
                  .slice(0, songsToTake);

                matchedSongs.push(...randomFromAlbum.map(song => ({
                  id: song.id,
                  title: song.name || song.title || '',
                  artist: song.artist || '',
                  albumId: song.albumId,
                  album: album.name,
                  duration: (song.duration || 0).toString(),
                  track: (song.track || 0).toString(),
                } as SubsonicSong)));

                if (matchedSongs.length >= limit) break;
              } catch (error) {
                console.warn(`Failed to get songs for album:`, error);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to search for genre ${genre}:`, error);
        }
      }
    }

    // Fallback: If we still have no songs, try getting from global song list
    if (matchedSongs.length === 0) {
      console.log('⚠️ No songs found with criteria, falling back to global library...');
      try {
        const globalSongs = await getSongsGlobal(0, limit);
        console.log(`📚 Retrieved ${globalSongs.length} songs from global library`);
        matchedSongs.push(...globalSongs.map(song => ({
          id: song.id,
          title: song.name || song.title || '',
          artist: song.artist || '',
          albumId: song.albumId,
          album: '',
          duration: (song.duration || 0).toString(),
          track: (song.track || 0).toString(),
        } as SubsonicSong)));
      } catch (error) {
        console.error('Failed to get global songs:', error);
        throw new ServiceError('NAVIDROME_API_ERROR', 'No songs found in your library. Please check your Navidrome configuration and library scan.');
      }
    }

    // Remove duplicates
    const uniqueSongs = Array.from(
      new Map(matchedSongs.map(song => [song.id, song])).values()
    );

    console.log(`📊 Total songs before filtering: ${uniqueSongs.length}`);

    // Ensure artist diversity by limiting songs per artist
    const songsByArtist = new Map<string, SubsonicSong[]>();
    for (const song of uniqueSongs) {
      const artist = song.artist || 'Unknown';
      if (!songsByArtist.has(artist)) {
        songsByArtist.set(artist, []);
      }
      songsByArtist.get(artist)!.push(song);
    }

    console.log(`🎤 Found ${songsByArtist.size} unique artists`);

    // Take max 10 songs per artist for variety
    const diverseSongs: SubsonicSong[] = [];
    for (const [artist, songs] of songsByArtist.entries()) {
      const shuffled = songs.sort(() => Math.random() - 0.5);
      const maxPerArtist = 10;
      diverseSongs.push(...shuffled.slice(0, maxPerArtist));
      if (songs.length > maxPerArtist) {
        console.log(`  🎵 Limited ${artist} from ${songs.length} to ${maxPerArtist} songs`);
      }
    }

    // Shuffle final playlist
    const shuffled = diverseSongs.sort(() => Math.random() - 0.5);
    console.log(`✅ Created playlist with ${shuffled.length} diverse songs from ${songsByArtist.size} artists`);

    return shuffled.slice(0, limit);
  } catch (error) {
    console.error('Failed to search songs by criteria:', error);
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to search songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Add songs to an existing playlist
 * Uses Subsonic API updatePlaylist endpoint with songIdToAdd parameter
 */
export async function addSongsToPlaylist(playlistId: string, songIds: string[]): Promise<void> {
  try {
    let endpoint = `/rest/updatePlaylist?playlistId=${encodeURIComponent(playlistId)}`;

    songIds.forEach(songId => {
      endpoint += `&songIdToAdd=${encodeURIComponent(songId)}`;
    });

    const data = await apiFetch(endpoint, { method: 'POST' }) as any;

    // Check for Subsonic response status
    if (data['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    console.log(`➕ Added ${songIds.length} songs to playlist ${playlistId}`);
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to add songs to playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}