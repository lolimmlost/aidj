import { getConfig } from '@/lib/config/config';
import { mobileOptimization } from '@/lib/performance/mobile-optimization';
import { ServiceError } from '../utils';

// Pure JS MD5 implementation for Subsonic API auth (cross-platform compatible)
function md5Pure(string: string): string {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];

    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }

  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | ((~b) & d), a, b, x, s, t);
  }

  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & (~d)), a, b, x, s, t);
  }

  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | (~d)), a, b, x, s, t);
  }

  function md51(s: string) {
    const n = s.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    let i: number;
    for (i = 64; i <= s.length; i += 64) {
      md5cycle(state, md5blk(s.substring(i - 64, i)));
    }
    s = s.substring(i - 64);
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++)
      tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) {
      md5cycle(state, tail);
      for (i = 0; i < 16; i++) tail[i] = 0;
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }

  function md5blk(s: string) {
    const md5blks = [];
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }

  const hex_chr = '0123456789abcdef'.split('');

  function rhex(n: number) {
    let s = '';
    for (let j = 0; j < 4; j++)
      s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
    return s;
  }

  function hex(x: number[]) {
    return x.map(rhex).join('');
  }

  function add32(a: number, b: number) {
    return (a + b) & 0xFFFFFFFF;
  }

  return hex(md51(string));
}

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
  genre?: string; // Genre tag from Navidrome
  genres?: Array<{ id: string; name: string }>; // Multi-genre from Navidrome native API
  year?: number;
  playCount?: number;
  rating?: number;
  starred?: boolean; // Navidrome's "loved" field
}

/**
 * Generic Subsonic API response wrapper
 * All Subsonic API responses are wrapped in 'subsonic-response' with dynamic properties
 * Uses index signature with permissive value type to allow deep property access on API responses
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface SubsonicApiResponse extends Record<string, SubsonicApiValue> {
  'subsonic-response'?: SubsonicApiObject & {
    status?: string;
    error?: { message?: string };
  };
}

/** Value type for deeply-nested Subsonic API JSON objects */
type SubsonicApiValue = string | number | boolean | null | undefined | SubsonicApiObject | SubsonicApiValue[];
interface SubsonicApiObject { [key: string]: SubsonicApiValue }

interface SubsonicSearchResponse {
  // Subsonic API wraps everything in 'subsonic-response'
  'subsonic-response'?: {
    searchResult3?: {
      song?: SubsonicSong[];
    };
    searchResult?: {
      song?: SubsonicSong[];
    };
  };
  // Direct response (without wrapper, for compatibility)
  searchResult3?: {
    song?: SubsonicSong[];
  };
  searchResult?: {
    song?: SubsonicSong[];
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
  genre?: string;
  year?: number;
  playCount?: number;
  rating?: number;
  loved?: boolean;
  bitrate?: number;
  // DJ-related metadata (from ID3 tags if available)
  bpm?: number;           // Beats per minute (TBPM tag)
  musicBrainzId?: string; // MusicBrainz ID for external lookups
}

// Extended song metadata for DJ features
export interface ExtendedSongMetadata {
  id: string;
  bpm?: number;           // BPM from ID3 TBPM tag
  key?: string;           // Musical key from ID3 TKEY tag (e.g., "Am", "C", "F#m")
  energy?: number;        // Energy level 0-1 (estimated if not available)
  fetchedAt: number;      // Timestamp when metadata was fetched
  source: 'navidrome' | 'estimated'; // Where the data came from
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
  genre?: string; // Genre tag
  year?: number;
  playCount?: number;
  rating?: number;
  loved?: boolean; // Starred/favorited
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

// Rate limiting with wait-and-retry for batch operations
const requestQueue = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120; // Increased to 120 requests per minute for local Navidrome server

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

/**
 * Wait until rate limit allows another request
 * Returns the time waited in ms
 */
async function waitForRateLimit(key: string, maxWaitMs: number = 5000): Promise<number> {
  const startTime = Date.now();

  while (!checkRateLimit(key)) {
    const waited = Date.now() - startTime;
    if (waited >= maxWaitMs) {
      throw new ServiceError('RATE_LIMIT_ERROR', 'Rate limit wait exceeded maximum time');
    }

    // Wait 200ms before checking again
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return Date.now() - startTime;
}

export function resetAuthState() {
  token = null;
  clientId = null;
  subsonicToken = null;
  subsonicSalt = null;
  tokenExpiry = 0;
}

/**
 * Check if we're running in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

/**
 * Get the base URL for API calls
 * In browser: use the proxy at /api/navidrome
 * On server: use direct Navidrome URL
 */
function getApiBaseUrl(): string {
  if (isBrowser()) {
    // Use the server-side proxy to avoid CORS issues
    return '/api/navidrome';
  }
  const config = getConfig();
  return config.navidromeUrl || '';
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
  // Also regenerate if subsonic credentials are missing (needed for Subsonic API calls)
  if (token && now < tokenExpiry - TOKEN_REFRESH_THRESHOLD && subsonicToken && subsonicSalt) {
    return token;
  }

  // Use adaptive timeout based on network conditions
  const adaptiveTimeout = mobileOptimization.getAdaptiveTimeout();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);

  // Use proxy in browser, direct URL on server
  const authUrl = isBrowser()
    ? '/api/navidrome/auth/login'
    : `${config.navidromeUrl}/auth/login`;

  try {
    const response = await fetch(authUrl, {
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

    // Generate Subsonic API auth token/salt
    // Subsonic uses: token = md5(password + salt)
    const salt = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const md5Token = md5Pure(password + salt);
    subsonicToken = md5Token;
    subsonicSalt = salt;

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
  isRetriable: (error: Error | ServiceError) => boolean = () => true
): Promise<T> {
  let lastError: Error | ServiceError | null = null;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if error is not retriable
      if (!isRetriable(lastError)) {
        throw lastError;
      }

      // Don't retry if we've exhausted attempts
      if (attempt > maxRetries) {
        throw lastError;
      }

      // Exponential backoff: 500ms, 1000ms
      const delay = Math.pow(2, attempt - 1) * 500;
      console.log(`🔄 Navidrome retry attempt ${attempt}/${maxRetries + 1} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Retry failed with no error');
}

async function apiFetch<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
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

            const baseUrl = getApiBaseUrl();
            let url = `${baseUrl}${endpoint}`;
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
              // Note: Subsonic API requires the actual username, not the client ID
              const params = new URLSearchParams({
                u: config.navidromeUsername || ndId,
                t: subsonicToken || '',
                s: subsonicSalt || '',
                v: '1.16.1',
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
              throw Object.assign(error, { isRetriable });

            }

            if (!response) {
              throw new ServiceError('NAVIDROME_NETWORK_ERROR', 'No response received from server');
            }

            const contentType = response.headers?.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              return await response.json() as T;
            }
            // Fallback: if no content-type header but response has json method, use it
            if (typeof response.json === 'function') {
              return await response.json() as T;
            }
            // Final fallback to text if available
            if (typeof response.text === 'function') {
              return await response.text() as T;
            }
            return response as T;
          } catch (error: unknown) {
            clearTimeout(timeoutId);

            // Timeout errors are retriable
            if (error instanceof Error && error.name === 'AbortError') {
              throw Object.assign(
                new ServiceError('NAVIDROME_TIMEOUT_ERROR', `API request timed out (${adaptiveTimeout}ms limit)`),
                { isRetriable: true }
              );
            }

            // Network errors are retriable
            if (error instanceof TypeError && error.message.includes('fetch')) {
              throw Object.assign(
                new ServiceError('NAVIDROME_NETWORK_ERROR', 'Network request failed'),
                { isRetriable: true }
              );
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
          return (error as Error & { isRetriable?: boolean }).isRetriable === true;
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

export type AlbumDetail = Album & {
  artist?: string;
  songCount?: number;
  duration?: number;
  genres?: string[];
};

export async function getAlbumDetail(id: string): Promise<AlbumDetail> {
  try {
    const data = await apiFetch(`/api/album/${id}`) as AlbumDetail;
    return data;
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch album detail: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

export async function getSongsByArtist(artistId: string, start: number = 0, limit: number = 100): Promise<Song[]> {
  try {
    const data = await apiFetch(`/api/song?artist_id=${artistId}&_start=${start}&_end=${start + limit - 1}&_sort=title&_order=ASC`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch artist songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get songs by their IDs
 * Uses Navidrome's filter syntax to fetch multiple songs at once
 */
export async function getSongsByIds(songIds: string[]): Promise<Song[]> {
  if (songIds.length === 0) return [];

  try {
    // Navidrome API supports id filter with multiple values
    const idFilter = songIds.map(id => `id=${id}`).join('&');
    const data = await apiFetch(`/api/song?${idFilter}&_start=0&_end=${songIds.length}`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`,
      // Ensure genre is properly mapped from Navidrome response
      genre: song.genre || (song.genres && song.genres.length > 0
        ? song.genres.map(g => g.name).join(', ')
        : ''),
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch songs by IDs: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    // Rate limiting with wait-and-retry for batch operations (like playlist import)
    const waitTime = await waitForRateLimit('search', 10000);
    if (waitTime > 0) {
      console.log(`⏳ Rate limit: waited ${waitTime}ms before search`);
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
    // Use Subsonic API search3.view (search.view is deprecated and returns 410 Gone)
    const songEndpoint = `/rest/search3.view?query=${encodeURIComponent(query)}&songCount=${limit}&artistCount=0&albumCount=0&songOffset=${start}`;

    let songs: Song[] = [];

    try {
      const response = await apiFetch(songEndpoint) as SubsonicSearchResponse;
      // Handle Subsonic JSON response structure (wrapped in 'subsonic-response')
      const subsonicData = response['subsonic-response'] || response;
      const searchSongs = subsonicData.searchResult3?.song || subsonicData.searchResult?.song;
      if (searchSongs && searchSongs.length > 0) {
        songs = searchSongs.map((song: SubsonicSong) => {
          return {
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
      // Map genre - Navidrome native API returns genres as array of {id, name}
      genre: song.genre || (song.genres && song.genres.length > 0
        ? song.genres.map(g => g.name).join(', ')
        : ''),
      loved: song.starred || false,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch global songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get random songs from the library for DJ set planning
 * Uses Navidrome's random sort to get diverse tracks
 */
export async function getRandomSongs(count: number = 100): Promise<Song[]> {
  try {
    // Use _sort=random to get random songs from Navidrome
    const data = await apiFetch(`/api/song?_start=0&_end=${count}&_sort=random&_order=ASC`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`,
      genre: song.genre || (song.genres && song.genres.length > 0
        ? song.genres.map(g => g.name).join(', ')
        : ''),
      loved: song.starred || false,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch random songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    return starredSongs.map((song: { id: string; title?: string; name?: string; artist?: string; album?: string; albumId?: string; duration?: number; track?: number }) => ({
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
  // Check if we're on the client side - if so, use the API proxy
  const isClient = typeof window !== 'undefined';

  if (isClient) {
    // Client-side: use the API proxy to avoid CORS issues
    try {
      const params = new URLSearchParams({
        id: songId,
        submission: submission.toString(),
        v: '1.16.1',
        c: 'aidj',
        f: 'json',
      });

      if (time) {
        params.append('time', time.getTime().toString());
      }

      const response = await fetch(`/api/navidrome/rest/scrobble?${params.toString()}`, {
        method: 'GET',
      });

      if (!response?.ok) {
        const errorText = await response.text();
        console.error('Failed to scrobble song:', errorText);
        return;
      }

      const data = await response.json();
      if (data?.['subsonic-response']?.status !== 'ok') {
        console.error('Subsonic API error:', data?.['subsonic-response']?.error?.message || 'Unknown error');
        return;
      }

      if (submission) {
        console.log(`🎵 Scrobbled song ${songId} in Navidrome (play count updated)`);
      } else {
        console.log(`▶️ Updated now playing status for song ${songId} in Navidrome`);
      }
    } catch (error) {
      console.error('Failed to scrobble song in Navidrome:', error);
      // Don't throw error - scrobbling should fail silently to not disrupt playback
    }
    return;
  }

  // Server-side: direct access to Navidrome
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
    const data = await apiFetch(endpoint) as SubsonicApiResponse;

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
    const data = await apiFetch(endpoint) as SubsonicApiResponse;

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

    const data = await apiFetch(endpoint, { method: 'POST' }) as SubsonicApiResponse;

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

    const data = await apiFetch(endpoint, { method: 'POST' }) as SubsonicApiResponse;

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
    const data = await apiFetch(endpoint, { method: 'POST' }) as SubsonicApiResponse;

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
    const data = await apiFetch(endpoint) as SubsonicApiResponse;
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
          const genreData = await apiFetch(genreEndpoint) as SubsonicApiResponse;
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
            const randomData = await apiFetch(randomEndpoint) as SubsonicApiResponse;
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

    const data = await apiFetch(endpoint, { method: 'POST' }) as SubsonicApiResponse;

    // Check for Subsonic response status
    if (data['subsonic-response']?.status !== 'ok') {
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic API error: ${data['subsonic-response']?.error?.message || 'Unknown error'}`);
    }

    console.log(`➕ Added ${songIds.length} songs to playlist ${playlistId}`);
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to add songs to playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get top artists by actual play count
 * Uses Subsonic API getAlbumList2?type=frequent to get frequently played albums,
 * then aggregates by artist to find top artists
 */
export async function getTopArtists(limit: number = 5): Promise<ArtistWithDetails[]> {
  try {
    // Get frequently played albums via Subsonic API (has playCount field)
    const endpoint = `/rest/getAlbumList2?type=frequent&size=100`;
    const data = await apiFetch(endpoint) as SubsonicApiResponse;

    // Extract albums from response
    const albums = data?.['subsonic-response']?.albumList2?.album ||
                   data?.albumList2?.album ||
                   data?.album ||
                   [];

    if (!albums || albums.length === 0) {
      // Fallback to song count method
      console.log('No frequent albums found, falling back to song count');
      const artists = await getArtistsWithDetails(0, 100);
      const sorted = artists.sort((a, b) => (b.songCount || 0) - (a.songCount || 0));
      return sorted.slice(0, limit);
    }

    // Aggregate play counts by artist from album data
    const artistPlayCounts = new Map<string, { id: string; name: string; totalPlays: number }>();

    for (const album of albums) {
      const artistId = album.artistId;
      const artistName = album.artist || 'Unknown Artist';
      const playCount = album.playCount || 0;

      if (artistId && playCount > 0) {
        const existing = artistPlayCounts.get(artistId);
        if (existing) {
          existing.totalPlays += playCount;
        } else {
          artistPlayCounts.set(artistId, {
            id: artistId,
            name: artistName,
            totalPlays: playCount
          });
        }
      }
    }

    // Sort by total plays and get top N
    const sortedArtists = Array.from(artistPlayCounts.values())
      .sort((a, b) => b.totalPlays - a.totalPlays)
      .slice(0, limit);

    console.log('🎨 [getTopArtists] Aggregated artists:', sortedArtists.map(a => `${a.name}: ${a.totalPlays} plays`));

    // If we have play data, fetch full artist details for the top artists
    if (sortedArtists.length > 0 && sortedArtists[0].totalPlays > 0) {
      const artistDetails = await Promise.all(
        sortedArtists.map(async (artist) => {
          try {
            const detail = await getArtistDetail(artist.id);
            return {
              ...detail,
              id: artist.id,
              name: artist.name,
              totalPlays: artist.totalPlays
            } as ArtistWithDetails & { totalPlays: number };
          } catch {
            return {
              id: artist.id,
              name: artist.name,
              albumCount: 0,
              songCount: 0,
              genres: null,
              fullText: '',
              orderArtistName: artist.name,
              size: 0,
              totalPlays: artist.totalPlays
            } as ArtistWithDetails & { totalPlays: number };
          }
        })
      );
      return artistDetails;
    }

    // Fallback: if no play data available, use song count as before
    console.log('No play count data available, falling back to song count');
    const artists = await getArtistsWithDetails(0, 100);
    const sorted = artists.sort((a, b) => (b.songCount || 0) - (a.songCount || 0));
    return sorted.slice(0, limit);
  } catch (error) {
    console.error('Failed to get top artists:', error);
    // Fallback to basic method
    try {
      const artists = await getArtistsWithDetails(0, 100);
      const sorted = artists.sort((a, b) => (b.songCount || 0) - (a.songCount || 0));
      return sorted.slice(0, limit);
    } catch {
      return [];
    }
  }
}

/**
 * Get most played songs
 * Uses Navidrome's getSongsByFrequent or falls back to starred songs
 */
export async function getMostPlayedSongs(limit: number = 5): Promise<SubsonicSong[]> {
  try {
    // Try to get frequently played songs first
    const endpoint = `/rest/getAlbumList2?type=frequent&size=${limit}`;
    const data = await apiFetch(endpoint) as SubsonicApiResponse;

    const albums = data['subsonic-response']?.albumList2?.album || data.albumList2?.album || [];

    if (albums.length > 0) {
      // Get songs from the most played albums
      const songs: SubsonicSong[] = [];
      for (const album of albums.slice(0, 3)) {
        const albumSongs = await getSongs(album.id, 0, 2);
        songs.push(...albumSongs.map(s => ({
          id: s.id,
          title: s.name || s.title || '',
          artist: s.artist || '',
          albumId: s.albumId,
          album: s.album,
          duration: String(s.duration),
          track: String(s.track),
        })));
      }
      console.log(`🎵 Fetched ${songs.length} most played songs`);
      return songs.slice(0, limit);
    }

    // Fallback to starred songs
    const starred = await getStarredSongs();
    console.log(`🎵 Fallback: ${starred.length} starred songs`);
    return starred.slice(0, limit);
  } catch (error) {
    console.error('Failed to get most played songs:', error);
    return [];
  }
}

/**
 * Get recently played songs
 * Uses Navidrome's getNowPlaying or getAlbumList2 with type=recent
 */
/**
 * Get extended metadata for a single song
 * Uses Subsonic API getSong to fetch detailed song info including BPM/key from ID3 tags
 *
 * @param songId - The Navidrome song ID
 * @returns Extended song metadata with BPM, key, etc.
 */
export async function getSongWithExtendedMetadata(songId: string): Promise<ExtendedSongMetadata> {
  try {
    // Use Subsonic getSong endpoint which returns full song details
    const endpoint = `/rest/getSong?id=${encodeURIComponent(songId)}`;
    const data = await apiFetch(endpoint) as SubsonicApiResponse;

    // Handle Subsonic response structure
    const song = data['subsonic-response']?.song || data.song;

    if (!song) {
      throw new ServiceError('NAVIDROME_API_ERROR', `Song not found: ${songId}`);
    }

    // Extract BPM and key from response
    // Navidrome may expose these via custom fields or standard Subsonic fields
    const bpm = song.bpm ? parseInt(song.bpm) : undefined;
    const _key = song.musicBrainzId ? undefined : undefined; // Key is not standard in Subsonic API

    // Note: Navidrome/Subsonic API doesn't expose key directly
    // We'll need to rely on the metadata cache and estimation for key

    return {
      id: songId,
      bpm: bpm && !isNaN(bpm) ? bpm : undefined,
      key: undefined, // Key detection will be handled separately
      energy: undefined, // Energy estimation will be handled separately
      fetchedAt: Date.now(),
      source: bpm ? 'navidrome' : 'estimated',
    };
  } catch (error) {
    console.warn(`Failed to get extended metadata for song ${songId}:`, error);
    return {
      id: songId,
      bpm: undefined,
      key: undefined,
      energy: undefined,
      fetchedAt: Date.now(),
      source: 'estimated',
    };
  }
}

/**
 * Get extended metadata for multiple songs in batch
 * More efficient than calling getSongWithExtendedMetadata for each song
 *
 * @param songIds - Array of Navidrome song IDs
 * @returns Map of songId to extended metadata
 */
export async function getSongsWithExtendedMetadata(songIds: string[]): Promise<Map<string, ExtendedSongMetadata>> {
  const results = new Map<string, ExtendedSongMetadata>();

  if (songIds.length === 0) return results;

  // Navidrome doesn't have a batch getSong endpoint, so we'll use the native API
  // which returns more fields when querying by ID
  try {
    const songs = await getSongsByIds(songIds);

    for (const song of songs) {
      // The native API may include genre which we can use for energy estimation
      results.set(song.id, {
        id: song.id,
        bpm: undefined, // Native API doesn't expose BPM
        key: undefined,
        energy: undefined,
        fetchedAt: Date.now(),
        source: 'estimated',
      });
    }

    // For songs with missing data, try to get via Subsonic API (slower but more complete)
    const missingSongIds = songIds.filter(id => !results.has(id));
    for (const songId of missingSongIds.slice(0, 10)) { // Limit to avoid too many requests
      try {
        const metadata = await getSongWithExtendedMetadata(songId);
        results.set(songId, metadata);
      } catch {
        // Skip failed songs
      }
    }
  } catch (error) {
    console.warn('Failed to get batch extended metadata:', error);
  }

  return results;
}

export async function getRecentlyPlayedSongs(limit: number = 10): Promise<SubsonicSong[]> {
  try {
    // Get recently played albums
    const endpoint = `/rest/getAlbumList2?type=recent&size=${Math.min(limit, 10)}`;
    const data = await apiFetch(endpoint) as SubsonicApiResponse;

    const albums = data['subsonic-response']?.albumList2?.album || data.albumList2?.album || [];

    if (albums.length > 0) {
      // Get songs from the recently played albums
      const songs: SubsonicSong[] = [];
      for (const album of albums) {
        const albumSongs = await getSongs(album.id, 0, 2);
        songs.push(...albumSongs.map(s => ({
          id: s.id,
          title: s.name || s.title || '',
          artist: s.artist || '',
          albumId: s.albumId,
          album: s.album,
          duration: String(s.duration),
          track: String(s.track),
        })));
        if (songs.length >= limit) break;
      }
      console.log(`🕐 Fetched ${songs.length} recently played songs`);
      return songs.slice(0, limit);
    }

    return [];
  } catch (error) {
    console.error('Failed to get recently played songs:', error);
    return [];
  }
}