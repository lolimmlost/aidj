import { getConfig } from '@/lib/config/config';
import { ServiceError } from '../utils';

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
}

interface SubsonicSearchResponse {
  searchResult: {
    song: SubsonicSong[];
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
};

interface NativeSong {
  id: string;
  title: string;
  artist?: string;
  albumId: string;
  artistId?: string;
  album?: string;
  duration: number;
  trackNumber?: number;
  explicitContent?: 'true' | 'false' | boolean;
  discNumber?: string;
}

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

export function resetAuthState() {
  token = null;
  clientId = null;
  subsonicToken = null;
  subsonicSalt = null;
  tokenExpiry = 0;
}

const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry

export async function getAuthToken(): Promise<string> {
  const config = getConfig();
  if (!config.navidromeUrl || !config.navidromeUsername || !config.navidromePassword) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome credentials incomplete');
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
      throw new ServiceError('NAVIDROME_AUTH_ERROR', `Login failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.token || !data.id) {
      throw new ServiceError('NAVIDROME_AUTH_ERROR', 'No token or id received from login');
    }
    token = data.token as string;
    clientId = data.id as string;
    subsonicToken = data.subsonicToken as string;
    subsonicSalt = data.subsonicSalt as string;
    tokenExpiry = now + 3600 * 1000; // Assume 1 hour
    return token as string;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServiceError('NAVIDROME_TIMEOUT_ERROR', 'Login request timed out');
    }
    throw new ServiceError('NAVIDROME_AUTH_ERROR', `Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      const config = getConfig();
      const ndId = clientId;
      if (!ndId) {
        throw new ServiceError('NAVIDROME_CLIENT_ERROR', 'Client ID not available');
      }

      let url = `${config.navidromeUrl}${endpoint}`;
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
        const params = new URLSearchParams({
          u: ndId,
          t: subsonicToken || '',
          s: subsonicSalt || '',
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

      if (response.status === 401) {
        token = null; // Invalidate token
        clientId = null;
        retries++;
        continue;
      }

      if (!response.ok) {
        throw new ServiceError('NAVIDROME_API_ERROR', `API request failed: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceError('NAVIDROME_TIMEOUT_ERROR', 'API request timed out (5s limit)');
      }
      if (retries < maxRetries) {
        retries++;
        continue;
      }
      throw new ServiceError('NAVIDROME_API_ERROR', `API fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    await getAuthToken(); // Ensure auth

    // First, try album search for better results
    try {
      const albumEndpoint = `/api/album?name=${encodeURIComponent(query)}&_start=0&_end=10`;
      const albums = await apiFetch(albumEndpoint) as Album[];
      if (albums && albums.length > 0) {
        // Get songs for each album
        const allSongs: Song[] = [];
        for (const album of albums) {
          try {
            const songs = await getSongs(album.id, 0, 50);
            allSongs.push(...songs);
          } catch (error) {
            console.log(`Failed to get songs for album ${album.id}:`, error);
          }
        }
        // Return songs, limited to the requested limit
        return allSongs.slice(start, start + limit);
      }
    } catch (albumError) {
      console.log('Album search failed, trying artist search:', albumError);
    }

    // Then, try artist search
    try {
      const artistEndpoint = `/api/artist?name=${encodeURIComponent(query)}&_start=0&_end=4`;
      const artists = await apiFetch(artistEndpoint) as Artist[];
      if (artists && artists.length > 0) {
        // Get top songs for each artist
        const allSongs: Song[] = [];
        for (const artist of artists) {
          try {
            const topSongs = await getTopSongs(artist.id, 10);
            allSongs.push(...topSongs);
          } catch (error) {
            console.log(`Failed to get top songs for artist ${artist.id}:`, error);
          }
        }
        // Return songs, limited to the requested limit
        return allSongs.slice(start, start + limit);
      }
    } catch (artistError) {
      console.log('Artist search failed, falling back to song search:', artistError);
    }

    // Fallback to song search if no artists found
    // Use Subsonic API for search
    const endpoint = `/rest/search.view?query=${encodeURIComponent(query)}&songCount=${limit}&artistCount=0&albumCount=0&offset=${start}`;
    console.log('Searching with Subsonic endpoint:', endpoint);

    try {
      const response = await apiFetch(endpoint) as SubsonicSearchResponse;
      if (response.searchResult?.song) {
        return response.searchResult.song.map((song: SubsonicSong) => ({
          id: song.id,
          name: `${song.artist} - ${song.title}`,
          title: song.title,
          artist: song.artist || 'Unknown Artist',
          albumId: song.albumId,
          artistId: song.artistId,
          album: song.album,
          duration: parseInt(song.duration) || 0,
          track: parseInt(song.track) || 0,
          trackNumber: parseInt(song.track) || 0,
          url: `/api/navidrome/stream/${song.id}`,
        }));
      }
    } catch (error) {
      console.log('Subsonic search failed:', error);
      throw new ServiceError('NAVIDROME_API_ERROR', `Subsonic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // If Subsonic fails, try native API as fallback
    try {
      const nativeEndpoint = `/api/song?fullText=${encodeURIComponent(query)}&_start=${start}&_end=${start + limit - 1}`;
      const nativeData = await apiFetch(nativeEndpoint) as NativeSong[];
      return nativeData.map((song: NativeSong) => ({
        id: song.id as string,
        name: song.title || 'Unknown Title',
        title: song.title,
        artist: song.artist || 'Unknown Artist',
        albumId: song.albumId as string,
        artistId: song.artistId ? song.artistId : null,
        album: song.album,
        duration: song.duration || 0,
        track: Number(song.trackNumber || 1),
        trackNumber: Number(song.trackNumber || 1),
        url: `/api/navidrome/stream/${song.id}`,
        explicitContent: song.explicitContent === 'true',
        discNumber: song.discNumber ? parseInt(song.discNumber) : 1,
      }));
    } catch (nativeError) {
      console.log('Native search failed:', nativeError);
      throw new ServiceError('NAVIDROME_API_ERROR', `Native search failed: ${nativeError instanceof Error ? nativeError.message : 'Unknown error'}`);
    }

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
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch global songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export interface LibrarySummary {
  artists: Array<{ name: string; genres: string }>;
  songs: string[];
}

export async function getLibrarySummary(): Promise<LibrarySummary> {
  try {
    const topArtists = await getArtistsWithDetails(0, 20);
    const topSongs = await getSongsGlobal(0, 10);
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