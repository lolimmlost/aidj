/**
 * Auto-fetch Cover Art API
 *
 * POST /api/cover-art/auto-fetch — start a background job to search Deezer and auto-save
 * GET  /api/cover-art/auto-fetch?jobId=xxx — poll job progress
 *
 * Follows the same pattern as playlist import: returns 202 immediately,
 * processes in background, client polls for progress.
 */

import { createFileRoute } from '@tanstack/react-router';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { coverArtFetchJobs } from '../../../lib/db/schema/cover-art-jobs.schema';
import { processAlbumsInBackground, processArtistsInBackground } from '../../../lib/services/cover-art-auto-fetch';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

// ─── API handlers ───────────────────────────────────────────────────────────

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;
    const body = await request.json();
    const type = body.type as string;

    if (!type || !['albums', 'artists'].includes(type)) {
      return errorResponse('INVALID_FIELD', 'type must be "albums" or "artists"', { status: 400 });
    }

    // Create job record
    const jobId = crypto.randomUUID();
    await db.insert(coverArtFetchJobs).values({
      id: jobId,
      userId,
      type,
      status: 'processing',
      total: 0,
      processed: 0,
      found: 0,
      notFound: 0,
      errors: 0,
    });

    // Start background processing
    setImmediate(() => {
      if (type === 'albums') {
        processAlbumsInBackground(jobId, userId);
      } else {
        processArtistsInBackground(jobId, userId);
      }
    });

    return successResponse({
      jobId,
      type,
      status: 'processing',
      message: `Auto-fetching ${type} art in background...`,
    }, 202);
  },
  {
    service: 'cover-art',
    operation: 'auto-fetch-start',
    defaultCode: 'AUTO_FETCH_START_ERROR',
    defaultMessage: 'Failed to start auto-fetch',
  }
);

const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');

    if (!jobId) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'jobId query param is required', { status: 400 });
    }

    const job = await db
      .select()
      .from(coverArtFetchJobs)
      .where(
        and(
          eq(coverArtFetchJobs.id, jobId),
          eq(coverArtFetchJobs.userId, session.user.id)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!job) {
      return errorResponse('NOT_FOUND', 'Job not found', { status: 404 });
    }

    return successResponse({
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        total: job.total,
        processed: job.processed,
        found: job.found,
        notFound: job.notFound,
        errors: job.errors,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  },
  {
    service: 'cover-art',
    operation: 'auto-fetch-status',
    defaultCode: 'AUTO_FETCH_STATUS_ERROR',
    defaultMessage: 'Failed to get auto-fetch status',
  }
);

export const Route = createFileRoute('/api/cover-art/auto-fetch')({
  server: {
    handlers: {
      POST,
      GET,
    },
  },
});
