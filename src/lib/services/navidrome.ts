import { getConfig } from '@/lib/config/config';
import { mobileOptimization } from '@/lib/performance/mobile-optimization';
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
  title?: string;
  artistId?: string;
  album?: string;
  trackNumber?: number;
  explicitContent?: 'true' | 'false' | boolean;
  discNumber?: string | number;
};


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
  if (!config.navidromeUrl) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome URL not configured');
  }

  const username = config.navidromeUsername;
  const password = config.navidromePassword;
  if (!username || !password) {
    throw new ServiceError('NAVIDROME_CONFIG_ERROR', 'Navidrome credentials incomplete');
  }

  const now = Date.now();
  if (token && now < tokenExpiry - TOKEN_REFRESH_THRESHOLD) {
    return token;
  }

  // Use adaptive timeout based on network conditions
  const adaptiveTimeout = mobileOptimization.getAdaptiveTimeout();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);

  try {
    const response = await fetch(`${config.navidromeUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
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
      throw new ServiceError('NAVIDROME_TIMEOUT_ERROR', `Login request timed out (${adaptiveTimeout}ms)`);
    }
    throw new ServiceError('NAVIDROME_AUTH_ERROR', `Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  let retries = 0;
  const maxRetries = 1; // Retry once on 401

  while (retries <= maxRetries) {
    const authToken = await getAuthToken();

    // Use adaptive timeout based on network conditions
    const adaptiveTimeout = mobileOptimization.getAdaptiveTimeout();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);

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
        throw new ServiceError('NAVIDROME_TIMEOUT_ERROR', `API request timed out (${adaptiveTimeout}ms limit)`);
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

    // Check cache first for mobile devices
    const cacheKey = `navidrome_search_${query}_${start}_${limit}`;
    const cached = mobileOptimization.getCache<Song[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Check if query is in "Artist - Title" format
    const artistTitleMatch = query.match(/^(.+?)\s*-\s*(.+)$/);
    if (artistTitleMatch) {
      const resolvedSong = await resolveSongByArtistTitle(query);
      if (resolvedSong) {
        // Cache the result
        mobileOptimization.setCache(cacheKey, [resolvedSong], 300000);
        return [resolvedSong];
      }
      // If not found, continue with general search
    }

    // Use mobile-optimized batched requests
    const qualitySettings = mobileOptimization.getQualitySettings();
    
    // For individual song lookup, prioritize direct song search first
    // Use Subsonic API for song search
    const songEndpoint = `/rest/search.view?query=${encodeURIComponent(query)}&songCount=${limit}&artistCount=0&albumCount=0&offset=${start}`;
    console.log('Searching songs with Subsonic endpoint:', songEndpoint);

    let songs: Song[] = [];
    
    try {
      const response = await apiFetch(songEndpoint) as SubsonicSearchResponse;
      if (response.searchResult?.song && response.searchResult.song.length > 0) {
        songs = response.searchResult.song.map((song: SubsonicSong) => ({
          id: song.id,
          name: song.title,
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
      console.log('Direct song search failed:', error);
    }

    // If no direct song matches, try album search with batching for mobile
    if (songs.length === 0) {
      try {
        const albumEndpoint = `/api/album?name=${encodeURIComponent(query)}&_start=0&_end=${Math.min(10, qualitySettings.preloadCount)}`;
        const albums = await apiFetch(albumEndpoint) as Album[];
        if (albums && albums.length > 0) {
          // Get songs for each album with mobile-optimized batching
          const albumSongs = await mobileOptimization.batchRequests(
            albums.map(album => () => getSongs(album.id, 0, 50)),
            qualitySettings.concurrentRequests
          );
          songs = albumSongs.flat().slice(start, start + limit);
        }
      } catch (albumError) {
        console.log('Album search failed, trying artist search:', albumError);
      }
    }

    // Finally, try artist search with batching for mobile
    if (songs.length === 0) {
      try {
        const artistEndpoint = `/api/artist?name=${encodeURIComponent(query)}&_start=0&_end=${Math.min(4, qualitySettings.preloadCount)}`;
        const artists = await apiFetch(artistEndpoint) as Artist[];
        if (artists && artists.length > 0) {
          // Get top songs for each artist with mobile-optimized batching
          const artistSongs = await mobileOptimization.batchRequests(
            artists.map(artist => () => getTopSongs(artist.id, 10)),
            qualitySettings.concurrentRequests
          );
          songs = artistSongs.flat().slice(start, start + limit);
        }
      } catch (artistError) {
        console.log('Artist search failed:', artistError);
      }
    }

    // Cache the result for mobile devices
    mobileOptimization.setCache(cacheKey, songs, 300000);

    // If no songs found anywhere, return empty array
    return songs;

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
    const topArtists = await getArtistsWithDetails(0, 15); // Increased to 15 for more variety
    const topSongs = await getSongsGlobal(0, 10); // Increased to 10 for more variety
    console.log(`📚 Library summary: ${topArtists.length} artists, ${topSongs.length} songs`);
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

/**
 * Resolve a song by parsing "Artist - Title" format
 * Searches for songs by the artist with matching title
 */
export async function resolveSongByArtistTitle(artistTitle: string): Promise<Song | null> {
  try {
    const match = artistTitle.match(/^(.+?)\s*-\s*(.+)$/);
    if (!match) {
      // Not in "Artist - Title" format, fallback to general search
      const songs = await search(artistTitle, 0, 1);
      return songs[0] || null;
    }

    const artistName = match[1].trim();
    const songTitle = match[2].trim();

    // First, find the artist
    const artists = await getArtistsWithDetails(0, 100); // Get more artists
    const artist = artists.find(a => a.name.toLowerCase() === artistName.toLowerCase());
    if (!artist) {
      // Artist not found, fallback to general search
      const songs = await search(artistTitle, 0, 1);
      return songs[0] || null;
    }

    // Get artist's albums
    const albums = await getAlbums(artist.id, 0, 50);
    for (const album of albums) {
      try {
        const songs = await getSongs(album.id, 0, 50);
        const song = songs.find(s => s.title?.toLowerCase() === songTitle.toLowerCase() || (s.name && s.name.toLowerCase() === songTitle.toLowerCase()));
        if (song) {
          return song;
        }
      } catch (error) {
        console.log(`Failed to get songs for album ${album.id}:`, error);
      }
    }

    // Song not found in albums, fallback to general search
    const songs = await search(songTitle, 0, 5);
    const song = songs.find(s => s.artist?.toLowerCase() === artistName.toLowerCase());
    return song || null;
  } catch (error) {
    console.error('Error resolving song by artist-title:', error);
    return null;
  }
}