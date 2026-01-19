/**
 * Last.fm API Client
 * Story 7.2: Last.fm Integration for Discovery Mode
 *
 * Provides methods to fetch similar tracks, similar artists, and top tracks
 * from Last.fm, enriched with library status from Navidrome.
 */

import { search as searchNavidrome } from '../navidrome';
import { getCacheService } from '../cache';
import type {
  LastFmConfig,
  LastFmError,
  LastFmErrorCode,
  LastFmTrack,
  LastFmArtist,
  LastFmSimilarTracksResponse,
  LastFmSimilarArtistsResponse,
  LastFmTopTracksResponse,
  LastFmSearchResponse,
  LastFmTagTopTracksResponse,
  LastFmTrackInfoResponse,
  EnrichedTrack,
  EnrichedArtist,
} from './types';

const LASTFM_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_REQUESTS_PER_SECOND = 5;

/**
 * Rate limiter using token bucket algorithm
 */
class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private lastRefill: number;
  private refillRate: number; // tokens per ms

  constructor(maxRequestsPerSecond: number) {
    this.maxTokens = maxRequestsPerSecond;
    this.tokens = maxRequestsPerSecond;
    this.lastRefill = Date.now();
    this.refillRate = maxRequestsPerSecond / 1000;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    // Refill tokens based on elapsed time
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;

    if (this.tokens < 1) {
      // Wait for token to become available
      const waitTime = (1 - this.tokens) / this.refillRate;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.tokens = 1;
      this.lastRefill = Date.now();
    }

    this.tokens -= 1;
  }
}

/**
 * Create a Last.fm API error
 */
function createError(code: LastFmErrorCode, message: string, retryAfterMs?: number): LastFmError {
  return { code, message, retryAfterMs };
}

/**
 * Map Last.fm API error codes to our error codes
 */
function mapApiErrorCode(apiCode: number): LastFmErrorCode {
  switch (apiCode) {
    case 10: // Invalid API key
    case 26: // Suspended API key
      return 'INVALID_API_KEY';
    case 29: // Rate limit exceeded
      return 'RATE_LIMITED';
    case 6: // Artist/Track not found
      return 'ARTIST_NOT_FOUND';
    case 16: // Service offline
    case 11: // Service unavailable
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'INVALID_RESPONSE';
  }
}

/**
 * Extract artist name from track's artist field (can be string or object)
 */
function getArtistName(artist: LastFmTrack['artist']): string {
  if (typeof artist === 'string') {
    return artist;
  }
  return artist?.name || 'Unknown Artist';
}

/**
 * Get the largest available image URL from Last.fm image array
 */
function getLargestImage(images?: { '#text': string; size: string }[]): string | undefined {
  if (!images || images.length === 0) return undefined;

  // Size preference order
  const sizeOrder = ['mega', 'extralarge', 'large', 'medium', 'small', ''];

  for (const size of sizeOrder) {
    const img = images.find(i => i.size === size && i['#text']);
    if (img) return img['#text'];
  }

  // Fallback to first non-empty image
  const firstWithUrl = images.find(i => i['#text']);
  return firstWithUrl?.['#text'];
}

/**
 * Last.fm API Client
 */
export class LastFmClient {
  private apiKey: string;
  private cacheTtlMs: number;
  private rateLimiter: RateLimiter;
  private isAvailable: boolean = true;
  private unavailableUntil: number = 0;

  constructor(config: LastFmConfig) {
    this.apiKey = config.apiKey;
    this.cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.rateLimiter = new RateLimiter(config.maxRequestsPerSecond ?? DEFAULT_MAX_REQUESTS_PER_SECOND);
  }

  /**
   * Check if the service is currently available
   */
  isServiceAvailable(): boolean {
    if (!this.isAvailable && Date.now() > this.unavailableUntil) {
      this.isAvailable = true;
    }
    return this.isAvailable;
  }

  /**
   * Make a request to the Last.fm API
   */
  private async request<T>(method: string, params: Record<string, string | number> = {}): Promise<T> {
    // Check service availability
    if (!this.isServiceAvailable()) {
      throw createError('SERVICE_UNAVAILABLE', 'Last.fm service is temporarily unavailable');
    }

    // Rate limiting
    await this.rateLimiter.acquire();

    // Build URL
    const urlParams = new URLSearchParams({
      method,
      api_key: this.apiKey,
      format: 'json',
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ),
    });

    const url = `${LASTFM_BASE_URL}?${urlParams.toString()}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60') * 1000;
          this.unavailableUntil = Date.now() + retryAfter;
          this.isAvailable = false;
          throw createError('RATE_LIMITED', 'Last.fm rate limit exceeded', retryAfter);
        }
        if (response.status >= 500) {
          // Mark service unavailable for 1 minute on server error
          this.unavailableUntil = Date.now() + 60000;
          this.isAvailable = false;
          throw createError('SERVICE_UNAVAILABLE', `Last.fm server error: ${response.status}`);
        }
        throw createError('NETWORK_ERROR', `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Check for API-level errors
      if (data.error) {
        const errorCode = mapApiErrorCode(data.error);
        throw createError(errorCode, data.message || 'Unknown Last.fm API error');
      }

      return data as T;
    } catch (error) {
      if ((error as LastFmError).code) {
        throw error;
      }
      throw createError('NETWORK_ERROR', `Failed to connect to Last.fm: ${(error as Error).message}`);
    }
  }

  /**
   * Get from cache if valid
   */
  private getFromCache<T>(key: string): T | null {
    const cache = getCacheService();
    const result = cache.get<T>('lastfm', key);
    if (result) {
      console.log(`[Last.fm] Cache hit: ${key}`);
    }
    return result;
  }

  /**
   * Set cache entry
   */
  private setCache<T>(key: string, data: T): void {
    const cache = getCacheService();
    cache.set('lastfm', key, data, { ttlMs: this.cacheTtlMs });
  }

  /**
   * Enrich tracks with Navidrome library status
   */
  private async enrichTracks(tracks: LastFmTrack[]): Promise<EnrichedTrack[]> {
    return Promise.all(
      tracks.map(async (track) => {
        const artistName = getArtistName(track.artist);
        const query = `${artistName} ${track.name}`;

        let inLibrary = false;
        let navidromeId: string | undefined;
        let navidromeAlbum: string | undefined;

        try {
          const results = await searchNavidrome(query, 0, 5);
          // Find exact or close match
          const match = results.find(song => {
            const artistMatch = song.artist.toLowerCase().includes(artistName.toLowerCase()) ||
                               artistName.toLowerCase().includes(song.artist.toLowerCase());
            const titleMatch = song.title?.toLowerCase().includes(track.name.toLowerCase()) ||
                              track.name.toLowerCase().includes(song.title?.toLowerCase() || '');
            return artistMatch && titleMatch;
          });

          if (match) {
            inLibrary = true;
            navidromeId = match.id;
            navidromeAlbum = match.album;
          }
        } catch (error) {
          // Continue without library match on error
          console.warn(`[Last.fm] Failed to search Navidrome for "${query}":`, error);
        }

        return {
          name: track.name,
          artist: artistName,
          url: track.url,
          playcount: typeof track.playcount === 'string' ? parseInt(track.playcount) : track.playcount,
          match: track.match,
          duration: typeof track.duration === 'string' ? parseInt(track.duration) : track.duration,
          image: getLargestImage(track.image),
          inLibrary,
          navidromeId,
          navidromeAlbum,
        };
      })
    );
  }

  /**
   * Get tracks similar to a given track
   * @param artist - Artist name
   * @param track - Track name
   * @param limit - Maximum number of results (default: 20)
   */
  async getSimilarTracks(artist: string, track: string, limit: number = 20): Promise<EnrichedTrack[]> {
    const cacheKey = `similar-tracks:${artist}:${track}:${limit}`;
    const cached = this.getFromCache<EnrichedTrack[]>(cacheKey);
    if (cached) return cached;

    console.log(`[Last.fm] Fetching similar tracks for "${artist} - ${track}"`);

    const response = await this.request<LastFmSimilarTracksResponse>('track.getsimilar', {
      artist,
      track,
      limit,
    });

    const tracks = response.similartracks?.track || [];
    console.log(`[Last.fm] Found ${tracks.length} similar tracks`);

    const enriched = await this.enrichTracks(tracks);
    this.setCache(cacheKey, enriched);

    return enriched;
  }

  /**
   * Get artists similar to a given artist
   * @param artist - Artist name
   * @param limit - Maximum number of results (default: 20)
   */
  async getSimilarArtists(artist: string, limit: number = 20): Promise<EnrichedArtist[]> {
    const cacheKey = `similar-artists:${artist}:${limit}`;
    const cached = this.getFromCache<EnrichedArtist[]>(cacheKey);
    if (cached) return cached;

    console.log(`[Last.fm] Fetching similar artists for "${artist}"`);

    const response = await this.request<LastFmSimilarArtistsResponse>('artist.getsimilar', {
      artist,
      limit,
    });

    const artists = response.similarartists?.artist || [];
    console.log(`[Last.fm] Found ${artists.length} similar artists`);

    // Check library status for each artist
    const enriched = await Promise.all(
      artists.map(async (a) => {
        let inLibrary = false;
        let navidromeId: string | undefined;
        let trackCount: number | undefined;

        try {
          const results = await searchNavidrome(a.name, 0, 1);
          if (results.length > 0 && results[0].artist.toLowerCase() === a.name.toLowerCase()) {
            inLibrary = true;
            navidromeId = results[0].artistId;
            // Could fetch track count if needed
          }
        } catch (error) {
          console.warn(`[Last.fm] Failed to search Navidrome for artist "${a.name}":`, error);
        }

        return {
          name: a.name,
          url: a.url,
          match: a.match,
          image: getLargestImage(a.image),
          inLibrary,
          navidromeId,
          trackCount,
        };
      })
    );

    this.setCache(cacheKey, enriched);
    return enriched;
  }

  /**
   * Get top tracks by an artist
   * @param artist - Artist name
   * @param limit - Maximum number of results (default: 10)
   */
  async getTopTracks(artist: string, limit: number = 10): Promise<EnrichedTrack[]> {
    const cacheKey = `top-tracks:${artist}:${limit}`;
    const cached = this.getFromCache<EnrichedTrack[]>(cacheKey);
    if (cached) return cached;

    console.log(`[Last.fm] Fetching top tracks for "${artist}"`);

    const response = await this.request<LastFmTopTracksResponse>('artist.gettoptracks', {
      artist,
      limit,
    });

    const tracks = response.toptracks?.track || [];
    console.log(`[Last.fm] Found ${tracks.length} top tracks`);

    const enriched = await this.enrichTracks(tracks);
    this.setCache(cacheKey, enriched);

    return enriched;
  }

  /**
   * Get top tracks by tag/genre
   * @param tag - Tag/genre name (e.g., "chill", "electronic", "rock")
   * @param limit - Maximum number of results (default: 20)
   */
  async getTopTracksByTag(tag: string, limit: number = 20): Promise<EnrichedTrack[]> {
    const cacheKey = `tag-tracks:${tag}:${limit}`;
    const cached = this.getFromCache<EnrichedTrack[]>(cacheKey);
    if (cached) return cached;

    console.log(`[Last.fm] Getting top tracks for tag "${tag}"`);

    try {
      const response = await this.request<LastFmTagTopTracksResponse>('tag.gettoptracks', {
        tag,
        limit,
      });

      const tracks = response.tracks?.track || [];
      console.log(`[Last.fm] Found ${tracks.length} tracks for tag "${tag}"`);

      const enriched = await this.enrichTracks(tracks);
      this.setCache(cacheKey, enriched);

      return enriched;
    } catch (error) {
      console.warn(`[Last.fm] Error getting tracks for tag "${tag}":`, error);
      return [];
    }
  }

  /**
   * Search for tracks by name
   * @param query - Search query
   * @param limit - Maximum number of results (default: 10)
   */
  async searchTracks(query: string, limit: number = 10): Promise<EnrichedTrack[]> {
    const cacheKey = `search-tracks:${query}:${limit}`;
    const cached = this.getFromCache<EnrichedTrack[]>(cacheKey);
    if (cached) return cached;

    console.log(`[Last.fm] Searching tracks for "${query}"`);

    const response = await this.request<LastFmSearchResponse>('track.search', {
      track: query,
      limit,
    });

    const tracks = response.results?.trackmatches?.track || [];
    console.log(`[Last.fm] Found ${tracks.length} search results`);

    const enriched = await this.enrichTracks(tracks);
    this.setCache(cacheKey, enriched);

    return enriched;
  }

  /**
   * Get detailed track info including album metadata
   * This is useful for Lidarr integration to find the correct album
   * @param artist - Artist name
   * @param track - Track name
   */
  async getTrackInfo(artist: string, track: string): Promise<{
    name: string;
    artist: string;
    album?: string;
    albumMbid?: string;
    duration?: number;
  } | null> {
    const cacheKey = `track-info:${artist}:${track}`;
    const cached = this.getFromCache<{
      name: string;
      artist: string;
      album?: string;
      albumMbid?: string;
      duration?: number;
    }>(cacheKey);
    if (cached) return cached;

    console.log(`[Last.fm] Getting track info for "${artist} - ${track}"`);

    try {
      const response = await this.request<LastFmTrackInfoResponse>('track.getInfo', {
        artist,
        track,
      });

      if (!response.track) {
        console.warn(`[Last.fm] Track not found: "${artist} - ${track}"`);
        return null;
      }

      const result = {
        name: response.track.name,
        artist: response.track.artist.name,
        album: response.track.album?.title,
        albumMbid: response.track.album?.mbid,
        duration: response.track.duration ? parseInt(response.track.duration, 10) : undefined,
      };

      console.log(`[Last.fm] Track info: album="${result.album}", mbid="${result.albumMbid}"`);
      this.setCache(cacheKey, result);

      return result;
    } catch (error) {
      console.warn(`[Last.fm] Failed to get track info for "${artist} - ${track}":`, error);
      return null;
    }
  }

  /**
   * Test the connection to Last.fm
   * @returns true if connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      // Use a simple API call to test connection
      await this.request<LastFmTopTracksResponse>('artist.gettoptracks', {
        artist: 'Radiohead',
        limit: 1,
      });
      return true;
    } catch (error) {
      console.error('[Last.fm] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    const cache = getCacheService();
    cache.clearNamespace('lastfm');
    console.log('[Last.fm] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: number } {
    const cache = getCacheService();
    const stats = cache.getNamespaceStats('lastfm');
    return {
      size: stats?.memoryUsage ?? 0,
      entries: stats?.entryCount ?? 0,
    };
  }
}

// Singleton instance (will be initialized when config is available)
let lastFmClientInstance: LastFmClient | null = null;

/**
 * Get or create the Last.fm client instance
 */
export function getLastFmClient(apiKey?: string): LastFmClient | null {
  if (!apiKey && !lastFmClientInstance) {
    return null;
  }

  if (apiKey && (!lastFmClientInstance || (lastFmClientInstance as { apiKey?: string }).apiKey !== apiKey)) {
    lastFmClientInstance = new LastFmClient({ apiKey });
  }

  return lastFmClientInstance;
}

/**
 * Check if Last.fm is configured
 */
export function isLastFmConfigured(): boolean {
  return lastFmClientInstance !== null;
}
