import { getConfig } from '@/lib/config/config';

export type Artist = {
  id: string;
  name: string;
  genre?: string;
  year?: number;
};

export interface RawSong {
  id: string;
  name: string;
  albumId: string;
  duration: number;
  track: number;
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
  albumId: string;
  duration: number;
  track: number;
  url: string;
};

let token: string | null = null;
let clientId: string | null = null;
let tokenExpiry = 0;
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry

export async function getAuthToken(): Promise<string> {
  const config = getConfig();
  if (!config.navidromeUrl || !config.navidromeUsername || !config.navidromePassword) {
    throw new Error('Navidrome credentials incomplete');
  }

  const now = Date.now();
  if (token && now < tokenExpiry - TOKEN_REFRESH_THRESHOLD) {
    return token;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${config.navidromeUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: config.navidromeUsername,
        password: config.navidromePassword,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Login failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.token || !data.id) {
      throw new Error('No token or id received from login');
    }
    token = data.token as string;
    clientId = data.id as string;
    tokenExpiry = now + 3600 * 1000; // Assume 1 hour
    return token as string;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Login request timed out');
    }
    throw new Error(`Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  let retries = 0;
  const maxRetries = 1; // Retry once on 401

  while (retries <= maxRetries) {
    const authToken = await getAuthToken();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const ndId = clientId;
      if (!ndId) {
        throw new Error('Client ID not available');
      }
      const response = await fetch(`${getConfig().navidromeUrl}${endpoint}`, {
        ...options,
        headers: {
          'x-nd-authorization': `Bearer ${authToken}`,
          'x-nd-client-unique-id': ndId,
          ...options.headers,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.status === 401) {
        token = null; // Invalidate token
        clientId = null;
        retries++;
        continue;
      }

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('API request timed out (5s limit)');
      }
      if (retries < maxRetries) {
        retries++;
        continue;
      }
      throw new Error(`API fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  throw new Error('Max retries exceeded for API request');
}

export async function getArtists(start: number = 0, limit: number = 50, genre?: string, year?: number): Promise<Artist[]> {
  try {
    let endpoint = `/api/artist?_start=${start}&_end=${start + limit - 1}`;
    if (genre) endpoint += `&genre=${encodeURIComponent(genre)}`;
    if (year) endpoint += `&year=${year}`;
    const data = await apiFetch(endpoint) as Artist[];
    return data || [];
  } catch (error) {
    throw new Error(`Failed to fetch artists: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getAlbums(artistId: string, start: number = 0, limit: number = 50): Promise<Album[]> {
  try {
    const data = await apiFetch(`/api/album?artist_id=${artistId}&_start=${start}&_end=${start + limit - 1}`) as Album[];
    return data || [];
  } catch (error) {
    throw new Error(`Failed to fetch albums: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getSongs(albumId: string, start: number = 0, limit: number = 50): Promise<Song[]> {
  try {
    const data = await apiFetch(`/api/song?album_id=${albumId}&_start=${start}&_end=${start + limit - 1}`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/api/song/${song.id}/stream`,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new Error(`Failed to fetch songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function search(query: string, start: number = 0, limit: number = 50): Promise<Song[]> {
  try {
    const data = await apiFetch(`/api/song?name=${encodeURIComponent(query)}&_start=${start}&_end=${start + limit - 1}`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/api/song/${song.id}/stream`,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new Error(`Failed to search music: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}