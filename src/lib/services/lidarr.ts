// Lidarr service for music download management
import { getConfig } from '../config/config';
import { ServiceError } from '../utils';

const LIDARR_BASE_URL = getConfig().lidarrUrl || 'http://localhost:8686';

let cachedKey: string | null = null;
let cryptoKey: CryptoKey | null = null;

export function resetCache() {
  cachedKey = null;
  cryptoKey = null;
}

async function deriveKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('lidarr-salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptKey(key: string): Promise<string> {
  if (!cryptoKey) {
    cryptoKey = await deriveKey('lidarr-encryption-key');
  }
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encoder.encode(key)
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptKey(encryptedKey: string): Promise<string> {
  if (!cryptoKey) {
    cryptoKey = await deriveKey('lidarr-encryption-key');
  }
  const binary = atob(encryptedKey);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export async function getApiKey(): Promise<string> {
  if (cachedKey) return cachedKey;

  const configKey = getConfig().lidarrApiKey;
  if (!configKey) {
    throw new ServiceError('CONFIG_ERROR', 'Lidarr API key not configured');
  }

  // Store encrypted in sessionStorage if not present
  const sessionKey = sessionStorage.getItem('lidarr_encrypted_key');
  if (sessionKey) {
    cachedKey = await decryptKey(sessionKey);
  } else {
    const encrypted = await encryptKey(configKey);
    sessionStorage.setItem('lidarr_encrypted_key', encrypted);
    cachedKey = configKey;
  }

  return cachedKey;
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
  artistId: string;
  monitor: boolean;
  monitorDiscography: boolean;
  qualityProfileId: number; // Default to 1
  rootFolderPath: string; // Default '/music'
  addAlbums: boolean;
}


export async function apiFetch(endpoint: string, options: RequestInit = {}, attempt = 1): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout per story

  try {
    const url = `${LIDARR_BASE_URL}${endpoint}`;
    const apiKey = await getApiKey();
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new ServiceError('API_ERROR', `Lidarr API error: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ServiceError('TIMEOUT_ERROR', 'Lidarr request timed out after 10s');
    }

    // Retry logic for transient errors (network, 5xx)
    if (attempt < 3 && (error instanceof ServiceError && (error.code === 'TIMEOUT_ERROR' || error.code.startsWith('5')) || error instanceof TypeError)) {
      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
      return apiFetch(endpoint, options, attempt + 1);
    }

    throw error;
  }
}

// Search for artist by name
export async function searchArtist(term: string, limit: number = 20): Promise<ArtistSearchResult[]> {
  try {
    const params = new URLSearchParams({ term: term, limit: limit.toString() });
    const response = await apiFetch(`/api/v1/artist/lookup?${params}`);
    if (response && typeof response === 'object' && 'message' in response) {
      throw new ServiceError('METADATA_ERROR', (response as { message?: string }).message || 'Lidarr metadata service failed');
    }
    return response as ArtistSearchResult[] || [];
  } catch (error) {
    throw new ServiceError('SEARCH_ERROR', `Failed to search artist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Search for album by title/artist
export async function searchAlbum(albumTitle: string, artistName?: string, limit: number = 20): Promise<ArtistSearchResult[]> {
  const term = artistName ? `${albumTitle} ${artistName}` : albumTitle;
  try {
    const params = new URLSearchParams({ term: term, limit: limit.toString() });
    const data = await apiFetch(`/api/v1/artist/lookup?${params}`) as ArtistSearchResult[];
    return data || [];
  } catch (error) {
    throw new ServiceError('SEARCH_ERROR', `Failed to search album: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Add artist to Lidarr library/queue
export async function addArtistToQueue(foreignArtistId: string, artistName: string): Promise<{ success: boolean; message: string }> {
  try {
    // First, lookup to get artist details if needed, but for add, use /api/v1/artist
    // Actually, to add new artist: POST /api/v1/artist with body
    const config = getConfig();
    const addRequest: AddArtistRequest = {
      artistId: foreignArtistId, // Foreign ID as string for MusicBrainz
      monitor: true,
      monitorDiscography: true,
      qualityProfileId: (config as any).lidarrQualityProfileId || 1,
      rootFolderPath: (config as any).lidarrRootFolderPath || '/music',
      addAlbums: true,
    };

    // Response not used as success is implied by no error
    await apiFetch('/api/v1/artist', {
      method: 'POST',
      body: JSON.stringify(addRequest),
    });

    return { success: true, message: `Added "${artistName}" to Lidarr download queue.` };
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'CONFIG_ERROR') {
      throw error;
    }
    throw new ServiceError('API_ERROR', `Failed to add artist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Get wanted/missing items (queue status)
export async function getDownloadQueue(): Promise<unknown[]> {
  try {
    const data = await apiFetch('/api/v1/wanted/missing?includeArtist=true&includeAlbum=true') as unknown[];
    return data || [];
  } catch (error) {
    throw new ServiceError('QUEUE_ERROR', `Failed to fetch queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}