import { getConfig } from '@/lib/config/config';

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
  albumId: string;
  artistId?: string;
  album?: string;
  path?: string;
  duration: number;
  track: number;
  trackNumber?: number; // From search2
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
export { token };
let clientId: string | null = null;
export { clientId };
let subsonicToken: string | null = null;
export { subsonicToken };
let subsonicSalt: string | null = null;
export { subsonicSalt };
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
    subsonicToken = data.subsonicToken as string;
    subsonicSalt = data.subsonicSalt as string;
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

export async function getArtists(start: number = 0, limit: number = 1000): Promise<Artist[]> {
  try {
    const endpoint = `/api/artist?_start=${start}&_end=${start + limit - 1}`;
    const data = await apiFetch(endpoint) as Artist[];
    return data || [];
  } catch (error) {
    throw new Error(`Failed to fetch artists: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getArtistDetail(id: string): Promise<ArtistDetail> {
  try {
    const data = await apiFetch(`/api/artist/${id}`) as ArtistDetail;
    return data;
  } catch (error) {
    throw new Error(`Failed to fetch artist detail: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    throw new Error(`Failed to fetch artists with details: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      url: `/api/navidrome/stream/${song.id}`,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new Error(`Failed to fetch songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function search(query: string, start: number = 0, limit: number = 5): Promise<Song[]> { // Limit to 5 for better performance

  try {
    const config = getConfig();
    if (!config.navidromeUrl) {
      throw new Error('Navidrome URL not configured');
    }

    // Parse query for artist and title if possible
    const match = query.match(/^(.+?)\s*-\s*(.+)$/);
    const artist = match ? match[1].trim() : '';
    const title = match ? match[2].trim() : query;

    let data: RawSong[] = [];

    if (artist && title) {
      // First, search for the artist
      const artistSearchEndpoint = `/api/artist?fullText=${encodeURIComponent(artist)}&_start=0&_end=1`;
      console.log(`Searching for artist:`, artistSearchEndpoint);
      const artistResults = await apiFetch(artistSearchEndpoint) as Artist[];
      if (artistResults && artistResults.length > 0) {
        const artistId = artistResults[0].id;
        console.log(`Found artist ID: ${artistId} for ${artist}`);
        // Fetch all songs for the artist and filter client-side for title
        const allSongsEndpoint = `/api/song?artist_id=${artistId}&_start=0&_end=100`; // Fetch up to 100 songs
        console.log(`Fetching all songs for artist:`, allSongsEndpoint);
        const allSongs = await apiFetch(allSongsEndpoint) as RawSong[];
        console.log(`Fetched ${allSongs.length} songs for artist`);
        data = allSongs.filter(song => {
          const songName = (song.name || song.title || '').toLowerCase();
          return songName.includes(title.toLowerCase());
        });
        console.log(`Filtered to ${data.length} songs matching title`);
      }
    }

    if (data.length === 0) {
      // Fallback to general search
      const searchParams = [
        { param: 'fullText', value: query },
        { param: 'title', value: title },
      ];
      for (const param of searchParams) {
        try {
          const endpoint = `/api/song?${param.param}=${encodeURIComponent(param.value)}&_start=${start}&_end=${start + limit - 1}`;
          console.log(`Fallback search with parameter ${param.param}:`, endpoint);
          data = await apiFetch(endpoint) as RawSong[];
          if (data && data.length > 0) {
            console.log(`Fallback search returned ${data.length} results`);
            break;
          }
        } catch (paramError) {
          console.log(`Fallback search failed:`, paramError);
          continue;
        }
      }
    }

    if (data.length === 0) {
      console.log('No results found');
      return [];
    }

    const songs = data.slice(0, limit).map((song) => ({
      ...song,
      name: song.name || song.title || 'Unknown Title',
      url: `/api/navidrome/stream/${song.id}`,
    })) as Song[];
    
    console.log('Final processed search results:', songs.length, 'songs');
    return songs;
  } catch (error) {
    console.error('Comprehensive search error:', error);
    throw new Error(`Failed to search music: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    throw new Error(`Failed to fetch global songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    throw new Error(`Failed to fetch library summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}