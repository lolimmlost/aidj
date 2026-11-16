import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import { db } from '../../../lib/db';
import { playlistDownloadJobs } from '../../../lib/db/schema/playlist-export.schema';
import { eq } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';
import { queueToLidarr } from '../../../lib/services/lidarr-downloader';

// Song schema for download
const SongSchema = z.object({
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
});

// Request schema
const QueueDownloadSchema = z.object({
  importJobId: z.string().uuid().optional(),
  service: z.enum(['lidarr', 'metube', 'both']),
  songs: z.array(SongSchema).min(1),
});

// Background download processing function
async function processDownloadsInBackground(
  downloadJobId: string,
  service: 'lidarr' | 'metube' | 'both',
  songs: { title: string; artist: string; album?: string }[]
) {
  console.log(`[Download] Starting background download for ${songs.length} songs via ${service}...`);

  const results = {
    queued: 0,
    failed: 0,
    errors: [] as string[],
    lidarrQueued: 0,
    metubeQueued: 0,
    pendingOrganization: [] as { title: string; artist: string }[],
  };

  try {
    if (service === 'lidarr') {
      const lidarrResult = await queueToLidarrWithProgress(songs, downloadJobId);
      results.queued += lidarrResult.queued;
      results.failed += lidarrResult.failed;
      results.lidarrQueued = lidarrResult.queued;
      results.errors.push(...lidarrResult.errors);
    } else if (service === 'metube') {
      const metubeResult = await queueToMeTubeWithProgress(songs, downloadJobId);
      results.queued += metubeResult.queued;
      results.failed += metubeResult.failed;
      results.metubeQueued = metubeResult.queued;
      results.pendingOrganization = metubeResult.queuedSongs || [];
      results.errors.push(...metubeResult.errors);
    } else if (service === 'both') {
      // Try Lidarr first
      const lidarrResult = await queueToLidarrWithProgress(songs, downloadJobId);
      results.lidarrQueued = lidarrResult.queued;
      results.queued += lidarrResult.queued;

      const failedSongs = lidarrResult.failedSongs || [];

      if (failedSongs.length > 0) {
        // Try MeTube for Lidarr failures
        const metubeResult = await queueToMeTubeWithProgress(failedSongs, downloadJobId, lidarrResult.queued);
        results.metubeQueued = metubeResult.queued;
        results.queued += metubeResult.queued;
        results.failed = metubeResult.failed;
        results.pendingOrganization = metubeResult.queuedSongs || [];
        results.errors.push(...metubeResult.errors);
      }

      if (lidarrResult.queued > 0) {
        results.errors.unshift(`Lidarr: ${lidarrResult.queued} songs queued for download`);
      }
      if (failedSongs.length > 0) {
        results.errors.unshift(`${failedSongs.length} songs not found in Lidarr, trying MeTube...`);
      }
    }

    // Final update
    await db
      .update(playlistDownloadJobs)
      .set({
        status: results.queued > 0 ? 'completed' : 'failed',
        completedItems: results.queued,
        failedItems: results.failed,
        errorMessage: results.errors.length > 0 ? results.errors.join('; ') : null,
        pendingOrganization: results.pendingOrganization.length > 0 ? results.pendingOrganization : null,
      })
      .where(eq(playlistDownloadJobs.id, downloadJobId));

    console.log(`[Download] Job ${downloadJobId} completed: ${results.queued} queued, ${results.failed} failed`);

  } catch (error) {
    console.error(`[Download] Background processing failed:`, error);
    await db
      .update(playlistDownloadJobs)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(playlistDownloadJobs.id, downloadJobId));
  }
}

// POST /api/downloads/queue - Queue songs for download (async)
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const validatedData = QueueDownloadSchema.parse(body);

    const { importJobId, service, songs } = validatedData;

    // Create download job record
    const downloadJobId = crypto.randomUUID();
    const downloadJob = {
      id: downloadJobId,
      userId: session.user.id,
      importJobId: importJobId || null,
      service: service,
      status: 'processing' as const,
      totalItems: songs.length,
      completedItems: 0,
      failedItems: 0,
      downloadQueue: songs,
      pendingOrganization: null,
      startedAt: new Date(),
      createdAt: new Date(),
    };

    await db.insert(playlistDownloadJobs).values(downloadJob);

    // Start background processing
    setImmediate(() => {
      processDownloadsInBackground(downloadJobId, service, songs);
    });

    // Return immediately
    return successResponse({
      downloadJobId,
      service,
      totalSongs: songs.length,
      status: 'processing',
      message: `Queuing ${songs.length} songs for download...`,
    }, 202);
  },
  {
    service: 'downloads/queue',
    operation: 'queue',
    defaultCode: 'QUEUE_ERROR',
    defaultMessage: 'Failed to queue downloads',
  }
);

// Wrapper with progress updates for background processing
async function queueToLidarrWithProgress(
  songs: { title: string; artist: string; album?: string }[],
  downloadJobId: string
) {
  const result = await queueToLidarr(songs);

  // Update progress in database
  await db
    .update(playlistDownloadJobs)
    .set({
      completedItems: result.queued,
      failedItems: result.failed,
    })
    .where(eq(playlistDownloadJobs.id, downloadJobId));

  return result;
}

// Wrapper with progress updates for background processing
async function queueToMeTubeWithProgress(
  songs: { title: string; artist: string; album?: string }[],
  downloadJobId: string,
  previouslyQueued: number = 0
) {
  const result = await queueToMeTube(songs);

  // Update progress in database
  await db
    .update(playlistDownloadJobs)
    .set({
      completedItems: previouslyQueued + result.queued,
      failedItems: result.failed,
    })
    .where(eq(playlistDownloadJobs.id, downloadJobId));

  return result;
}

// Helper function to queue songs to MeTube
async function queueToMeTube(songs: { title: string; artist: string; album?: string }[]) {
  const result = {
    queued: 0,
    failed: 0,
    errors: [] as string[],
    queuedSongs: [] as { title: string; artist: string }[],
  };

  // Get MeTube configuration from environment
  const metubeUrl = process.env.METUBE_URL;

  if (!metubeUrl) {
    result.errors.push('MeTube is not configured. Please set METUBE_URL in your environment.');
    result.failed = songs.length;
    return result;
  }

  for (const song of songs) {
    try {
      // Search YouTube for the song
      const searchQuery = `${song.artist} ${song.title} audio`;
      const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;

      // For now, we'll construct a YouTube Music search URL
      // In a real implementation, you'd use the YouTube Data API to search
      const _ytMusicUrl = `https://music.youtube.com/search?q=${encodeURIComponent(searchQuery)}`;

      // Queue to MeTube with a search-based URL
      // MeTube can accept search terms if configured properly
      const metubeResponse = await fetch(`${metubeUrl}/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `ytsearch:${song.artist} - ${song.title}`,
          quality: 'best',
          format: 'mp3',
        }),
      });

      if (metubeResponse.ok) {
        result.queued++;
        result.queuedSongs.push({ title: song.title, artist: song.artist });
      } else {
        // Try alternative format
        const altResponse = await fetch(`${metubeUrl}/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: youtubeSearchUrl,
            quality: 'best',
            format: 'mp3',
          }),
        });

        if (altResponse.ok) {
          result.queued++;
          result.queuedSongs.push({ title: song.title, artist: song.artist });
        } else {
          result.errors.push(`Failed to queue ${song.artist} - ${song.title} to MeTube`);
          result.failed++;
        }
      }
    } catch (error) {
      result.errors.push(`Error queuing ${song.artist} - ${song.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.failed++;
    }
  }

  return result;
}

// GET /api/downloads/queue - Get download job status
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const downloadJobId = url.searchParams.get('downloadJobId');

    if (downloadJobId) {
      // Get specific download job
      const job = await db.query.playlistDownloadJobs.findFirst({
        where: eq(playlistDownloadJobs.id, downloadJobId),
      });

      if (!job) {
        return errorResponse('NOT_FOUND', 'Download job not found', { status: 404 });
      }

      if (job.userId !== session.user.id) {
        return errorResponse('FORBIDDEN', 'Access denied', { status: 403 });
      }

      return successResponse({ downloadJob: job });
    }

    // Get all download jobs for user
    const jobs = await db.query.playlistDownloadJobs.findMany({
      where: eq(playlistDownloadJobs.userId, session.user.id),
      orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
      limit: 20,
    });

    return successResponse({ downloadJobs: jobs });
  },
  {
    service: 'downloads/queue',
    operation: 'status',
    defaultCode: 'STATUS_ERROR',
    defaultMessage: 'Failed to get download status',
  }
);

export const Route = createFileRoute("/api/downloads/queue")({
  server: {
    handlers: {
      POST,
      GET,
    },
  },
});
