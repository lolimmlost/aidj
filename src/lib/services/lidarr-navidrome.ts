import { search as navidromeSearch, resolveSongByArtistTitle, type Artist as NavidromeArtist, getArtists as getNavidromeArtists } from './navidrome';
import { search as lidarrSearch, getArtists as getLidarrArtists, LidarrArtist, type Album as LidarrAlbum, searchAlbums } from './lidarr';
import { mobileOptimization } from '@/lib/performance/mobile-optimization';

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
    navidrome?: unknown; // Navidrome Album - TODO: define proper type
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
        
        albums.push({
          album: {
            lidarr: lidarrAlbum,
            navidrome: undefined, // TODO: Implement Navidrome album lookup
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
 * Enhanced search with availability status and mobile optimization
 */
export async function enhancedSearch(query: string): Promise<{
  artists: IntegratedSearchResult[];
  albums: IntegratedSearchResult[];
  songs: Array<{
    lidarr?: unknown;
    navidrome: unknown;
    availability: ContentAvailability;
  }>;
}> {
  try {
    // Use cache for mobile devices
    const cacheKey = `enhanced_search_${query}`;
    const cached = mobileOptimization.getCache<{
      artists: IntegratedSearchResult[];
      albums: IntegratedSearchResult[];
      songs: Array<{
        lidarr?: unknown;
        navidrome: unknown;
        availability: ContentAvailability;
      }>;
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
      navidromeSongs.map(song => async () => {
        try {
          const availability = await checkSongAvailability(`${song.artist} - ${song.title}`);
          return {
            navidrome: song,
            availability: {
              inLidarr: false, // TODO: Implement Lidarr song lookup
              inNavidrome: availability,
              downloadStatus: availability ? 'completed' : undefined,
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

    return result as {
      artists: IntegratedSearchResult[];
      albums: IntegratedSearchResult[];
      songs: Array<{
        lidarr?: unknown;
        navidrome: unknown;
        availability: ContentAvailability;
      }>;
    };
  } catch (error) {
    console.error('Error in enhanced search:', error);
    return {
      artists: [],
      albums: [],
      songs: [],
    };
  }
}