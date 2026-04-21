import { getConfig } from '@/lib/config/config';
import { mobileOptimization } from '@/lib/performance/mobile-optimization';
import { ServiceError } from '../../utils';
import { apiFetch, getAuthToken, waitForRateLimit } from './core';
import type {
  Artist, ArtistDetail, ArtistWithDetails, Album, AlbumDetail,
  Song, RawSong, SubsonicSong, SubsonicSearchResponse, SubsonicTopSongsResponse,
  LibrarySummary,
} from './types';

// --- Artist queries ---

export async function getArtists(start: number = 0, limit: number = 1000): Promise<Artist[]> {
  try {
    const endpoint = `/api/artist?_start=${start}&_end=${start + limit}`;
    const data = await apiFetch(endpoint) as Artist[];
    return data || [];
  } catch (error) {
    console.error('Error fetching artists:', error);
    return [];
  }
}

/**
 * Search artists by name using Subsonic search3 API (full-text server-side search).
 * Falls back to native API name filter if search3 returns no results.
 */
export async function searchArtistsByName(query: string, limit: number = 20): Promise<Artist[]> {
  try {
    await getAuthToken();

    const endpoint = `/rest/search3.view?query=${encodeURIComponent(query)}&artistCount=${limit}&songCount=0&albumCount=0`;
    const response = await apiFetch(endpoint) as SubsonicSearchResponse;
    const subsonicData = response['subsonic-response'] || response;
    const artists = subsonicData.searchResult3?.artist || subsonicData.searchResult?.artist;

    if (artists && artists.length > 0) {
      return artists.map((a) => ({ id: a.id, name: a.name }));
    }

    const nativeEndpoint = `/api/artist?name=${encodeURIComponent(query)}&_start=0&_end=${limit}`;
    const nativeResults = await apiFetch(nativeEndpoint) as Artist[];
    return nativeResults || [];
  } catch (error) {
    console.error('Error searching artists:', error);
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

// --- Album queries ---

export async function getAlbums(artistId: string, start: number = 0, limit: number = 50): Promise<Album[]> {
  try {
    const data = await apiFetch(`/api/album?artist_id=${artistId}&_start=${start}&_end=${start + limit}`) as Album[];
    return data || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch albums: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getAlbumDetail(id: string): Promise<AlbumDetail> {
  try {
    const data = await apiFetch(`/api/album/${id}`) as AlbumDetail;
    return data;
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch album detail: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// --- Song queries ---

export async function getSongs(albumId: string, start: number = 0, limit: number = 50): Promise<Song[]> {
  try {
    const data = await apiFetch(`/api/song?album_id=${albumId}&_start=${start}&_end=${start + limit}`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getSongsByArtist(artistId: string, start: number = 0, limit: number = 100): Promise<Song[]> {
  try {
    const data = await apiFetch(`/api/song?artist_id=${artistId}&_start=${start}&_end=${start + limit}&_sort=title&_order=ASC`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch artist songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get songs by their IDs
 * Uses Navidrome's filter syntax to fetch multiple songs at once
 */
export async function getSongsByIds(songIds: string[]): Promise<Song[]> {
  if (songIds.length === 0) return [];

  try {
    const idFilter = songIds.map(id => `id=${id}`).join('&');
    const data = await apiFetch(`/api/song?${idFilter}&_start=0&_end=${songIds.length}`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`,
      genre: song.genre || (song.genres && song.genres.length > 0
        ? song.genres.map(g => g.name).join(', ')
        : ''),
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch songs by IDs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getSongsGlobal(start: number = 0, limit: number = 50): Promise<Song[]> {
  try {
    const data = await apiFetch(`/api/song?_start=${start}&_end=${start + limit}`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`,
      genre: song.genre || (song.genres && song.genres.length > 0
        ? song.genres.map(g => g.name).join(', ')
        : ''),
      loved: song.starred || false,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch global songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get random songs from the library for DJ set planning
 */
export async function getRandomSongs(count: number = 100): Promise<Song[]> {
  try {
    const data = await apiFetch(`/api/song?_start=0&_end=${count}&_sort=random&_order=ASC`) as RawSong[];
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`,
      genre: song.genre || (song.genres && song.genres.length > 0
        ? song.genres.map(g => g.name).join(', ')
        : ''),
      loved: song.starred || false,
    })) as Song[];
    return songs || [];
  } catch (error) {
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to fetch random songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getTopSongs(artistId: string, count: number = 10): Promise<Song[]> {
  try {
    const endpoint = `/rest/getTopSongs?artistId=${artistId}&count=${count}`;
    const data = await apiFetch(endpoint) as SubsonicTopSongsResponse;
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

// --- Search ---

/**
 * Search for songs with prioritization logic:
 * 1. Search for albums with name containing the query
 * 2. If albums found, return all songs from those albums
 * 3. If no albums, search for artists with name containing the query
 * 4. If artists found, return top songs from those artists
 * 5. If no artists, fallback to Subsonic song search
 * 6. If Subsonic fails, fallback to native song search
 */
export async function search(query: string, start: number = 0, limit: number = 50): Promise<Song[]> {
  try {
    const config = getConfig();
    if (!config.navidromeUrl) {
      return [];
    }

    const waitTime = await waitForRateLimit('search', 10000);
    if (waitTime > 0) {
      console.log(`⏳ Rate limit: waited ${waitTime}ms before search`);
    }

    await getAuthToken();

    const cacheKey = `navidrome_search_${query}_${start}_${limit}`;
    const cached = mobileOptimization.getCache<Song[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const qualitySettings = mobileOptimization.getQualitySettings();

    const songEndpoint = `/rest/search3.view?query=${encodeURIComponent(query)}&songCount=${limit}&artistCount=0&albumCount=0&songOffset=${start}`;

    let songs: Song[] = [];

    try {
      const response = await apiFetch(songEndpoint) as SubsonicSearchResponse;
      const subsonicData = response['subsonic-response'] || response;
      const searchSongs = subsonicData.searchResult3?.song || subsonicData.searchResult?.song;
      if (searchSongs && searchSongs.length > 0) {
        songs = searchSongs.map((song: SubsonicSong) => {
          return {
            id: song.id,
            name: song.title,
            title: song.title,
            artist: song.artist || 'Unknown Artist',
            albumId: song.albumId,
            artistId: song.artistId,
            album: song.album,
            duration: Math.floor(parseFloat(song.duration) || 0),
            track: parseInt(song.track) || 0,
            trackNumber: parseInt(song.track) || 0,
            url: `/api/navidrome/stream/${song.id}`,
          };
        });
      }
    } catch (error) {
      console.log('Direct song search failed:', error);
    }

    if (songs.length === 0) {
      try {
        const albumEndpoint = `/api/album?name=${encodeURIComponent(query)}&_start=0&_end=${Math.min(10, qualitySettings.preloadCount)}`;
        const albums = await apiFetch(albumEndpoint) as Album[];
        if (albums && albums.length > 0) {
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

    if (songs.length === 0) {
      try {
        const artistEndpoint = `/api/artist?name=${encodeURIComponent(query)}&_start=0&_end=${Math.min(4, qualitySettings.preloadCount)}`;
        const artists = await apiFetch(artistEndpoint) as Artist[];
        if (artists && artists.length > 0) {
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

    mobileOptimization.setCache(cacheKey, songs, 300000);

    return songs;

  } catch (error) {
    console.error('Search error:', error);
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to search music: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// --- Resolution ---

/**
 * Resolve a song by parsing "Artist - Title" format
 */
export async function resolveSongByArtistTitle(artistTitle: string): Promise<Song | null> {
  try {
    const match = artistTitle.match(/^(.+?)\s*-\s*(.+)$/);
    if (!match) {
      const songs = await search(artistTitle, 0, 1);
      return songs[0] || null;
    }

    const artistName = match[1].trim();
    const songTitle = match[2].trim();

    const artists = await getArtistsWithDetails(0, 100);
    const artist = artists.find(a => a.name.toLowerCase() === artistName.toLowerCase());
    if (!artist) {
      const songs = await search(artistTitle, 0, 1);
      return songs[0] || null;
    }

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

    const songs = await search(songTitle, 0, 5);
    const song = songs.find(s => s.artist?.toLowerCase() === artistName.toLowerCase());
    return song || null;
  } catch (error) {
    console.error('Error resolving song by artist-title:', error);
    return null;
  }
}

// --- Library summary ---

export async function getLibrarySummary(): Promise<LibrarySummary> {
  try {
    const topArtists = await getArtistsWithDetails(0, 15);
    const topSongs = await getSongsGlobal(0, 10);
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
