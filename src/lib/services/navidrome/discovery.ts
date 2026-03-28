import { ServiceError } from '../../utils';
import { apiFetch } from './core';
import {
  getArtists, getArtistDetail, getArtistsWithDetails,
  getSongs, getSongsByIds, getSongsGlobal, search,
} from './library';
import { getStarredSongs } from './user-features';
import type { SubsonicApiResponse, SubsonicSong, ArtistWithDetails } from './types';

/**
 * Get similar songs for a given song ID (recommendations)
 * Uses Subsonic API getSimilarSongs endpoint with Last.fm data
 */
export async function getSimilarSongs(songId: string, count: number = 50): Promise<SubsonicSong[]> {
  try {
    const endpoint = `/rest/getSimilarSongs?id=${encodeURIComponent(songId)}&count=${count}`;
    const data = await apiFetch(endpoint) as SubsonicApiResponse;
    const songs = data['subsonic-response']?.similarSongs?.song || data.similarSongs?.song || [];
    console.log(`🎵 Found ${songs.length} similar songs for ${songId}`);
    return songs as SubsonicSong[];
  } catch (error) {
    console.warn('Failed to get similar songs:', error);
    return [];
  }
}

export async function searchSongsByCriteria(criteria: {
  genre?: string[];
  yearFrom?: number;
  yearTo?: number;
  artists?: string[];
  rating?: number;
  recentlyAdded?: '7d' | '30d' | '90d';
}, limit: number = 100): Promise<SubsonicSong[]> {
  try {
    const matchedSongs: SubsonicSong[] = [];
    const seedSongIds: string[] = [];

    // Strategy 1: If artists specified, find seed songs and get recommendations
    if (criteria.artists && criteria.artists.length > 0) {
      console.log('🎨 Building recommendations from seed artists:', criteria.artists);

      for (const artistName of criteria.artists) {
        try {
          console.log(`🔍 Searching for artist: ${artistName}`);
          const artistSongs = await search(artistName, 0, 20);
          console.log(`📝 Found ${artistSongs.length} songs for ${artistName}`);

          matchedSongs.push(...artistSongs.map(song => ({
            id: song.id,
            title: song.name || song.title || '',
            artist: song.artist || '',
            albumId: song.albumId,
            album: '',
            duration: (song.duration || 0).toString(),
            track: (song.track || 0).toString(),
          } as SubsonicSong)));

          seedSongIds.push(...artistSongs.slice(0, 3).map(s => s.id));
        } catch (error) {
          console.warn(`Failed to find songs for artist ${artistName}:`, error);
        }
      }

      console.log(`🎵 Getting recommendations from ${seedSongIds.length} seed songs...`);
      for (const seedId of seedSongIds.slice(0, 5)) {
        try {
          const similar = await getSimilarSongs(seedId, 20);
          if (similar.length > 0) {
            console.log(`🎯 Got ${similar.length} similar songs`);
            matchedSongs.push(...similar);
          } else {
            console.log(`⚠️ No similar songs found (Last.fm might not be configured)`);
          }
        } catch (error) {
          console.warn(`Failed to get similar songs:`, error);
        }
      }
    }

    // Strategy 2: For genre searches, try multiple approaches
    if (criteria.genre && criteria.genre.length > 0 && matchedSongs.length < limit) {
      console.log('🎼 Searching for songs in genres:', criteria.genre);

      for (const genre of criteria.genre) {
        try {
          const genreEndpoint = `/rest/getAlbumList2?type=byGenre&genre=${encodeURIComponent(genre)}&size=50`;
          console.log(`🔍 Trying genre filter: ${genreEndpoint}`);
          const genreData = await apiFetch(genreEndpoint) as SubsonicApiResponse;
          const genreAlbums = genreData['subsonic-response']?.albumList2?.album || genreData.albumList2?.album || [];

          console.log(`📀 Found ${genreAlbums.length} albums with genre tag "${genre}"`);

          if (genreAlbums.length > 0) {
            const shuffled = genreAlbums.sort(() => Math.random() - 0.5);
            const albumsToSample = Math.min(20, shuffled.length);

            for (const album of shuffled.slice(0, albumsToSample)) {
              try {
                const albumSongs = await getSongs(album.id, 0, 50);
                const songsPerAlbum = Math.min(5, Math.ceil(limit / albumsToSample));
                const randomFromAlbum = albumSongs
                  .sort(() => Math.random() - 0.5)
                  .slice(0, songsPerAlbum);

                matchedSongs.push(...randomFromAlbum.map(song => ({
                  id: song.id,
                  title: song.name || song.title || '',
                  artist: song.artist || '',
                  albumId: song.albumId,
                  album: album.name,
                  duration: (song.duration || 0).toString(),
                  track: (song.track || 0).toString(),
                } as SubsonicSong)));

                if (matchedSongs.length >= limit) break;
              } catch (error) {
                console.warn(`Failed to get songs for album ${album.id}:`, error);
              }
            }
          } else {
            console.log(`⚠️ No genre tags found. Getting random recent albums instead...`);
            const randomEndpoint = `/rest/getAlbumList2?type=random&size=30`;
            const randomData = await apiFetch(randomEndpoint) as SubsonicApiResponse;
            const randomAlbums = randomData['subsonic-response']?.albumList2?.album || randomData.albumList2?.album || [];

            console.log(`🎲 Got ${randomAlbums.length} random albums`);

            for (const album of randomAlbums.slice(0, 20)) {
              try {
                const albumSongs = await getSongs(album.id, 0, 50);
                const songsToTake = Math.min(3, albumSongs.length);
                const randomFromAlbum = albumSongs
                  .sort(() => Math.random() - 0.5)
                  .slice(0, songsToTake);

                matchedSongs.push(...randomFromAlbum.map(song => ({
                  id: song.id,
                  title: song.name || song.title || '',
                  artist: song.artist || '',
                  albumId: song.albumId,
                  album: album.name,
                  duration: (song.duration || 0).toString(),
                  track: (song.track || 0).toString(),
                } as SubsonicSong)));

                if (matchedSongs.length >= limit) break;
              } catch (error) {
                console.warn(`Failed to get songs for album:`, error);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to search for genre ${genre}:`, error);
        }
      }
    }

    // Fallback: If we still have no songs, try getting from global song list
    if (matchedSongs.length === 0) {
      console.log('⚠️ No songs found with criteria, falling back to global library...');
      try {
        const globalSongs = await getSongsGlobal(0, limit);
        console.log(`📚 Retrieved ${globalSongs.length} songs from global library`);
        matchedSongs.push(...globalSongs.map(song => ({
          id: song.id,
          title: song.name || song.title || '',
          artist: song.artist || '',
          albumId: song.albumId,
          album: '',
          duration: (song.duration || 0).toString(),
          track: (song.track || 0).toString(),
        } as SubsonicSong)));
      } catch (error) {
        console.error('Failed to get global songs:', error);
        throw new ServiceError('NAVIDROME_API_ERROR', 'No songs found in your library. Please check your Navidrome configuration and library scan.');
      }
    }

    // Remove duplicates
    const uniqueSongs = Array.from(
      new Map(matchedSongs.map(song => [song.id, song])).values()
    );

    console.log(`📊 Total songs before filtering: ${uniqueSongs.length}`);

    // Ensure artist diversity by limiting songs per artist
    const songsByArtist = new Map<string, SubsonicSong[]>();
    for (const song of uniqueSongs) {
      const artist = song.artist || 'Unknown';
      if (!songsByArtist.has(artist)) {
        songsByArtist.set(artist, []);
      }
      songsByArtist.get(artist)!.push(song);
    }

    console.log(`🎤 Found ${songsByArtist.size} unique artists`);

    const diverseSongs: SubsonicSong[] = [];
    for (const [artist, songs] of songsByArtist.entries()) {
      const shuffled = songs.sort(() => Math.random() - 0.5);
      const maxPerArtist = 10;
      diverseSongs.push(...shuffled.slice(0, maxPerArtist));
      if (songs.length > maxPerArtist) {
        console.log(`  🎵 Limited ${artist} from ${songs.length} to ${maxPerArtist} songs`);
      }
    }

    const shuffled = diverseSongs.sort(() => Math.random() - 0.5);
    console.log(`✅ Created playlist with ${shuffled.length} diverse songs from ${songsByArtist.size} artists`);

    return shuffled.slice(0, limit);
  } catch (error) {
    console.error('Failed to search songs by criteria:', error);
    throw new ServiceError('NAVIDROME_API_ERROR', `Failed to search songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get top artists by actual play count
 */
export async function getTopArtists(limit: number = 5): Promise<ArtistWithDetails[]> {
  try {
    const endpoint = `/rest/getAlbumList2?type=frequent&size=100`;
    const data = await apiFetch(endpoint) as SubsonicApiResponse;

    const albums = data?.['subsonic-response']?.albumList2?.album ||
                   data?.albumList2?.album ||
                   data?.album ||
                   [];

    if (!albums || albums.length === 0) {
      console.log('No frequent albums found, falling back to song count');
      const artists = await getArtistsWithDetails(0, 100);
      const sorted = artists.sort((a, b) => (b.songCount || 0) - (a.songCount || 0));
      return sorted.slice(0, limit);
    }

    const artistPlayCounts = new Map<string, { id: string; name: string; totalPlays: number }>();

    for (const album of albums) {
      const artistId = album.artistId;
      const artistName = album.artist || 'Unknown Artist';
      const playCount = album.playCount || 0;

      if (artistId && playCount > 0) {
        const existing = artistPlayCounts.get(artistId);
        if (existing) {
          existing.totalPlays += playCount;
        } else {
          artistPlayCounts.set(artistId, {
            id: artistId,
            name: artistName,
            totalPlays: playCount
          });
        }
      }
    }

    const sortedArtists = Array.from(artistPlayCounts.values())
      .sort((a, b) => b.totalPlays - a.totalPlays)
      .slice(0, limit);

    console.log('🎨 [getTopArtists] Aggregated artists:', sortedArtists.map(a => `${a.name}: ${a.totalPlays} plays`));

    if (sortedArtists.length > 0 && sortedArtists[0].totalPlays > 0) {
      const artistDetails = await Promise.all(
        sortedArtists.map(async (artist) => {
          try {
            const detail = await getArtistDetail(artist.id);
            return {
              ...detail,
              id: artist.id,
              name: artist.name,
              totalPlays: artist.totalPlays
            } as ArtistWithDetails & { totalPlays: number };
          } catch {
            return {
              id: artist.id,
              name: artist.name,
              albumCount: 0,
              songCount: 0,
              genres: null,
              fullText: '',
              orderArtistName: artist.name,
              size: 0,
              totalPlays: artist.totalPlays
            } as ArtistWithDetails & { totalPlays: number };
          }
        })
      );
      return artistDetails;
    }

    console.log('No play count data available, falling back to song count');
    const artists = await getArtistsWithDetails(0, 100);
    const sorted = artists.sort((a, b) => (b.songCount || 0) - (a.songCount || 0));
    return sorted.slice(0, limit);
  } catch (error) {
    console.error('Failed to get top artists:', error);
    try {
      const artists = await getArtistsWithDetails(0, 100);
      const sorted = artists.sort((a, b) => (b.songCount || 0) - (a.songCount || 0));
      return sorted.slice(0, limit);
    } catch {
      return [];
    }
  }
}

/**
 * Get most played songs
 */
export async function getMostPlayedSongs(limit: number = 5): Promise<SubsonicSong[]> {
  try {
    const endpoint = `/rest/getAlbumList2?type=frequent&size=${limit}`;
    const data = await apiFetch(endpoint) as SubsonicApiResponse;

    const albums = data['subsonic-response']?.albumList2?.album || data.albumList2?.album || [];

    if (albums.length > 0) {
      const songs: SubsonicSong[] = [];
      for (const album of albums.slice(0, 3)) {
        const albumSongs = await getSongs(album.id, 0, 2);
        songs.push(...albumSongs.map(s => ({
          id: s.id,
          title: s.name || s.title || '',
          artist: s.artist || '',
          albumId: s.albumId,
          album: s.album,
          duration: String(s.duration),
          track: String(s.track),
        })));
      }
      console.log(`🎵 Fetched ${songs.length} most played songs`);
      return songs.slice(0, limit);
    }

    const starred = await getStarredSongs();
    console.log(`🎵 Fallback: ${starred.length} starred songs`);
    return starred.slice(0, limit);
  } catch (error) {
    console.error('Failed to get most played songs:', error);
    return [];
  }
}

/**
 * Get recently played songs
 */
export async function getRecentlyPlayedSongs(limit: number = 10): Promise<SubsonicSong[]> {
  try {
    const endpoint = `/rest/getAlbumList2?type=recent&size=${Math.min(limit, 10)}`;
    const data = await apiFetch(endpoint) as SubsonicApiResponse;

    const albums = data['subsonic-response']?.albumList2?.album || data.albumList2?.album || [];

    if (albums.length > 0) {
      const songs: SubsonicSong[] = [];
      for (const album of albums) {
        const albumSongs = await getSongs(album.id, 0, 2);
        songs.push(...albumSongs.map(s => ({
          id: s.id,
          title: s.name || s.title || '',
          artist: s.artist || '',
          albumId: s.albumId,
          album: s.album,
          duration: String(s.duration),
          track: String(s.track),
        })));
        if (songs.length >= limit) break;
      }
      console.log(`🕐 Fetched ${songs.length} recently played songs`);
      return songs.slice(0, limit);
    }

    return [];
  } catch (error) {
    console.error('Failed to get recently played songs:', error);
    return [];
  }
}
