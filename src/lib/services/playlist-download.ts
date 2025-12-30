import { ServiceError } from '../utils';
import { getConfig } from '@/lib/config/config';
import * as lidarr from './lidarr';
import * as metube from './metube';
import type {
  DownloadService,
  DownloadQueueItem,
  SongMatchResult,
} from '../db/schema/playlist-export.schema';
import type { ExportableSong } from './playlist-export';

/**
 * Download preferences
 */
export interface DownloadPreferences {
  defaultService: DownloadService;
  preferLidarrForAlbums: boolean;
  preferMetubeForSingles: boolean;
  autoStartDownloads: boolean;
  metubeFormat: 'mp3' | 'mp4';
  metubeQuality: 'best' | '1080' | '720' | '480';
}

/**
 * Download request for a single song
 */
export interface DownloadRequest {
  song: ExportableSong;
  service: DownloadService;
  youtubeVideoId?: string;
  lidarrAlbumId?: number;
  lidarrArtistId?: number;
}

/**
 * Download batch request
 */
export interface BatchDownloadRequest {
  songs: ExportableSong[];
  matchResults?: SongMatchResult[];
  preferences: DownloadPreferences;
}

/**
 * Download status
 */
export interface DownloadStatus {
  id: string;
  song: ExportableSong;
  service: DownloadService;
  status: 'queued' | 'downloading' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  downloadedPath?: string;
  needsManualOrganization?: boolean;
}

/**
 * Check if Lidarr is available
 */
export async function checkLidarrAvailability(): Promise<{
  available: boolean;
  error?: string;
}> {
  const config = getConfig();

  if (!config.lidarrUrl || !config.lidarrApiKey) {
    return { available: false, error: 'Lidarr not configured' };
  }

  try {
    await lidarr.getArtists();
    return { available: true };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Check if MeTube is available
 */
export async function checkMetubeAvailability(): Promise<{
  available: boolean;
  error?: string;
}> {
  const result = await metube.checkConnection();
  return {
    available: result.connected,
    error: result.error,
  };
}

/**
 * Find song in Lidarr's database
 * Searches for artist and album containing the track
 */
export async function findInLidarr(song: ExportableSong): Promise<{
  found: boolean;
  artistId?: number;
  artistName?: string;
  albumId?: number;
  albumTitle?: string;
  foreignArtistId?: string;
  foreignAlbumId?: string;
}> {
  try {
    // Search for the artist
    const searchQuery = `${song.artist} ${song.title}`;
    const albums = await lidarr.searchAlbumByTitle(song.title, song.artist);

    if (albums.length > 0) {
      const album = albums[0];
      return {
        found: true,
        albumId: album.id,
        albumTitle: album.title,
        artistId: album.artistId,
        foreignAlbumId: album.foreignAlbumId,
      };
    }

    // Try artist search
    const artists = await lidarr.searchArtistsFull(song.artist);
    if (artists.length > 0) {
      const artist = artists[0];
      return {
        found: true,
        artistId: artist.id,
        artistName: artist.artistName,
        foreignArtistId: artist.foreignArtistId,
      };
    }

    return { found: false };
  } catch (error) {
    console.error('Error searching Lidarr:', error);
    return { found: false };
  }
}

/**
 * Queue a song for download via Lidarr
 */
export async function queueLidarrDownload(
  song: ExportableSong,
  options?: {
    foreignArtistId?: string;
    foreignAlbumId?: string;
    monitorAlbum?: boolean;
  }
): Promise<DownloadStatus> {
  const downloadId = crypto.randomUUID();

  try {
    // First, search for the artist/album
    const searchResult = await findInLidarr(song);

    if (!searchResult.found && !options?.foreignArtistId) {
      return {
        id: downloadId,
        song,
        service: 'lidarr',
        status: 'failed',
        error: 'Could not find artist/album in Lidarr database',
      };
    }

    // Add artist if not already in library
    if (options?.foreignArtistId || searchResult.foreignArtistId) {
      const foreignArtistId = options?.foreignArtistId || searchResult.foreignArtistId!;

      // Check if artist is already added
      const isAdded = await lidarr.isArtistAdded(foreignArtistId);

      if (!isAdded) {
        // Search for artist to get full data
        const artists = await lidarr.searchArtistsFull(song.artist);
        const artistData = artists.find(a => a.foreignArtistId === foreignArtistId);

        if (artistData) {
          await lidarr.addArtist(artistData, { monitorAll: false });
        }
      }

      // If we have album info, monitor and search for it
      if (searchResult.albumId || options?.monitorAlbum) {
        if (searchResult.albumId) {
          await lidarr.monitorAlbum(searchResult.albumId, true);
          await lidarr.searchForAlbum(searchResult.albumId);
        }
      }
    }

    return {
      id: downloadId,
      song,
      service: 'lidarr',
      status: 'queued',
    };
  } catch (error) {
    return {
      id: downloadId,
      song,
      service: 'lidarr',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Failed to queue download',
    };
  }
}

/**
 * Queue a song for download via MeTube (YouTube)
 */
export async function queueMetubeDownload(
  song: ExportableSong,
  options?: {
    videoId?: string;
    format?: 'mp3' | 'mp4';
    quality?: 'best' | '1080' | '720' | '480';
    folder?: string;
  }
): Promise<DownloadStatus> {
  const downloadId = crypto.randomUUID();

  try {
    // Determine YouTube URL
    let youtubeUrl: string;

    if (options?.videoId) {
      youtubeUrl = `https://www.youtube.com/watch?v=${options.videoId}`;
    } else if (song.platformId && song.platform === 'youtube_music') {
      youtubeUrl = `https://www.youtube.com/watch?v=${song.platformId}`;
    } else if (song.url && song.url.includes('youtube')) {
      youtubeUrl = song.url;
    } else {
      // Search YouTube (would need to implement search)
      return {
        id: downloadId,
        song,
        service: 'metube',
        status: 'failed',
        error: 'No YouTube video ID available. Please search for the song on YouTube Music first.',
      };
    }

    // Add to MeTube queue
    await metube.addDownload({
      url: youtubeUrl,
      format: options?.format || 'mp3',
      quality: options?.quality || 'best',
      folder: options?.folder,
      custom_name_prefix: `${song.artist} - ${song.title}`,
      auto_start: true,
    });

    return {
      id: downloadId,
      song,
      service: 'metube',
      status: 'queued',
      needsManualOrganization: true, // MeTube downloads need manual organization
    };
  } catch (error) {
    return {
      id: downloadId,
      song,
      service: 'metube',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Failed to queue download',
    };
  }
}

/**
 * Queue multiple songs for download
 */
export async function queueBatchDownload(
  request: BatchDownloadRequest,
  onProgress?: (current: number, total: number, status: DownloadStatus) => void
): Promise<DownloadStatus[]> {
  const results: DownloadStatus[] = [];
  const { songs, matchResults, preferences } = request;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    const matchResult = matchResults?.[i];

    // Determine which service to use
    let service = preferences.defaultService;

    // Use YouTube match for MeTube if available
    const youtubeMatch = matchResult?.matches.find(m => m.platform === 'youtube_music');

    // Prefer Lidarr for albums if configured
    if (preferences.preferLidarrForAlbums && song.album) {
      const lidarrResult = await findInLidarr(song);
      if (lidarrResult.found && lidarrResult.albumId) {
        service = 'lidarr';
      }
    }

    // Prefer MeTube for singles if configured and YouTube match available
    if (preferences.preferMetubeForSingles && !song.album && youtubeMatch) {
      service = 'metube';
    }

    // Queue download
    let status: DownloadStatus;

    if (service === 'lidarr') {
      status = await queueLidarrDownload(song);
    } else {
      status = await queueMetubeDownload(song, {
        videoId: youtubeMatch?.platformId,
      });
    }

    results.push(status);

    if (onProgress) {
      onProgress(i + 1, songs.length, status);
    }

    // Small delay between requests
    if (i < songs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

/**
 * Get download queue status from both services
 */
export async function getDownloadQueueStatus(): Promise<{
  lidarr: {
    queue: lidarr.DownloadQueueItem[];
    history: lidarr.DownloadHistory[];
    stats: Awaited<ReturnType<typeof lidarr.getDownloadStats>>;
  };
  metube: {
    queue: metube.MeTubeDownload[];
    done: metube.MeTubeDownload[];
  };
}> {
  const [lidarrMonitor, metubeQueue] = await Promise.all([
    lidarr.monitorDownloads().catch(() => ({
      queue: [],
      history: [],
      wanted: [],
      stats: {
        totalQueued: 0,
        totalDownloading: 0,
        totalCompleted: 0,
        totalFailed: 0,
        totalWanted: 0,
        totalSize: 0,
      },
    })),
    metube.getQueue().catch(() => ({ queue: {}, done: {} })),
  ]);

  return {
    lidarr: {
      queue: lidarrMonitor.queue,
      history: lidarrMonitor.history,
      stats: lidarrMonitor.stats,
    },
    metube: {
      queue: Object.values(metubeQueue.queue),
      done: Object.values(metubeQueue.done),
    },
  };
}

/**
 * Generate organization suggestions for MeTube downloads
 */
export function generateOrganizationSuggestions(
  downloads: DownloadStatus[],
  basePath: string = '/music'
): Array<{
  song: ExportableSong;
  currentPath: string;
  suggestedPath: string;
}> {
  return downloads
    .filter(d => d.service === 'metube' && d.status === 'completed' && d.downloadedPath)
    .map(d => {
      const song = d.song;
      const artistFolder = sanitizeFolderName(song.artist);
      const albumFolder = song.album ? sanitizeFolderName(song.album) : 'Singles';
      const filename = sanitizeFolderName(`${song.artist} - ${song.title}`);

      return {
        song,
        currentPath: d.downloadedPath!,
        suggestedPath: `${basePath}/${artistFolder}/${albumFolder}/${filename}.mp3`,
      };
    });
}

/**
 * Generate download report
 */
export function generateDownloadReport(statuses: DownloadStatus[]): {
  summary: {
    total: number;
    queued: number;
    downloading: number;
    completed: number;
    failed: number;
  };
  byService: {
    lidarr: { queued: number; completed: number; failed: number };
    metube: { queued: number; completed: number; failed: number };
  };
  failedSongs: Array<{ song: ExportableSong; error: string }>;
  pendingOrganization: Array<{ song: ExportableSong; path?: string }>;
} {
  const summary = {
    total: statuses.length,
    queued: 0,
    downloading: 0,
    completed: 0,
    failed: 0,
  };

  const byService = {
    lidarr: { queued: 0, completed: 0, failed: 0 },
    metube: { queued: 0, completed: 0, failed: 0 },
  };

  const failedSongs: Array<{ song: ExportableSong; error: string }> = [];
  const pendingOrganization: Array<{ song: ExportableSong; path?: string }> = [];

  for (const status of statuses) {
    switch (status.status) {
      case 'queued':
        summary.queued++;
        byService[status.service].queued++;
        break;
      case 'downloading':
        summary.downloading++;
        break;
      case 'completed':
        summary.completed++;
        byService[status.service].completed++;
        if (status.needsManualOrganization) {
          pendingOrganization.push({
            song: status.song,
            path: status.downloadedPath,
          });
        }
        break;
      case 'failed':
        summary.failed++;
        byService[status.service].failed++;
        failedSongs.push({
          song: status.song,
          error: status.error || 'Unknown error',
        });
        break;
    }
  }

  return {
    summary,
    byService,
    failedSongs,
    pendingOrganization,
  };
}

// Helper functions
function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200);
}

/**
 * Convert DownloadStatus to DownloadQueueItem for DB storage
 */
export function toDownloadQueueItem(status: DownloadStatus): DownloadQueueItem {
  return {
    songId: status.id,
    title: status.song.title,
    artist: status.song.artist,
    album: status.song.album,
    service: status.service,
    status: status.status,
    progress: status.progress,
    error: status.error,
    downloadedPath: status.downloadedPath,
    needsManualOrganization: status.needsManualOrganization,
  };
}
