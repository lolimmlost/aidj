/**
 * Multi-Source Image Resolver
 *
 * Cascading image resolution: Navidrome -> Last.fm -> Deezer (free, no-auth fallback)
 * Used to fill in missing artist/album artwork across the app.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 2.1
 */

import { getDeezerArtistImage, getDeezerAlbumImage } from './deezer';

/**
 * Resolve an artist image URL from available sources.
 * If the primary image is missing or empty, falls back to Deezer's free API.
 *
 * @param artistName - The artist name to search for
 * @param primaryImageUrl - The image URL from the primary source (Last.fm, Navidrome, etc.)
 * @returns The best available image URL, or null if none found
 */
export async function resolveArtistImage(
  artistName: string,
  primaryImageUrl?: string | null
): Promise<string | null> {
  // Use primary source if it has a valid URL
  if (primaryImageUrl && !isPlaceholderImage(primaryImageUrl)) {
    return primaryImageUrl;
  }

  // Fall back to Deezer
  try {
    return await getDeezerArtistImage(artistName);
  } catch {
    return null;
  }
}

/**
 * Resolve an album cover image URL from available sources.
 * Falls back to Deezer's free API when primary source is missing.
 *
 * @param artist - The artist name
 * @param album - The album name
 * @param primaryImageUrl - The image URL from the primary source
 * @returns The best available image URL, or null if none found
 */
export async function resolveAlbumImage(
  artist: string,
  album: string,
  primaryImageUrl?: string | null
): Promise<string | null> {
  if (primaryImageUrl && !isPlaceholderImage(primaryImageUrl)) {
    return primaryImageUrl;
  }

  try {
    return await getDeezerAlbumImage(artist, album);
  } catch {
    return null;
  }
}

/**
 * Batch resolve images for multiple suggestions.
 * Processes concurrently with a concurrency limit to avoid hammering Deezer.
 */
export async function batchResolveImages(
  items: Array<{ artistName: string; imageUrl?: string | null }>
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const CONCURRENCY = 3;

  // Only resolve items that need it
  const needsResolution = items.filter(
    item => !item.imageUrl || isPlaceholderImage(item.imageUrl)
  );

  for (let i = 0; i < needsResolution.length; i += CONCURRENCY) {
    const batch = needsResolution.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async item => {
        const url = await getDeezerArtistImage(item.artistName);
        if (url) resolved.set(item.artistName.toLowerCase(), url);
      })
    );
  }

  return resolved;
}

/**
 * Check if an image URL is a placeholder or known-bad image
 * Last.fm returns generic star images for missing artwork
 */
function isPlaceholderImage(url: string): boolean {
  if (!url) return true;
  // Last.fm generic placeholder patterns
  if (url.includes('2a96cbd8b46e442fc41c2b86b821562f')) return true;
  if (url.includes('/noimage/')) return true;
  if (url.endsWith('/star.png')) return true;
  return false;
}
