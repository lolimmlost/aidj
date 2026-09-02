import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { playlistImportJobs } from '../../../lib/db/schema/playlist-export.schema';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';
import {
  startYouTubeFallbackJob,
  getYouTubeFallbackJob,
  summarizeJob,
  MAX_TRACKS_PER_JOB,
  type FallbackTrack,
} from '../../../lib/services/youtube-fallback';

/**
 * Per-song YouTube (MeTube) fallback download — issue #145.
 *
 * POST: start a job. Provide either an explicit `tracks` array, or an
 * `importJobId` to pull the misses (no_match / pending_review by default) from a
 * finished playlist import. Downloads run one at a time and are verified against
 * the requested artist/title. Returns a `jobId` to poll.
 *
 * GET ?jobId=…: report per-track status + a summary.
 */

const TrackSchema = z.object({
  artist: z.string().min(1),
  title: z.string().min(1),
  album: z.string().optional(),
  duration: z.number().optional(),
});

const StartSchema = z
  .object({
    tracks: z.array(TrackSchema).optional(),
    importJobId: z.string().uuid().optional(),
    // Which import statuses to pull when importJobId is used.
    statuses: z.array(z.enum(['no_match', 'pending_review', 'matched', 'skipped'])).optional(),
    verify: z.boolean().optional(),
    folder: z.string().optional(),
    maxAttempts: z.number().int().min(1).max(5).optional(),
    skipInLibrary: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.tracks?.length && !data.importJobId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either `tracks` or `importJobId`',
      });
    }
  });

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const data = StartSchema.parse(body);

    let tracks: FallbackTrack[];

    if (data.tracks?.length) {
      tracks = data.tracks;
    } else {
      // Pull misses from a finished import job (scoped to this user).
      const importJob = await db
        .select()
        .from(playlistImportJobs)
        .where(
          and(
            eq(playlistImportJobs.id, data.importJobId!),
            eq(playlistImportJobs.userId, session.user.id)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!importJob) {
        return errorResponse('NOT_FOUND', 'Import job not found', { status: 404 });
      }

      const wanted = new Set(data.statuses ?? ['no_match', 'pending_review']);
      const results = importJob.matchResults ?? [];
      tracks = results
        .filter((r) => wanted.has(r.status))
        .map((r) => ({
          artist: r.originalSong.artist,
          title: r.originalSong.title,
          album: r.originalSong.album,
          duration: r.originalSong.duration,
        }));

      if (tracks.length === 0) {
        return errorResponse(
          'NO_TRACKS',
          `Import job has no tracks in status: ${[...wanted].join(', ')}`,
          { status: 400 }
        );
      }
    }

    let job;
    try {
      job = startYouTubeFallbackJob(session.user.id, tracks, {
        verify: data.verify,
        folder: data.folder,
        maxAttempts: data.maxAttempts,
        skipInLibrary: data.skipInLibrary,
      });
    } catch (err) {
      return errorResponse('INVALID_TRACKS', err instanceof Error ? err.message : 'Invalid tracks', {
        status: 400,
      });
    }

    const truncated = tracks.length > MAX_TRACKS_PER_JOB;

    return successResponse(
      {
        jobId: job.id,
        status: job.status,
        total: job.results.length,
        verify: job.verify,
        truncated,
        message: truncated
          ? `Started per-song YouTube download for the first ${MAX_TRACKS_PER_JOB} of ${tracks.length} tracks.`
          : `Started per-song YouTube download for ${job.results.length} track(s).`,
      },
      202
    );
  },
  {
    service: 'downloads/youtube-fallback',
    operation: 'start',
    defaultCode: 'YT_FALLBACK_ERROR',
    defaultMessage: 'Failed to start YouTube fallback download',
  }
);

const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');
    if (!jobId) {
      return errorResponse('VALIDATION_ERROR', 'jobId is required', { status: 400 });
    }

    const job = getYouTubeFallbackJob(jobId, session.user.id);
    if (!job) {
      return errorResponse('NOT_FOUND', 'Job not found (it may have expired)', { status: 404 });
    }

    return successResponse({
      jobId: job.id,
      status: job.status,
      verify: job.verify,
      maxAttempts: job.maxAttempts,
      currentIndex: job.currentIndex,
      summary: summarizeJob(job),
      results: job.results.map((r) => ({
        artist: r.track.artist,
        title: r.track.title,
        query: r.query,
        status: r.status,
        resultTitle: r.resultTitle,
        verification: r.verification,
        attempts: r.attempts,
        // Set on a skip that needs a human call; re-queue with skipInLibrary:false.
        review: r.review,
        error: r.error,
      })),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  },
  {
    service: 'downloads/youtube-fallback',
    operation: 'status',
    defaultCode: 'YT_FALLBACK_STATUS_ERROR',
    defaultMessage: 'Failed to get YouTube fallback status',
  }
);

export const Route = createFileRoute('/api/downloads/youtube-fallback')({
  server: {
    handlers: {
      POST,
      GET,
    },
  },
});
