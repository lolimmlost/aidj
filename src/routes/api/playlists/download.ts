import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import { db } from '../../../lib/db';
import { playlistImportJobs, playlistDownloadJobs } from '../../../lib/db/schema/playlist-export.schema';
import { eq, and } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';
import {
  queueLidarrDownload,
  queueMetubeDownload,
  queueBatchDownload,
  checkLidarrAvailability,
  checkMetubeAvailability,
  getDownloadQueueStatus,
  generateDownloadReport,
  toDownloadQueueItem,
  type DownloadPreferences,
} from '../../../lib/services/playlist-download';
import type { ExportableSong } from '../../../lib/services/playlist-export';

// Validation schemas
const DownloadSingleSchema = z.object({
  song: z.object({
    title: z.string(),
    artist: z.string(),
    album: z.string().optional(),
    duration: z.number().optional(),
    platformId: z.string().optional(),
    platform: z.enum(['spotify', 'youtube_music', 'navidrome', 'local']).optional(),
    url: z.string().optional(),
  }),
  service: z.enum(['lidarr', 'metube']),
  youtubeVideoId: z.string().optional(),
});

const DownloadBatchSchema = z.object({
  songs: z.array(z.object({
    title: z.string(),
    artist: z.string(),
    album: z.string().optional(),
    duration: z.number().optional(),
    platformId: z.string().optional(),
    platform: z.enum(['spotify', 'youtube_music', 'navidrome', 'local']).optional(),
    url: z.string().optional(),
  })).min(1).max(100),
  importJobId: z.string().uuid().optional(),
  preferences: z.object({
    defaultService: z.enum(['lidarr', 'metube']).default('lidarr'),
    preferLidarrForAlbums: z.boolean().default(true),
    preferMetubeForSingles: z.boolean().default(true),
    autoStartDownloads: z.boolean().default(true),
    metubeFormat: z.enum(['mp3', 'mp4']).default('mp3'),
    metubeQuality: z.enum(['best', '1080', '720', '480']).default('best'),
  }).optional(),
});

const MarkOrganizedSchema = z.object({
  downloadJobId: z.string().uuid(),
  fileIds: z.array(z.string()).optional(),
});

// POST /api/playlists/download - Queue songs for download
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();

    // Check if it's a single song or batch download
    if (body.songs) {
      // Batch download
      const validatedData = DownloadBatchSchema.parse(body);

      const preferences: DownloadPreferences = {
        defaultService: validatedData.preferences?.defaultService || 'lidarr',
        preferLidarrForAlbums: validatedData.preferences?.preferLidarrForAlbums ?? true,
        preferMetubeForSingles: validatedData.preferences?.preferMetubeForSingles ?? true,
        autoStartDownloads: validatedData.preferences?.autoStartDownloads ?? true,
        metubeFormat: validatedData.preferences?.metubeFormat || 'mp3',
        metubeQuality: validatedData.preferences?.metubeQuality || 'best',
      };

      // Get match results if import job provided
      let matchResults;
      if (validatedData.importJobId) {
        const importJob = await db
          .select()
          .from(playlistImportJobs)
          .where(
            and(
              eq(playlistImportJobs.id, validatedData.importJobId),
              eq(playlistImportJobs.userId, session.user.id)
            )
          )
          .limit(1)
          .then(rows => rows[0]);

        if (importJob?.matchResults) {
          matchResults = importJob.matchResults;
        }
      }

      // Queue downloads
      const downloadStatuses = await queueBatchDownload({
        songs: validatedData.songs as ExportableSong[],
        matchResults,
        preferences,
      });

      // Create download job record
      const downloadJob = {
        id: crypto.randomUUID(),
        userId: session.user.id,
        importJobId: validatedData.importJobId || null,
        service: preferences.defaultService,
        status: 'processing' as const,
        totalItems: downloadStatuses.length,
        completedItems: downloadStatuses.filter(s => s.status === 'completed').length,
        failedItems: downloadStatuses.filter(s => s.status === 'failed').length,
        downloadQueue: downloadStatuses.map(toDownloadQueueItem),
        startedAt: new Date(),
        createdAt: new Date(),
      };

      await db.insert(playlistDownloadJobs).values(downloadJob);

      // Generate report
      const report = generateDownloadReport(downloadStatuses);

      return successResponse({
        downloadJobId: downloadJob.id,
        report: {
          summary: report.summary,
          byService: report.byService,
          failedCount: report.failedSongs.length,
          pendingOrganizationCount: report.pendingOrganization.length,
        },
        statuses: downloadStatuses.map(s => ({
          id: s.id,
          song: { title: s.song.title, artist: s.song.artist },
          service: s.service,
          status: s.status,
          error: s.error,
          needsManualOrganization: s.needsManualOrganization,
        })),
      }, 201);

    } else {
      // Single song download
      const validatedData = DownloadSingleSchema.parse(body);

      let downloadStatus;

      if (validatedData.service === 'lidarr') {
        downloadStatus = await queueLidarrDownload(validatedData.song as ExportableSong);
      } else {
        downloadStatus = await queueMetubeDownload(validatedData.song as ExportableSong, {
          videoId: validatedData.youtubeVideoId,
        });
      }

      return successResponse({
        downloadId: downloadStatus.id,
        song: { title: downloadStatus.song.title, artist: downloadStatus.song.artist },
        service: downloadStatus.service,
        status: downloadStatus.status,
        error: downloadStatus.error,
        needsManualOrganization: downloadStatus.needsManualOrganization,
      }, 201);
    }
  },
  {
    service: 'playlists/download',
    operation: 'queue',
    defaultCode: 'DOWNLOAD_QUEUE_ERROR',
    defaultMessage: 'Failed to queue download',
  }
);

// GET /api/playlists/download - Get download queue status
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const downloadJobId = url.searchParams.get('downloadJobId');

    // If specific job ID provided, return that job's status
    if (downloadJobId) {
      const downloadJob = await db
        .select()
        .from(playlistDownloadJobs)
        .where(
          and(
            eq(playlistDownloadJobs.id, downloadJobId),
            eq(playlistDownloadJobs.userId, session.user.id)
          )
        )
        .limit(1)
        .then(rows => rows[0]);

      if (!downloadJob) {
        return errorResponse('NOT_FOUND', 'Download job not found', { status: 404 });
      }

      return successResponse({
        downloadJob: {
          id: downloadJob.id,
          service: downloadJob.service,
          status: downloadJob.status,
          totalItems: downloadJob.totalItems,
          completedItems: downloadJob.completedItems,
          failedItems: downloadJob.failedItems,
          downloadQueue: downloadJob.downloadQueue,
          pendingOrganization: downloadJob.pendingOrganization,
          createdAt: downloadJob.createdAt,
          completedAt: downloadJob.completedAt,
        },
      });
    }

    // Otherwise, return current queue status from both services
    const queueStatus = await getDownloadQueueStatus();

    return successResponse({
      services: {
        lidarr: {
          available: queueStatus.lidarr.queue.length >= 0,
          queueCount: queueStatus.lidarr.queue.length,
          stats: queueStatus.lidarr.stats,
        },
        metube: {
          available: queueStatus.metube.queue.length >= 0 || queueStatus.metube.done.length >= 0,
          queueCount: queueStatus.metube.queue.length,
          completedCount: queueStatus.metube.done.length,
        },
      },
      lidarrQueue: queueStatus.lidarr.queue,
      lidarrHistory: queueStatus.lidarr.history.slice(0, 20),
      metubeQueue: queueStatus.metube.queue,
      metubeDone: queueStatus.metube.done.slice(0, 20),
    });
  },
  {
    service: 'playlists/download',
    operation: 'status',
    defaultCode: 'DOWNLOAD_STATUS_ERROR',
    defaultMessage: 'Failed to get download status',
  }
);

// PUT /api/playlists/download - Mark MeTube downloads as organized
const PUT = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const validatedData = MarkOrganizedSchema.parse(body);

    const downloadJob = await db
      .select()
      .from(playlistDownloadJobs)
      .where(
        and(
          eq(playlistDownloadJobs.id, validatedData.downloadJobId),
          eq(playlistDownloadJobs.userId, session.user.id)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!downloadJob) {
      return errorResponse('NOT_FOUND', 'Download job not found', { status: 404 });
    }

    // Update pending organization status
    if (downloadJob.pendingOrganization) {
      await db
        .update(playlistDownloadJobs)
        .set({
          pendingOrganization: {
            ...downloadJob.pendingOrganization,
            organized: true,
          },
        })
        .where(eq(playlistDownloadJobs.id, downloadJob.id));
    }

    return successResponse({
      success: true,
      message: 'Downloads marked as organized',
    });
  },
  {
    service: 'playlists/download',
    operation: 'organize',
    defaultCode: 'DOWNLOAD_ORGANIZE_ERROR',
    defaultMessage: 'Failed to update organization status',
  }
);

// DELETE /api/playlists/download - Cancel a download
const DELETE = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const downloadId = url.searchParams.get('downloadId');
    const service = url.searchParams.get('service') as 'lidarr' | 'metube';

    if (!downloadId || !service) {
      return errorResponse('VALIDATION_ERROR', 'Download ID and service are required', { status: 400 });
    }

    if (service === 'lidarr') {
      const { cancelDownload } = await import('../../../lib/services/lidarr');
      const success = await cancelDownload(downloadId);

      if (!success) {
        return errorResponse('DOWNLOAD_CANCEL_ERROR', 'Failed to cancel Lidarr download');
      }
    } else if (service === 'metube') {
      const { deleteDownloads } = await import('../../../lib/services/metube');
      await deleteDownloads([downloadId], 'queue');
    }

    return successResponse({
      success: true,
      message: 'Download cancelled',
    });
  },
  {
    service: 'playlists/download',
    operation: 'cancel',
    defaultCode: 'DOWNLOAD_CANCEL_ERROR',
    defaultMessage: 'Failed to cancel download',
  }
);

export const Route = createFileRoute("/api/playlists/download")({
  server: {
    handlers: {
      POST,
      GET,
      PUT,
      DELETE,
    },
  },
});
