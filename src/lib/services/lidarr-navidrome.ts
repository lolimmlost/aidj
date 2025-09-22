import { search, resolveSongByArtistTitle, type Artist as NavidromeArtist } from './navidrome';
import { getArtists as getLidarrArtists, LidarrArtist, type Album as LidarrAlbum } from './lidarr';

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
    navidrome?: any; // Navidrome Album - TODO: define proper type
    availability: ContentAvailability;
  };
}

/**
 * Check if an artist exists in both Lidarr and Navidrome
 */
export async function checkArtistAvailability(artistName: string): Promise<ContentAvailability> {
  try {
    // Check Lidarr
    const lidarrArtists = await getLidarrArtists();
    const inLidarr = lidarrArtists.some(artist =>
      artist.artistName.toLowerCase() === artistName.toLowerCase()
    );

    // Check Navidrome by searching for songs by this artist
    const navidromeSongs = await search(artistName, 0, 1);
    const inNavidrome = navidromeSongs.length > 0;

    return {
      inLidarr,
      inNavidrome,
      // TODO: Implement download status checking
    };
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
    // Check Navidrome by searching for the album
    const navidromeSongs = await search(`${artistName} ${albumTitle}`, 0, 1);
    const inNavidrome = navidromeSongs.length > 0;

    // Lidarr check would require getting artist's albums
    // TODO: Implement full album availability checking

    return {
      inLidarr: false, // Placeholder
      inNavidrome,
    };
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
  // TODO: Implement full integrated search
  // This would combine Lidarr search results with Navidrome availability checks

  return {
    artists: [],
    albums: [],
  };
}