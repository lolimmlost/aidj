import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "~/lib/auth/auth";
import { integratedSearch, enhancedSearch } from "~/lib/services/lidarr-navidrome";
import { ServiceError } from "~/lib/utils";

/**
 * Integrated search across Lidarr and Navidrome services
 */
export const $integratedSearch = createServerFn({ method: "POST" })
  .validator((data: { query: string; enhanced?: boolean }) => data)
  .handler(async ({ data }) => {
    try {
      // Check if user is authenticated
      const session = await auth.api.getSession({ headers: getRequest().headers });
      if (!session) {
        throw new ServiceError('UNAUTHORIZED', 'Authentication required');
      }

      if (data.enhanced) {
        // Use enhanced search with song results
        const result = await enhancedSearch(data.query);
        return {
          success: true,
          data: result,
          message: 'Enhanced search completed successfully',
        };
      } else {
        // Use basic integrated search
        const result = await integratedSearch(data.query);
        return {
          success: true,
          data: result,
          message: 'Integrated search completed successfully',
        };
      }
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new ServiceError('SEARCH_ERROR', `Failed to perform integrated search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

/**
 * Check availability of content across services
 */
export const $checkAvailability = createServerFn({ method: "POST" })
  .validator((data: { type: 'artist' | 'album' | 'song'; query: string; albumTitle?: string }) => data)
  .handler(async ({ data }) => {
    try {
      // Check if user is authenticated
      const session = await auth.api.getSession({ headers: getRequest().headers });
      if (!session) {
        throw new ServiceError('UNAUTHORIZED', 'Authentication required');
      }

      let availability: { inLidarr: boolean; inNavidrome: boolean; downloadStatus?: string };

      let artistResult, albumResult;
      
      switch (data.type) {
        case 'artist':
          artistResult = await integratedSearch(data.query);
          availability = artistResult.artists[0]?.artist?.availability || { inLidarr: false, inNavidrome: false };
          break;
        
        case 'album':
          if (!data.albumTitle) {
            throw new ServiceError('VALIDATION_ERROR', 'Album title is required for album availability check');
          }
          albumResult = await integratedSearch(data.query);
          availability = albumResult.albums[0]?.album?.availability || { inLidarr: false, inNavidrome: false };
          break;
        
        case 'song':
          // Parse the query to extract artist and title (format: "Artist - Title" or just "Title")
          const songParts = data.query.split(' - ');
          const songArtist = songParts.length > 1 ? songParts[0] : '';
          const songTitle = songParts.length > 1 ? songParts.slice(1).join(' - ') : data.query;

          // Check Lidarr availability using the new checkSongInLidarr function
          const lidarrModule = await import('~/lib/services/lidarr-navidrome');
          const lidarrSongInfo = await lidarrModule.checkSongInLidarr(songTitle, songArtist);

          availability = {
            inLidarr: lidarrSongInfo !== undefined,
            inNavidrome: await lidarrModule.checkSongAvailability(data.query),
          };
          break;
        
        default:
          throw new ServiceError('VALIDATION_ERROR', 'Invalid content type specified');
      }

      return {
        success: true,
        data: {
          type: data.type,
          query: data.query,
          availability,
          recommendations: generateRecommendations(availability, data.type),
        },
        message: 'Availability check completed successfully',
      };
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new ServiceError('AVAILABILITY_ERROR', `Failed to check availability: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

/**
 * Generate recommendations based on availability
 */
function generateRecommendations(availability: { inLidarr: boolean; inNavidrome: boolean; downloadStatus?: string }, type: string): string[] {
  const recommendations: string[] = [];

  if (availability.inLidarr && availability.inNavidrome) {
    recommendations.push('Content available in both services');
    recommendations.push('Ready for playback');
  } else if (availability.inLidarr) {
    recommendations.push('Content available in Lidarr');
    recommendations.push('Download may be in progress');
  } else if (availability.inNavidrome) {
    recommendations.push('Content available in Navidrome');
    recommendations.push('Ready for playback');
  } else {
    recommendations.push('Content not found in either service');
    if (type === 'artist') {
      recommendations.push('Consider adding artist to Lidarr');
    } else if (type === 'album') {
      recommendations.push('Consider adding album to Lidarr');
    } else if (type === 'song') {
      recommendations.push('Consider requesting song through Lidarr');
    }
  }

  if (availability.downloadStatus === 'queued') {
    recommendations.push('Download is queued');
  } else if (availability.downloadStatus === 'downloading') {
    recommendations.push('Download is in progress');
  } else if (availability.downloadStatus === 'failed') {
    recommendations.push('Download failed, please try again');
  }

  return recommendations;
}