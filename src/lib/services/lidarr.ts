import { getConfig } from '@/lib/config/config';
import { mobileOptimization } from '@/lib/performance/mobile-optimization';
import { ServiceError } from '../utils';

// Lidarr API types based on https://lidarr.audio/docs/api/

export interface LidarrArtist {
  id: number;
  artistName: string;
  foreignArtistId: string;
  overview?: string;
  artistType?: string;
  disambiguation?: string;
  images: Array<{
    coverType: string;
    url: string;
  }>;
  links: Array<{
    url: string;
    name: string;
  }>;
  genres: string[];
  status: string;
  lastInfoSync?: string;
  sortName?: string;
  added?: string;
  ratings?: {
    votes: number;
    value: number;
  };
  statistics?: {
    albumCount: number;
    trackFileCount: number;
    trackCount: number;
    totalTrackCount: number;
    sizeOnDisk: number;
    percentOfTracks: number;
  };
}

export interface LidarrAlbum {
  id: number;
  title: string;
  disambiguation?: string;
  overview?: string;
  artistId: number;
  foreignAlbumId: string;
  monitoringStatus: string;
  releaseDate?: string;
  images: Array<{
    coverType: string;
    url: string;
  }>;
  links: Array<{
    url: string;
    name: string;
  }>;
  lastInfoSync?: string;
  added?: string;
  albumType?: string;
  secondaryTypes: string[];
  ratings?: {
    votes: number;
    value: number;
  };
  statistics?: {
    trackFileCount: number;
    trackCount: number;
    totalTrackCount: number;
    sizeOnDisk: number;
    percentOfTracks: number;
  };
}

export interface LidarrSearchResult {
  artist?: LidarrArtist;
  album?: LidarrAlbum;
}

// Simplified types for our use
export type Artist = {
  id: string;
  name: string;
  genres?: string[];
  status?: string;
};

export type Album = {
  id: string;
  title: string;
  artistId: string;
  releaseDate?: string;
  images?: Array<{
    coverType: string;
    url: string;
  }>;
};

async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  const config = getConfig();
  if (!config.lidarrUrl) {
    throw new ServiceError('LIDARR_CONFIG_ERROR', 'Lidarr URL not configured');
  }

  const apiKey = config.lidarrApiKey;
  if (!apiKey) {
    throw new ServiceError('LIDARR_CONFIG_ERROR', 'Lidarr API key not configured');
  }

  // Use adaptive timeout based on network conditions
  const adaptiveTimeout = mobileOptimization.getAdaptiveTimeout();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);

  try {
    const url = `${config.lidarrUrl}/api/v1${endpoint}`;
    const headers: Record<string, string> = {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new ServiceError('LIDARR_API_ERROR', `API request failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServiceError('LIDARR_TIMEOUT_ERROR', `API request timed out (${adaptiveTimeout}ms limit)`);
    }
    throw new ServiceError('LIDARR_API_ERROR', `API fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function searchArtists(query: string): Promise<Artist[]> {
  try {
    // Use mobile-optimized batched requests for multiple lookups
    const cacheKey = `lidarr_artists_${query}`;
    const cached = mobileOptimization.getCache<Artist[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const data = await apiFetch(`/artist/lookup?term=${encodeURIComponent(query)}`) as LidarrArtist[];
    const result = data.map(artist => ({
      id: artist.id.toString(),
      name: artist.artistName,
      genres: artist.genres,
      status: artist.status,
    }));

    // Cache results for mobile devices
    mobileOptimization.setCache(cacheKey, result, 300000); // 5 minutes
    
    return result;
  } catch (error) {
    console.error('Error searching artists:', error);
    return [];
  }
}

export async function searchArtistsFull(query: string): Promise<LidarrArtist[]> {
  try {
    const data = await apiFetch(`/artist/lookup?term=${encodeURIComponent(query)}`) as LidarrArtist[];
    return data;
  } catch (error) {
    console.error('Error searching artists full:', error);
    return [];
  }
}

export async function searchAlbums(query: string): Promise<Album[]> {
  try {
    // Use mobile-optimized batched requests for multiple lookups
    const cacheKey = `lidarr_albums_${query}`;
    const cached = mobileOptimization.getCache<Album[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const data = await apiFetch(`/album/lookup?term=${encodeURIComponent(query)}`) as LidarrAlbum[];
    const result = data.map(album => ({
      id: album.id.toString(),
      title: album.title,
      artistId: album.artistId.toString(),
      releaseDate: album.releaseDate,
      images: album.images,
    }));

    // Cache results for mobile devices
    mobileOptimization.setCache(cacheKey, result, 300000); // 5 minutes
    
    return result;
  } catch (error) {
    console.error('Error searching albums:', error);
    return [];
  }
}

export async function getArtist(id: string): Promise<LidarrArtist | null> {
  try {
    const data = await apiFetch(`/artist/${id}`) as LidarrArtist;
    return data;
  } catch (error) {
    console.error('Error fetching artist:', error);
    return null;
  }
}

export async function getAlbum(id: string): Promise<LidarrAlbum | null> {
  try {
    const data = await apiFetch(`/album/${id}`) as LidarrAlbum;
    return data;
  } catch (error) {
    console.error('Error fetching album:', error);
    return null;
  }
}

export async function search(query: string): Promise<{ artists: Artist[]; albums: Album[] }> {
  try {
    const config = getConfig();
    if (!config.lidarrUrl || !config.lidarrApiKey) {
      return { artists: [], albums: [] };
    }

    // Use mobile-optimized batched requests
    const qualitySettings = mobileOptimization.getQualitySettings();
    const results = await mobileOptimization.batchRequests([
      () => searchArtists(query),
      () => searchAlbums(query) as unknown as Promise<Artist[]>,
    ], qualitySettings.concurrentRequests);

    return { artists: results[0] as unknown as Artist[], albums: results[1] as unknown as Album[] };
  } catch (error) {
    console.error('Search error:', error);
    throw new ServiceError('LIDARR_API_ERROR', `Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Alias for backward compatibility
export const searchArtist = searchArtists;

export async function addArtist(artist: LidarrArtist): Promise<void> {
  try {
    await apiFetch('/artist', {
      method: 'POST',
      body: JSON.stringify(artist),
    });
  } catch (error) {
    console.error('Error adding artist:', error);
    throw new ServiceError('LIDARR_API_ERROR', `Failed to add artist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Alias for the route
export const addArtistToQueue = addArtist;

export async function getArtists(): Promise<LidarrArtist[]> {
  try {
    const data = await apiFetch('/artist') as LidarrArtist[];
    return data;
  } catch (error) {
    console.error('Error fetching artists:', error);
    return [];
  }
}

export async function isArtistAdded(foreignArtistId: string): Promise<boolean> {
  try {
    const artists = await getArtists();
    return artists.some(artist => artist.foreignArtistId === foreignArtistId);
  } catch (error) {
    console.error('Error checking if artist is added:', error);
    return false;
  }
}