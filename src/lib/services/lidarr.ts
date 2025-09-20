// Lidarr service for music download management
import { getConfig } from '../config/config';

const LIDARR_BASE_URL = getConfig().lidarrUrl || 'http://localhost:8686';
const LIDARR_API_KEY = getConfig().lidarrApiKey;

if (!LIDARR_API_KEY) {
  console.warn('Lidarr API key not configured');
}

export interface ArtistSearchResult {
  id: number;
  foreignArtistId: string;
  artistName: string;
  artistNameFull: string;
  artistImage: string;
  artistGenres: string[];
  artistLinks: { url: string; title: string }[];
  artistStats: {
    albumCount: number;
    songCount: number;
    totalDuration: number;
  };
  albums: Array<{
    id: number;
    foreignAlbumId: string;
    title: string;
    artistTitle: string;
    artistId: number;
    releaseDate: string;
    releaseYear: number;
    primaryAlbumType: string;
    secondaryAlbumTypes: string[];
    albumImage: string;
    albumGenres: string[];
    albumLinks: { url: string; title: string }[];
    albumStats: {
      songCount: number;
      totalDuration: number;
    };
  }>;
}

export interface AddArtistRequest {
  artistId: string; // Foreign ID from search (MusicBrainz string)
  monitor: boolean;
  monitorDiscography: boolean;
  qualityProfileId: number; // Default to 1
  rootFolderPath: string; // Default '/music'
  addAlbums: boolean;
}

export class LidarrError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'LidarrError';
  }
}

async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const url = `${LIDARR_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Api-Key': LIDARR_API_KEY!,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new LidarrError('API_ERROR', `Lidarr API error: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new LidarrError('TIMEOUT_ERROR', 'Lidarr request timed out after 10s');
    }
    throw error;
  }
}

// Search for artist by name
export async function searchArtist(term: string): Promise<ArtistSearchResult[]> {
  if (!LIDARR_API_KEY) {
    throw new LidarrError('CONFIG_ERROR', 'Lidarr API key not configured');
  }

  try {
    const response = await apiFetch(`/api/v1/artist/lookup?term=${encodeURIComponent(term)}`);
    const data = await response.json() as unknown;
    if (data && typeof data === 'object' && (data.message || data.error)) {
      throw new LidarrError('METADATA_ERROR', data.message || data.error || 'Lidarr metadata service failed');
    }
    return data as ArtistSearchResult[] || [];
  } catch (error) {
    console.error('Lidarr artist search failed:', error);
    throw new LidarrError('SEARCH_ERROR', `Failed to search artist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Search for album by title/artist
export async function searchAlbum(albumTitle: string, artistName?: string): Promise<ArtistSearchResult[]> {
  if (!LIDARR_API_KEY) {
    throw new LidarrError('CONFIG_ERROR', 'Lidarr API key not configured');
  }

  const term = artistName ? `${albumTitle} ${artistName}` : albumTitle;
  try {
    const data = await apiFetch(`/api/v1/artist/lookup?term=${encodeURIComponent(term)}`) as ArtistSearchResult[];
    return data || [];
  } catch (error) {
    console.error('Lidarr album search failed:', error);
    throw new LidarrError('SEARCH_ERROR', `Failed to search album: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Add artist to Lidarr library/queue
export async function addArtistToQueue(foreignArtistId: string, artistName: string): Promise<{ success: boolean; message: string }> {
  if (!LIDARR_API_KEY) {
    throw new LidarrError('CONFIG_ERROR', 'Lidarr API key not configured');
  }

  try {
    // First, lookup to get artist details if needed, but for add, use /api/v1/artist
    // Actually, to add new artist: POST /api/v1/artist with body
    const config = getConfig();
    const addRequest: AddArtistRequest = {
      artistId: foreignArtistId, // Foreign ID as string for MusicBrainz
      monitor: true,
      monitorDiscography: true,
      qualityProfileId: config.lidarrQualityProfileId || 1,
      rootFolderPath: config.lidarrRootFolderPath || '/music',
      addAlbums: true,
    };
    console.log('Lidarr add request body:', addRequest); // Debug

    const response = await apiFetch('/api/v1/artist', {
      method: 'POST',
      body: JSON.stringify(addRequest),
    });

    console.log(`Added artist "${artistName}" to Lidarr queue:`, response);
    return { success: true, message: `Added "${artistName}" to Lidarr download queue.` };
  } catch (error) {
    console.error('Failed to add artist to Lidarr:', error);
    throw new LidarrError('ADD_ERROR', `Failed to add artist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Get wanted/missing items (queue status)
export async function getDownloadQueue(): Promise<unknown[]> {
  if (!LIDARR_API_KEY) {
    throw new LidarrError('CONFIG_ERROR', 'Lidarr API key not configured');
  }

  try {
    const data = await apiFetch('/api/v1/wanted/missing?includeArtist=true&includeAlbum=true') as unknown[];
    return data || [];
  } catch (error) {
    console.error('Failed to fetch download queue:', error);
    throw new LidarrError('QUEUE_ERROR', `Failed to fetch queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}