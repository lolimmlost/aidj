import { getConfig } from '@/lib/config/config';
import { mobileOptimization } from '@/lib/performance/mobile-optimization';
import { ServiceError } from '../utils';

// Retry configuration
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatusCodes: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

// Authentication token management
interface TokenInfo {
  token: string;
  expiresAt: number;
}

let tokenInfo: TokenInfo | null = null;
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes before expiry

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

/**
 * Get or refresh authentication token
 */
async function getAuthToken(): Promise<string> {
  const config = getConfig();
  if (!config.lidarrApiKey) {
    throw new ServiceError('LIDARR_CONFIG_ERROR', 'Lidarr API key not configured');
  }

  // Check if we need to refresh the token
  if (tokenInfo && Date.now() < tokenInfo.expiresAt - TOKEN_REFRESH_BUFFER) {
    return tokenInfo.token;
  }

  // For now, use the API key as the token (Lidarr doesn't have traditional JWT tokens)
  // In a real implementation, this would handle actual token refresh logic
  const newToken = config.lidarrApiKey;
  tokenInfo = {
    token: newToken,
    expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours from now
  };

  return newToken;
}

/**
 * Execute API request with retry logic and error handling
 */
async function apiFetch(endpoint: string, options: RequestInit = {}, retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG): Promise<unknown> {
  const config = getConfig();
  if (!config.lidarrUrl) {
    throw new ServiceError('LIDARR_CONFIG_ERROR', 'Lidarr URL not configured');
  }

  const adaptiveTimeout = mobileOptimization.getAdaptiveTimeout();
  let lastError: Error;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);

    try {
      // Get fresh token for each attempt
      const token = await getAuthToken();
      
      const url = `${config.lidarrUrl}/api/v1${endpoint}`;
      const headers: Record<string, string> = {
        'X-Api-Key': token,
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {}),
      };

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Handle token refresh if needed (401 Unauthorized)
      if (response.status === 401) {
        tokenInfo = null; // Clear cached token
        if (attempt < retryConfig.maxRetries) {
          continue; // Retry with fresh token
        }
        throw new ServiceError('LIDARR_AUTH_ERROR', 'Authentication failed. Please check your API key.');
      }

      if (!response.ok) {
        // Check if this is a retryable error
        const shouldRetry = retryConfig.retryableStatusCodes.includes(response.status);
        
        if (shouldRetry && attempt < retryConfig.maxRetries) {
          const delay = Math.min(
            retryConfig.baseDelay * Math.pow(2, attempt),
            retryConfig.maxDelay
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry
        }

        throw new ServiceError('LIDARR_API_ERROR', `API request failed: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();

    } catch (error: unknown) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error('Unknown error');

      // Don't retry on abort errors (timeout) or final attempt
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceError('LIDARR_TIMEOUT_ERROR', `API request timed out (${adaptiveTimeout}ms limit)`);
      }

      // Don't retry on the final attempt
      if (attempt === retryConfig.maxRetries) {
        break;
      }

      // Exponential backoff for retries
      const delay = Math.min(
        retryConfig.baseDelay * Math.pow(2, attempt),
        retryConfig.maxDelay
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new ServiceError('LIDARR_API_ERROR', `API fetch error after ${retryConfig.maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
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

// Download queue and status management
export interface DownloadQueueItem {
  id: string;
  artistName: string;
  foreignArtistId: string;
  status: 'queued' | 'downloaded' | 'failed' | 'downloading';
  progress?: number;
  estimatedCompletion?: string;
  addedAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface DownloadHistory {
  id: string;
  artistName: string;
  foreignArtistId: string;
  status: 'completed' | 'failed';
  addedAt: string;
  completedAt: string;
  size?: number;
  errorMessage?: string;
}

/**
 * Get current download queue
 */
export async function getDownloadQueue(): Promise<DownloadQueueItem[]> {
  try {
    const data = await apiFetch('/queue') as Array<{
      id: number | string;
      artistName?: string;
      foreignArtistId: string;
      status?: string;
      progress?: number;
      estimatedCompletion?: string;
      addedAt?: string;
      startedAt?: string;
      completedAt?: string;
      errorMessage?: string;
    }>;
    return data.map(item => ({
      id: item.id.toString(),
      artistName: item.artistName || 'Unknown Artist',
      foreignArtistId: item.foreignArtistId,
      status: (item.status as DownloadQueueItem['status']) || 'queued',
      progress: item.progress || 0,
      estimatedCompletion: item.estimatedCompletion,
      addedAt: item.addedAt || new Date().toISOString(),
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      errorMessage: item.errorMessage,
    }));
  } catch (error) {
    console.error('Error fetching download queue:', error);
    return [];
  }
}

/**
 * Get download history
 */
export async function getDownloadHistory(): Promise<DownloadHistory[]> {
  try {
    const data = await apiFetch('/history') as Array<{
      id: number | string;
      artistName?: string;
      foreignArtistId: string;
      status?: string;
      addedAt?: string;
      completedAt?: string;
      size?: number;
      errorMessage?: string;
    }>;
    return data.map(item => ({
      id: item.id.toString(),
      artistName: item.artistName || 'Unknown Artist',
      foreignArtistId: item.foreignArtistId,
      status: (item.status as DownloadHistory['status']) || 'completed',
      addedAt: item.addedAt || new Date().toISOString(),
      completedAt: item.completedAt || new Date().toISOString(),
      size: item.size,
      errorMessage: item.errorMessage,
    }));
  } catch (error) {
    console.error('Error fetching download history:', error);
    return [];
  }
}

/**
 * Cancel a download from the queue
 */
export async function cancelDownload(downloadId: string): Promise<boolean> {
  try {
    await apiFetch(`/queue/${downloadId}`, {
      method: 'DELETE',
    });
    return true;
  } catch (error) {
    console.error('Error cancelling download:', error);
    return false;
  }
}

/**
 * Get download statistics
 */
export async function getDownloadStats(): Promise<{
  totalQueued: number;
  totalDownloading: number;
  totalCompleted: number;
  totalFailed: number;
  totalSize: number;
}> {
  try {
    const queue = await getDownloadQueue();
    const history = await getDownloadHistory();
    
    return {
      totalQueued: queue.filter(item => item.status === 'queued').length,
      totalDownloading: queue.filter(item => item.status === 'downloading').length,
      totalCompleted: history.filter(item => item.status === 'completed').length,
      totalFailed: history.filter(item => item.status === 'failed').length,
      totalSize: history.reduce((sum, item) => sum + (item.size || 0), 0),
    };
  } catch (error) {
    console.error('Error fetching download stats:', error);
    return {
      totalQueued: 0,
      totalDownloading: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalSize: 0,
    };
  }
}

/**
 * Monitor download progress (for real-time updates)
 */
export async function monitorDownloads(): Promise<{
  queue: DownloadQueueItem[];
  history: DownloadHistory[];
  stats: Awaited<ReturnType<typeof getDownloadStats>>;
}> {
  try {
    const [queue, history, stats] = await Promise.all([
      getDownloadQueue(),
      getDownloadHistory(),
      getDownloadStats(),
    ]);

    return { queue, history, stats };
  } catch (error) {
    console.error('Error monitoring downloads:', error);
    return {
      queue: [],
      history: [],
      stats: {
        totalQueued: 0,
        totalDownloading: 0,
        totalCompleted: 0,
        totalFailed: 0,
        totalSize: 0,
      },
    };
  }
}

/**
 * Export download history
 */
export async function exportDownloadHistory(): Promise<string> {
  try {
    const history = await getDownloadHistory();
    const csvContent = [
      ['ID', 'Artist Name', 'Status', 'Added At', 'Completed At', 'Size (MB)', 'Error Message'],
      ...history.map(item => [
        item.id,
        `"${item.artistName}"`,
        item.status,
        item.addedAt,
        item.completedAt,
        (item.size ? (item.size / (1024 * 1024)).toFixed(2) : ''),
        item.errorMessage || '',
      ])
    ].map(row => row.join(',')).join('\n');

    return csvContent;
  } catch (error) {
    console.error('Error exporting download history:', error);
    throw new ServiceError('LIDARR_EXPORT_ERROR', `Failed to export download history: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Clear completed download history
 */
export async function clearDownloadHistory(): Promise<boolean> {
  try {
    await apiFetch('/history/clear', {
      method: 'POST',
    });
    return true;
  } catch (error) {
    console.error('Error clearing download history:', error);
    return false;
  }
}