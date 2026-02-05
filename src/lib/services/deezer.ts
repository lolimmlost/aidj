/**
 * Deezer API Client
 *
 * Free, no-auth image fallback for artist and album artwork.
 * Used when Navidrome/Last.fm images are missing or low quality.
 *
 * Deezer's public API requires no API key and has generous rate limits.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 2.1
 */

import { getCacheService } from './cache';

const DEEZER_API_BASE = 'https://api.deezer.com';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get artist image from Deezer's free search API.
 * Returns the largest available image URL, or null if not found.
 */
export async function getDeezerArtistImage(artistName: string): Promise<string | null> {
  const cacheKey = `artist:${artistName.toLowerCase()}`;
  const cache = getCacheService();

  // Check cache first
  const cached = cache.get<string>('general', cacheKey);
  if (cached !== undefined && cached !== null) {
    return cached || null;
  }

  try {
    const res = await fetch(
      `${DEEZER_API_BASE}/search/artist?q=${encodeURIComponent(artistName)}&limit=1`
    );

    if (!res.ok) return null;

    const data = await res.json();
    const artist = data.data?.[0];

    if (!artist) {
      cache.set('general', cacheKey, '', { ttlMs: CACHE_TTL_MS });
      return null;
    }

    const imageUrl = artist.picture_xl || artist.picture_large || artist.picture_medium || artist.picture || null;
    cache.set('general', cacheKey, imageUrl || '', { ttlMs: CACHE_TTL_MS });
    return imageUrl;
  } catch {
    return null;
  }
}

/**
 * Get album cover image from Deezer's free search API.
 * Returns the largest available cover URL, or null if not found.
 */
export async function getDeezerAlbumImage(artist: string, album: string): Promise<string | null> {
  const cacheKey = `album:${artist.toLowerCase()}:${album.toLowerCase()}`;
  const cache = getCacheService();

  // Check cache first
  const cached = cache.get<string>('general', cacheKey);
  if (cached !== undefined && cached !== null) {
    return cached || null;
  }

  try {
    const query = `${artist} ${album}`;
    const res = await fetch(
      `${DEEZER_API_BASE}/search/album?q=${encodeURIComponent(query)}&limit=3`
    );

    if (!res.ok) return null;

    const data = await res.json();

    // Try to find the best match — prefer exact artist match
    const artistLower = artist.toLowerCase();
    const exactMatch = data.data?.find(
      (a: { artist?: { name?: string } }) => a.artist?.name?.toLowerCase() === artistLower
    );
    const result = exactMatch || data.data?.[0];

    if (!result) {
      cache.set('general', cacheKey, '', { ttlMs: CACHE_TTL_MS });
      return null;
    }

    const imageUrl = result.cover_xl || result.cover_large || result.cover_medium || result.cover || null;
    cache.set('general', cacheKey, imageUrl || '', { ttlMs: CACHE_TTL_MS });
    return imageUrl;
  } catch {
    return null;
  }
}
