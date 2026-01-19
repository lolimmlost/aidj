import { search as navidromeSearch, resolveSongByArtistTitle, type Artist as NavidromeArtist, type Song as NavidromeSong, getArtists as getNavidromeArtists, getAlbumDetail, type AlbumDetail } from './navidrome';
import { search as lidarrSearch, getArtists as getLidarrArtists, LidarrArtist, type Album as LidarrAlbum, searchAlbums, searchAlbumByTitle, findArtistByName, getArtistAlbums } from './lidarr';
import { mobileOptimization } from '@/lib/performance/mobile-optimization';
import type { NavidromeAlbumData } from '@/lib/types/navidrome-api';

// Types for integration
export interface ContentAvailability {
  inLidarr: boolean;
  inNavidrome: boolean;
  downloadStatus?: 'queued' | 'downloading' | 'completed' | 'failed';
}

export interface IntegratedSearchResult {
  artist?: {
    lidarr: LidarrArtist;
    navidrome?: NavidromeArtist;
    availability: ContentAvailability;
  };
  album?: {
    lidarr: LidarrAlbum;
    navidrome?: NavidromeAlbumData;
    availability: ContentAvailability;
  };
}

/**
 * Check if an artist exists in both Lidarr and Navidrome
 */
export async function checkArtistAvailability(artistName: string): Promise<ContentAvailability> {
  try {
    // Use cache for mobile devices
    const cacheKey = `artist_availability_${artistName}`;
    const cached = mobileOptimization.getCache<ContentAvailability>(cacheKey);
    if (cached) {
      return cached;
    }

    // Check Lidarr
    const lidarrArtists = await getLidarrArtists();
    const inLidarr = lidarrArtists.some(artist =>
      artist.artistName.toLowerCase() === artistName.toLowerCase()
    );

    // Check Navidrome by searching for songs by this artist
    const navidromeSongs = await navidromeSearch(artistName, 0, 1);
    const inNavidrome = navidromeSongs.length > 0;

    const availability: ContentAvailability = {
      inLidarr,
      inNavidrome,
      downloadStatus: inLidarr ? 'completed' : undefined,
    };

    // Cache result for mobile devices
    mobileOptimization.setCache(cacheKey, availability, 300000);

    return availability;
  } catch (error) {
    console.error('Error checking artist availability:', error);
    return {
      inLidarr: false,
      inNavidrome: false,
    };
  }
}

/**
 * Check if an album exists in both services
 */
export async function checkAlbumAvailability(artistName: string, albumTitle: string): Promise<ContentAvailability> {
  try {
    // Use cache for mobile devices
    const cacheKey = `album_availability_${artistName}_${albumTitle}`;
    const cached = mobileOptimization.getCache<ContentAvailability>(cacheKey);
    if (cached) {
      return cached;
    }

    // Check Navidrome by searching for the album
    const navidromeSongs = await navidromeSearch(`${artistName} ${albumTitle}`, 0, 1);
    const inNavidrome = navidromeSongs.length > 0;

    // Check Lidarr by searching for the album
    const lidarrAlbums = await searchAlbums(`${artistName} ${albumTitle}`);
    const inLidarr = lidarrAlbums.length > 0;

    const availability: ContentAvailability = {
      inLidarr,
      inNavidrome,
      downloadStatus: inLidarr ? 'completed' : undefined,
    };

    // Cache result for mobile devices
    mobileOptimization.setCache(cacheKey, availability, 300000);

    return availability;
  } catch (error) {
    console.error('Error checking album availability:', error);
    return {
      inLidarr: false,
      inNavidrome: false,
    };
  }
}

/**
 * Check if a specific song exists in Navidrome
 */
export async function checkSongAvailability(artistTitle: string): Promise<boolean> {
  try {
    const song = await resolveSongByArtistTitle(artistTitle);
    return song !== null;
  } catch (error) {
    console.error('Error checking song availability:', error);
    return false;
  }
}

/**
 * Search for an album in Navidrome by artist name and album title
 * Returns the album data if found, undefined otherwise
 */
export async function findNavidromeAlbum(artistName: string, albumTitle: string): Promise<NavidromeAlbumData | undefined> {
  try {
    // Use cache for performance
    const cacheKey = `navidrome_album_${artistName}_${albumTitle}`;
    const cached = mobileOptimization.getCache<NavidromeAlbumData | null>(cacheKey);
    if (cached !== undefined) {
      return cached || undefined;
    }

    // Search for songs matching the album to get album info
    const songs = await navidromeSearch(`${artistName} ${albumTitle}`, 0, 10);

    // Find a song that matches the album title (case-insensitive)
    const matchingSong = songs.find(song =>
      song.album?.toLowerCase().includes(albumTitle.toLowerCase()) ||
      albumTitle.toLowerCase().includes(song.album?.toLowerCase() || '')
    );

    if (matchingSong && matchingSong.albumId) {
      try {
        // Get full album details from Navidrome
        const albumDetail = await getAlbumDetail(matchingSong.albumId);
        const navidromeAlbum: NavidromeAlbumData = {
          id: albumDetail.id,
          name: albumDetail.name,
          artistId: albumDetail.artistId,
          artist: albumDetail.artist,
          year: albumDetail.year,
          songCount: albumDetail.songCount,
          duration: albumDetail.duration,
          genres: albumDetail.genres,
          artwork: albumDetail.artwork,
        };

        // Cache the result
        mobileOptimization.setCache(cacheKey, navidromeAlbum, 300000);
        return navidromeAlbum;
      } catch (error) {
        console.error('Error fetching album detail:', error);
      }
    }

    // Cache the negative result
    mobileOptimization.setCache(cacheKey, null, 300000);
    return undefined;
  } catch (error) {
    console.error('Error finding Navidrome album:', error);
    return undefined;
  }
}

/**
 * Check if a song exists in Lidarr by searching for albums containing the song
 * Returns Lidarr metadata if found, undefined otherwise
 */
export async function checkSongInLidarr(songTitle: string, artistName: string): Promise<{
  albumId?: number;
  albumTitle?: string;
  artistId?: number;
  artistName?: string;
} | undefined> {
  try {
    // Use cache for performance
    const cacheKey = `lidarr_song_${artistName}_${songTitle}`;
    const cached = mobileOptimization.getCache<{
      albumId?: number;
      albumTitle?: string;
      artistId?: number;
      artistName?: string;
    } | null>(cacheKey);
    if (cached !== undefined) {
      return cached || undefined;
    }

    // First, check if the artist exists in Lidarr's local library
    const lidarrArtist = await findArtistByName(artistName);

    if (lidarrArtist) {
      // Artist is in Lidarr - get their albums
      const albums = await getArtistAlbums(lidarrArtist.id);

      // Check if any album title might contain the song
      // Note: Lidarr doesn't expose individual track info via API,
      // so we check if the artist has downloaded albums
      if (albums.length > 0) {
        // The artist has albums in Lidarr, assume the song might be available
        // Use statistics to check if tracks are actually downloaded
        const downloadedAlbum = albums.find(album =>
          album.statistics && album.statistics.trackFileCount > 0
        );

        if (downloadedAlbum) {
          const result = {
            albumId: downloadedAlbum.id,
            albumTitle: downloadedAlbum.title,
            artistId: lidarrArtist.id,
            artistName: lidarrArtist.artistName,
          };
          mobileOptimization.setCache(cacheKey, result, 300000);
          return result;
        }
      }
    }

    // Also try searching by album title (in case the song title matches an album)
    const searchResults = await searchAlbumByTitle(songTitle, artistName);
    if (searchResults.length > 0) {
      const album = searchResults[0];
      const result = {
        albumId: album.id,
        albumTitle: album.title,
        artistId: album.artistId,
        artistName: artistName,
      };
      mobileOptimization.setCache(cacheKey, result, 300000);
      return result;
    }

    // Cache the negative result
    mobileOptimization.setCache(cacheKey, null, 300000);
    return undefined;
  } catch (error) {
    console.error('Error checking song in Lidarr:', error);
    return undefined;
  }
}

/**
 * Integrated search that checks availability in both services
 */
export async function integratedSearch(query: string): Promise<{
  artists: IntegratedSearchResult[];
  albums: IntegratedSearchResult[];
}> {
  try {
    // Use cache for mobile devices
    const cacheKey = `integrated_search_${query}`;
    const cached = mobileOptimization.getCache<{
      artists: IntegratedSearchResult[];
      albums: IntegratedSearchResult[];
    }>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get quality settings for mobile optimization
    const qualitySettings = mobileOptimization.getQualitySettings();

    // Search in both services concurrently
    const [lidarrResults] = await mobileOptimization.batchRequests([
      () => lidarrSearch(query),
    ], qualitySettings.concurrentRequests);

    const { artists: lidarrArtists, albums: lidarrAlbums } = lidarrResults as unknown as { artists: LidarrArtist[]; albums: LidarrAlbum[] };

    // Process artists
    const artists: IntegratedSearchResult[] = [];
    for (const lidarrArtist of lidarrArtists) {
      try {
        const availability = await checkArtistAvailability(lidarrArtist.artistName);
        
        // Find matching Navidrome artist
        let navidromeArtist: NavidromeArtist | undefined;
        if (availability.inNavidrome) {
          const navidromeArtists = await getNavidromeArtists();
          navidromeArtist = navidromeArtists.find(artist =>
            artist.name.toLowerCase() === lidarrArtist.artistName.toLowerCase()
          );
        }

        artists.push({
          artist: {
            lidarr: lidarrArtist,
            navidrome: navidromeArtist,
            availability,
          },
        });
      } catch (error) {
        console.error(`Error processing artist ${lidarrArtist.artistName}:`, error);
      }
    }

    // Process albums
    const albums: IntegratedSearchResult[] = [];
    for (const lidarrAlbum of lidarrAlbums) {
      try {
        // Get artist name for this album
        const lidarrArtist = lidarrArtists.find(artist => artist.id.toString() === lidarrAlbum.artistId.toString());
        const artistName = lidarrArtist?.artistName || 'Unknown Artist';

        const availability = await checkAlbumAvailability(artistName, lidarrAlbum.title);

        // Look up the album in Navidrome if it's available there
        let navidromeAlbum: NavidromeAlbumData | undefined;
        if (availability.inNavidrome) {
          navidromeAlbum = await findNavidromeAlbum(artistName, lidarrAlbum.title);
        }

        albums.push({
          album: {
            lidarr: lidarrAlbum,
            navidrome: navidromeAlbum,
            availability,
          },
        });
      } catch (error) {
        console.error(`Error processing album ${lidarrAlbum.title}:`, error);
      }
    }

    // Cache result for mobile devices
    mobileOptimization.setCache(cacheKey, { artists, albums }, 300000);

    return { artists, albums };
  } catch (error) {
    console.error('Error in integrated search:', error);
    return {
      artists: [],
      albums: [],
    };
  }
}

/**
 * Song search result with availability info
 */
export interface SongSearchResult {
  lidarr?: {
    albumId?: number;
    albumTitle?: string;
    artistId?: number;
    artistName?: string;
  };
  navidrome: NavidromeSong;
  availability: ContentAvailability;
}

/**
 * Enhanced search with availability status and mobile optimization
 */
export async function enhancedSearch(query: string): Promise<{
  artists: IntegratedSearchResult[];
  albums: IntegratedSearchResult[];
  songs: SongSearchResult[];
}> {
  try {
    // Use cache for mobile devices
    const cacheKey = `enhanced_search_${query}`;
    const cached = mobileOptimization.getCache<{
      artists: IntegratedSearchResult[];
      albums: IntegratedSearchResult[];
      songs: SongSearchResult[];
    }>(cacheKey);
    if (cached) {
      return cached;
    }

    const qualitySettings = mobileOptimization.getQualitySettings();

    // Get integrated search results
    const { artists, albums } = await integratedSearch(query);

    // Search for songs in Navidrome
    const navidromeSongs = await navidromeSearch(query, 0, qualitySettings.preloadCount * 20);

    // Process songs with availability checking
    const songs = await mobileOptimization.batchRequests(
      navidromeSongs.map(song => async (): Promise<SongSearchResult> => {
        try {
          const isAvailable = await checkSongAvailability(`${song.artist} - ${song.title}`);

          // Check if the song exists in Lidarr
          const lidarrInfo = await checkSongInLidarr(song.title || song.name, song.artist || 'Unknown Artist');
          const inLidarr = lidarrInfo !== undefined;

          return {
            lidarr: lidarrInfo,
            navidrome: song,
            availability: {
              inLidarr,
              inNavidrome: isAvailable,
              downloadStatus: isAvailable ? 'completed' : (inLidarr ? 'queued' : undefined),
            },
          };
        } catch (error) {
          console.error(`Error checking song availability for ${song.title}:`, error);
          return {
            navidrome: song,
            availability: {
              inLidarr: false,
              inNavidrome: false,
            },
          };
        }
      }),
      qualitySettings.concurrentRequests
    );

    const result = {
      artists,
      albums,
      songs: songs.flat(),
    };

    // Cache result for mobile devices
    mobileOptimization.setCache(cacheKey, result, 300000);

    return result;
  } catch (error) {
    console.error('Error in enhanced search:', error);
    return {
      artists: [],
      albums: [],
      songs: [],
    };
  }
}