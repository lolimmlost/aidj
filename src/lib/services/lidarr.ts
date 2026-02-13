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
 * @template T - The expected response type
 */
async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
  customTimeout?: number
): Promise<T> {
  const config = getConfig();
  if (!config.lidarrUrl) {
    throw new ServiceError('LIDARR_CONFIG_ERROR', 'Lidarr URL not configured');
  }

  // Use custom timeout if provided, otherwise use adaptive timeout
  // Album lookups need more time (15s) since they query external databases
  const adaptiveTimeout = customTimeout ?? mobileOptimization.getAdaptiveTimeout();
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
        return await response.json() as T;
      }
      return await response.text() as T;

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

    // Use 15 second timeout - artist lookups query external MusicBrainz database
    const data = await apiFetch(
      `/artist/lookup?term=${encodeURIComponent(query)}`,
      {},
      DEFAULT_RETRY_CONFIG,
      15000
    ) as LidarrArtist[];
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
    // Use 15 second timeout - artist lookups query external MusicBrainz database
    const data = await apiFetch(
      `/artist/lookup?term=${encodeURIComponent(query)}`,
      {},
      DEFAULT_RETRY_CONFIG,
      15000
    ) as LidarrArtist[];
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

    // Use 15 second timeout - album lookups query external MusicBrainz database
    const data = await apiFetch(
      `/album/lookup?term=${encodeURIComponent(query)}`,
      {},
      DEFAULT_RETRY_CONFIG,
      15000
    ) as LidarrAlbum[];
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
    const _qualitySettings = mobileOptimization.getQualitySettings();

    // Search artists and albums concurrently
    const [artists, albums] = await Promise.all([
      searchArtists(query),
      searchAlbums(query),
    ]);

    return { artists, albums };
  } catch (error) {
    console.error('Search error:', error);
    throw new ServiceError('LIDARR_API_ERROR', `Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Alias for backward compatibility
export const searchArtist = searchArtists;

export async function addArtist(artist: LidarrArtist, options?: { monitorAll?: boolean }): Promise<void> {
  try {
    const config = getConfig();

    // Get root folder to use default settings
    const rootFolders = await apiFetch('/rootFolder') as Array<{
      id: number;
      path: string;
      defaultQualityProfileId: number;
      defaultMetadataProfileId: number;
    }>;

    const rootFolder = rootFolders[0];
    if (!rootFolder) {
      throw new ServiceError('LIDARR_CONFIG_ERROR', 'No root folder configured in Lidarr');
    }

    // Artist is always monitored (required for Slskd to pick it up)
    // By default, NO albums are monitored initially - we selectively monitor specific albums
    // This prevents downloading entire discographies when we only want one song
    const shouldMonitorAll = options?.monitorAll ?? false;

    // Build the artist payload with required fields for adding
    const artistPayload = {
      foreignArtistId: artist.foreignArtistId,
      artistName: artist.artistName,
      qualityProfileId: config.lidarrQualityProfileId || rootFolder.defaultQualityProfileId || 1,
      metadataProfileId: rootFolder.defaultMetadataProfileId || 1,
      rootFolderPath: config.lidarrRootFolderPath || rootFolder.path,
      monitored: true,
      monitorNewItems: shouldMonitorAll ? 'all' : 'none', // Don't auto-monitor future albums
      tags: [],
      addOptions: {
        monitor: shouldMonitorAll ? 'all' : 'none', // Don't monitor any albums initially
        searchForMissingAlbums: shouldMonitorAll, // Only search if monitoring all
      },
    };

    await apiFetch('/artist', {
      method: 'POST',
      body: JSON.stringify(artistPayload),
    });
  } catch (error) {
    console.error('Error adding artist:', error);
    throw new ServiceError('LIDARR_API_ERROR', `Failed to add artist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Alias for the route
export const addArtistToQueue = addArtist;

/**
 * Search for an album by song title to find which album contains the song
 * Uses a longer timeout (15s) since album lookups query external MusicBrainz database
 */
export async function searchAlbumByTitle(songTitle: string, artistName?: string): Promise<LidarrAlbum[]> {
  try {
    const query = artistName ? `${artistName} ${songTitle}` : songTitle;
    // Use 15 second timeout for album lookups - they query external databases
    const data = await apiFetch(
      `/album/lookup?term=${encodeURIComponent(query)}`,
      {},
      DEFAULT_RETRY_CONFIG,
      15000
    ) as LidarrAlbum[];
    return data;
  } catch (error) {
    console.error('Error searching album by title:', error);
    return [];
  }
}

/**
 * Get all albums for an artist in Lidarr
 */
export async function getArtistAlbums(artistId: number): Promise<LidarrAlbum[]> {
  try {
    const data = await apiFetch(`/album?artistId=${artistId}`) as LidarrAlbum[];
    return data;
  } catch (error) {
    console.error('Error fetching artist albums:', error);
    return [];
  }
}

/**
 * Ensure an artist is monitored (required for Slskd to pick up albums)
 */
export async function ensureArtistMonitored(artistId: number): Promise<boolean> {
  try {
    // Get current artist data
    const artist = await apiFetch(`/artist/${artistId}`) as LidarrArtist & {
      monitored: boolean;
      qualityProfileId: number;
      metadataProfileId: number;
      rootFolderPath: string;
    };

    // If already monitored, nothing to do
    if (artist.monitored) {
      return true;
    }

    // Update to monitored
    console.log(`🎯 Enabling monitoring for artist "${artist.artistName}"`);
    await apiFetch(`/artist/${artistId}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...artist,
        monitored: true,
      }),
    });

    return true;
  } catch (error) {
    console.error('Error ensuring artist is monitored:', error);
    return false;
  }
}

/**
 * Monitor a specific album to trigger download
 */
export async function monitorAlbum(albumId: number, monitor: boolean = true): Promise<boolean> {
  try {
    // Get the current album data first
    const album = await apiFetch(`/album/${albumId}`) as LidarrAlbum & {
      monitored: boolean;
      anyReleaseOk: boolean;
      releases: unknown[];
    };

    // Update the monitored status
    await apiFetch(`/album/${albumId}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...album,
        monitored: monitor,
      }),
    });

    return true;
  } catch (error) {
    console.error('Error monitoring album:', error);
    return false;
  }
}

/**
 * Trigger a search for a specific album
 */
export async function searchForAlbum(albumId: number): Promise<boolean> {
  try {
    await apiFetch('/command', {
      method: 'POST',
      body: JSON.stringify({
        name: 'AlbumSearch',
        albumIds: [albumId],
      }),
    });
    return true;
  } catch (error) {
    console.error('Error searching for album:', error);
    return false;
  }
}

/**
 * Find the artist ID for an artist name in Lidarr's local database
 */
export async function findArtistByName(artistName: string): Promise<LidarrArtist | null> {
  try {
    const artists = await getArtists();
    // Case-insensitive match
    const artist = artists.find(a =>
      a.artistName.toLowerCase() === artistName.toLowerCase()
    );
    return artist || null;
  } catch (error) {
    console.error('Error finding artist by name:', error);
    return null;
  }
}

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
  status: 'completed' | 'failed' | 'grabbed' | 'importing';
  addedAt: string;
  completedAt: string;
  size?: number;
  errorMessage?: string;
  eventType?: string; // Original Lidarr event type for debugging
}

/**
 * Get current download queue
 * Lidarr API returns paginated data: { page, pageSize, totalRecords, records: [...] }
 */
export async function getDownloadQueue(): Promise<DownloadQueueItem[]> {
  try {
    const response = await apiFetch('/queue?pageSize=50') as {
      page: number;
      pageSize: number;
      totalRecords: number;
      records: Array<{
        id: number | string;
        title?: string;
        status?: string;
        trackedDownloadStatus?: string;
        trackedDownloadState?: string;
        statusMessages?: Array<{ title: string; messages: string[] }>;
        errorMessage?: string;
        sizeleft?: number;
        size?: number;
        timeleft?: string;
        estimatedCompletionTime?: string;
        added?: string;
        artist?: { artistName: string; foreignArtistId: string };
        album?: { title: string };
        quality?: { quality: { name: string } };
        downloadClient?: string;
        outputPath?: string;
      }>;
    };

    return response.records.map(item => {
      // Calculate progress from size and sizeleft
      const progress = item.size && item.sizeleft !== undefined
        ? Math.round(((item.size - item.sizeleft) / item.size) * 100)
        : 0;

      // Determine status from Lidarr's tracking fields
      let status: DownloadQueueItem['status'] = 'queued';
      if (item.trackedDownloadState === 'downloading' || item.status === 'downloading') {
        status = 'downloading';
      } else if (item.trackedDownloadStatus === 'warning' || item.trackedDownloadStatus === 'error') {
        status = 'failed';
      } else if (item.status === 'completed' || item.trackedDownloadState === 'importPending') {
        status = 'downloaded';
      }

      // Extract error messages
      const errorMessages = item.statusMessages?.flatMap(sm => sm.messages) || [];
      const errorMessage = item.errorMessage || errorMessages.join('; ') || undefined;

      return {
        id: item.id.toString(),
        artistName: item.artist?.artistName || item.title || 'Unknown Artist',
        foreignArtistId: item.artist?.foreignArtistId || '',
        status,
        progress,
        estimatedCompletion: item.estimatedCompletionTime || item.timeleft,
        addedAt: item.added || new Date().toISOString(),
        startedAt: item.added,
        completedAt: undefined,
        errorMessage,
      };
    });
  } catch (error) {
    console.error('Error fetching download queue:', error);
    return [];
  }
}

/**
 * Get download history
 * Lidarr API returns paginated data with various eventTypes.
 * We filter for download-related events: grabbed, downloadFailed, downloadFolderImported, trackFileImported
 */
export async function getDownloadHistory(options?: {
  page?: number;
  pageSize?: number;
}): Promise<{ history: DownloadHistory[]; pagination: { page: number; pageSize: number; totalRecords: number; hasMore: boolean } }> {
  try {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;

    // Fetch more records to find actual download events (not just file retagging)
    const response = await apiFetch(`/history?page=${page}&pageSize=${pageSize}&sortKey=date&sortDirection=descending`) as {
      page: number;
      pageSize: number;
      totalRecords: number;
      records: Array<{
        id: number | string;
        artistId?: number;
        albumId?: number;
        trackId?: number;
        sourceTitle?: string;
        quality?: { quality: { name: string } };
        date?: string;
        eventType: string;
        data?: {
          droppedPath?: string;
          importedPath?: string;
          downloadClient?: string;
          downloadClientName?: string;
          message?: string;
          reason?: string;
          nzbInfoUrl?: string;
          downloadUrl?: string;
          size?: string;
        };
        downloadId?: string;
        album?: { title: string; artistId?: number };
        artist?: { artistName: string; foreignArtistId: string };
      }>;
    };

    // Filter for download-related events only
    const downloadEvents = ['grabbed', 'downloadFailed', 'downloadFolderImported', 'trackFileImported', 'albumImportIncomplete'];

    const history = response.records
      .filter(item => downloadEvents.includes(item.eventType))
      .map(item => {
        // Map Lidarr eventType to our status accurately
        // - grabbed: Lidarr sent the release to the download client (NOT completed!)
        // - downloadFailed: Download client reported failure
        // - albumImportIncomplete: Import had issues
        // - downloadFolderImported: Successfully imported from download folder
        // - trackFileImported: Individual track file was imported (true completion)
        let status: DownloadHistory['status'] = 'completed';
        if (item.eventType === 'downloadFailed' || item.eventType === 'albumImportIncomplete') {
          status = 'failed';
        } else if (item.eventType === 'grabbed') {
          status = 'grabbed'; // Sent to download client, NOT completed yet
        } else if (item.eventType === 'downloadFolderImported' || item.eventType === 'trackFileImported') {
          status = 'completed'; // Actually completed and imported
        }

        // Extract error message for failed downloads
        let errorMessage: string | undefined;
        if (status === 'failed') {
          errorMessage = item.data?.message || item.data?.reason || 'Download failed';
        }

        // Parse size if available
        const size = item.data?.size ? parseInt(item.data.size, 10) : undefined;

        return {
          id: item.id.toString(),
          artistName: item.artist?.artistName || item.sourceTitle?.split('/')[0] || 'Unknown Artist',
          foreignArtistId: item.artist?.foreignArtistId || '',
          status,
          addedAt: item.date || new Date().toISOString(),
          completedAt: item.date || new Date().toISOString(),
          size: isNaN(size as number) ? undefined : size,
          errorMessage,
          eventType: item.eventType, // Include for debugging
        };
      });

    return {
      history,
      pagination: {
        page: response.page,
        pageSize: response.pageSize,
        totalRecords: response.totalRecords,
        hasMore: response.page * response.pageSize < response.totalRecords,
      },
    };
  } catch (error) {
    console.error('Error fetching download history:', error);
    return {
      history: [],
      pagination: {
        page: 1,
        pageSize: 50,
        totalRecords: 0,
        hasMore: false,
      },
    };
  }
}

/**
 * Cancel a download from the queue
 */
export async function cancelDownload(downloadId: string): Promise<boolean> {
  try {
    await apiFetch(`/queue/${downloadId}?removeFromClient=true&blocklist=false`, {
      method: 'DELETE',
    });
    return true;
  } catch (error) {
    console.error('Error cancelling download:', error);
    return false;
  }
}

/**
 * Retry a failed download by removing it from queue and triggering a new search
 */
export async function retryDownload(downloadId: string, artistId?: string): Promise<boolean> {
  try {
    // First remove the failed download from queue (without blocklisting)
    await apiFetch(`/queue/${downloadId}?removeFromClient=true&blocklist=false`, {
      method: 'DELETE',
    });

    // If we have an artistId, trigger a search for missing albums
    if (artistId) {
      await apiFetch('/command', {
        method: 'POST',
        body: JSON.stringify({
          name: 'ArtistSearch',
          artistId: parseInt(artistId, 10),
        }),
      });
    }

    return true;
  } catch (error) {
    console.error('Error retrying download:', error);
    return false;
  }
}

/**
 * Lidarr command status (for tracking active searches)
 */
export interface LidarrCommand {
  id: number;
  name: string;
  status: 'queued' | 'started' | 'completed' | 'failed';
  started?: string;
  ended?: string;
  duration?: string;
  body?: {
    albumIds?: number[];
    artistId?: number;
  };
}

/**
 * Get active/recent commands from Lidarr (shows search activity)
 */
export async function getActiveCommands(): Promise<LidarrCommand[]> {
  try {
    const commands = await apiFetch('/command') as LidarrCommand[];
    // Return commands from the last hour that are searches
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    return commands.filter(cmd =>
      (cmd.name === 'AlbumSearch' || cmd.name === 'ArtistSearch') &&
      (cmd.status === 'queued' || cmd.status === 'started' ||
       (cmd.started && cmd.started > oneHourAgo))
    );
  } catch (error) {
    console.error('Error fetching active commands:', error);
    return [];
  }
}

/**
 * Get wanted/missing albums (albums Lidarr is searching for but hasn't found)
 */
export interface WantedAlbum {
  id: string;
  title: string;
  artistName: string;
  artistId: string;
  releaseDate?: string;
  monitored: boolean;
  // Enhanced status fields for Soulseek tracking
  searchStatus?: 'idle' | 'searching' | 'searched_recently';
  lastSearched?: string;
  grabbed?: boolean;
}

export async function getWantedMissing(): Promise<WantedAlbum[]> {
  try {
    // Fetch wanted albums and active commands in parallel
    const [response, activeCommands] = await Promise.all([
      apiFetch('/wanted/missing?pageSize=50&sortKey=releaseDate&sortDirection=descending') as Promise<{
        page: number;
        pageSize: number;
        totalRecords: number;
        records: Array<{
          id: number;
          title: string;
          artistId: number;
          releaseDate?: string;
          monitored: boolean;
          grabbed?: boolean;
          artist?: {
            artistName: string;
          };
        }>;
      }>,
      getActiveCommands(),
    ]);

    // Build a set of album IDs that are actively being searched
    const searchingAlbumIds = new Set<number>();
    const searchedAlbumIds = new Map<number, string>(); // albumId -> lastSearched time
    const searchingArtistIds = new Set<number>();

    for (const cmd of activeCommands) {
      if (cmd.name === 'AlbumSearch' && cmd.body?.albumIds) {
        for (const albumId of cmd.body.albumIds) {
          if (cmd.status === 'queued' || cmd.status === 'started') {
            searchingAlbumIds.add(albumId);
          } else if (cmd.status === 'completed' && cmd.ended) {
            searchedAlbumIds.set(albumId, cmd.ended);
          }
        }
      } else if (cmd.name === 'ArtistSearch' && cmd.body?.artistId) {
        if (cmd.status === 'queued' || cmd.status === 'started') {
          searchingArtistIds.add(cmd.body.artistId);
        }
      }
    }

    return response.records.map(album => {
      let searchStatus: 'idle' | 'searching' | 'searched_recently' = 'idle';
      let lastSearched: string | undefined;

      if (searchingAlbumIds.has(album.id) || searchingArtistIds.has(album.artistId)) {
        searchStatus = 'searching';
      } else if (searchedAlbumIds.has(album.id)) {
        searchStatus = 'searched_recently';
        lastSearched = searchedAlbumIds.get(album.id);
      }

      return {
        id: album.id.toString(),
        title: album.title,
        artistName: album.artist?.artistName || 'Unknown Artist',
        artistId: album.artistId.toString(),
        releaseDate: album.releaseDate,
        monitored: album.monitored,
        searchStatus,
        lastSearched,
        grabbed: album.grabbed,
      };
    });
  } catch (error) {
    console.error('Error fetching wanted/missing:', error);
    return [];
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
  totalWanted: number;
  totalSize: number;
}> {
  try {
    const [queue, historyResult, wanted] = await Promise.all([
      getDownloadQueue(),
      getDownloadHistory(),
      getWantedMissing(),
    ]);

    const history = historyResult.history;
    return {
      totalQueued: queue.filter(item => item.status === 'queued').length,
      totalDownloading: queue.filter(item => item.status === 'downloading').length,
      totalCompleted: history.filter(item => item.status === 'completed').length,
      totalFailed: queue.filter(item => item.status === 'failed').length + history.filter(item => item.status === 'failed').length,
      totalWanted: wanted.length,
      totalSize: history.reduce((sum, item) => sum + (item.size || 0), 0),
    };
  } catch (error) {
    console.error('Error fetching download stats:', error);
    return {
      totalQueued: 0,
      totalDownloading: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalWanted: 0,
      totalSize: 0,
    };
  }
}

/**
 * Monitor download progress (for real-time updates)
 */
export async function monitorDownloads(options?: {
  historyPage?: number;
  historyPageSize?: number;
}): Promise<{
  queue: DownloadQueueItem[];
  history: DownloadHistory[];
  historyPagination: { page: number; pageSize: number; totalRecords: number; hasMore: boolean };
  wanted: WantedAlbum[];
  stats: Awaited<ReturnType<typeof getDownloadStats>>;
}> {
  try {
    const [queue, historyResult, wanted, stats] = await Promise.all([
      getDownloadQueue(),
      getDownloadHistory({ page: options?.historyPage, pageSize: options?.historyPageSize }),
      getWantedMissing(),
      getDownloadStats(),
    ]);

    return { queue, history: historyResult.history, historyPagination: historyResult.pagination, wanted, stats };
  } catch (error) {
    console.error('Error monitoring downloads:', error);
    return {
      queue: [],
      history: [],
      historyPagination: { page: 1, pageSize: 50, totalRecords: 0, hasMore: false },
      wanted: [],
      stats: {
        totalQueued: 0,
        totalDownloading: 0,
        totalCompleted: 0,
        totalFailed: 0,
        totalWanted: 0,
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
    // Fetch all history for export (large page size)
    const { history } = await getDownloadHistory({ pageSize: 1000 });
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