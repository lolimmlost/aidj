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
import { eq, and, sql, desc, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { listeningHistory } from '../../../lib/db/schema/listening-history.schema';
import { savedCoverArt } from '../../../lib/db/schema/saved-cover-art.schema';
import { coverArtFetchJobs } from '../../../lib/db/schema/cover-art-jobs.schema';
import { getDeezerAlbumImage, getDeezerArtistImage } from '../../../lib/services/deezer';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

const BATCH_DELAY_MS = 300;
const PROGRESS_UPDATE_INTERVAL = 5; // Update DB every N items

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Background processing ──────────────────────────────────────────────────

async function processAlbumsInBackground(jobId: string, userId: string) {
  try {
    const missing = await db
      .select({
        artist: listeningHistory.artist,
        album: listeningHistory.album,
      })
      .from(listeningHistory)
      .leftJoin(
        savedCoverArt,
        and(
          eq(savedCoverArt.entityId, sql`concat('album:', lower(${listeningHistory.artist}), ':', lower(${listeningHistory.album}))`),
          eq(savedCoverArt.entityType, 'album')
        )
      )
      .where(
        and(
          eq(listeningHistory.userId, userId),
          isNotNull(listeningHistory.album),
          ne(listeningHistory.album, ''),
          isNull(savedCoverArt.imageUrl)
        )
      )
      .groupBy(listeningHistory.artist, listeningHistory.album)
      .orderBy(desc(sql`count(*)`))
      .limit(500);

    await db.update(coverArtFetchJobs)
      .set({ total: missing.length })
      .where(eq(coverArtFetchJobs.id, jobId));

    let processed = 0;
    let found = 0;
    let notFound = 0;
    let errors = 0;

    for (const row of missing) {
      processed++;
      try {
        const imageUrl = await getDeezerAlbumImage(row.artist, row.album as string);
        if (imageUrl) {
          const entityId = `album:${row.artist.toLowerCase()}:${(row.album as string).toLowerCase()}`;
          await db.insert(savedCoverArt)
            .values({
              entityId,
              entityType: 'album',
              artist: row.artist,
              album: row.album as string,
              imageUrl,
              source: 'deezer',
              userId,
            })
            .onConflictDoUpdate({
              target: savedCoverArt.entityId,
              set: { imageUrl, source: 'deezer', userId, savedAt: new Date() },
            });
          found++;
        } else {
          notFound++;
        }
      } catch {
        errors++;
      }

      // Update progress periodically
      if (processed % PROGRESS_UPDATE_INTERVAL === 0 || processed === missing.length) {
        await db.update(coverArtFetchJobs)
          .set({ processed, found, notFound, errors })
          .where(eq(coverArtFetchJobs.id, jobId));
      }

      if (processed < missing.length) {
        await delay(BATCH_DELAY_MS);
      }
    }

    await db.update(coverArtFetchJobs)
      .set({ status: 'completed', processed, found, notFound, errors, completedAt: new Date() })
      .where(eq(coverArtFetchJobs.id, jobId));
  } catch (err) {
    await db.update(coverArtFetchJobs)
      .set({ status: 'failed', errorMessage: String(err), completedAt: new Date() })
      .where(eq(coverArtFetchJobs.id, jobId));
  }
}

async function processArtistsInBackground(jobId: string, userId: string) {
  try {
    const missing = await db
      .select({
        artist: listeningHistory.artist,
      })
      .from(listeningHistory)
      .leftJoin(
        savedCoverArt,
        and(
          eq(savedCoverArt.entityId, sql`concat('artist:', lower(${listeningHistory.artist}))`),
          eq(savedCoverArt.entityType, 'artist')
        )
      )
      .where(
        and(
          eq(listeningHistory.userId, userId),
          isNull(savedCoverArt.imageUrl)
        )
      )
      .groupBy(listeningHistory.artist)
      .orderBy(desc(sql`count(*)`))
      .limit(500);

    await db.update(coverArtFetchJobs)
      .set({ total: missing.length })
      .where(eq(coverArtFetchJobs.id, jobId));

    let processed = 0;
    let found = 0;
    let notFound = 0;
    let errors = 0;

    for (const row of missing) {
      processed++;
      try {
        const imageUrl = await getDeezerArtistImage(row.artist);
        if (imageUrl) {
          const entityId = `artist:${row.artist.toLowerCase()}`;
          await db.insert(savedCoverArt)
            .values({
              entityId,
              entityType: 'artist',
              artist: row.artist,
              imageUrl,
              source: 'deezer',
              userId,
            })
            .onConflictDoUpdate({
              target: savedCoverArt.entityId,
              set: { imageUrl, source: 'deezer', userId, savedAt: new Date() },
            });
          found++;
        } else {
          notFound++;
        }
      } catch {
        errors++;
      }

      if (processed % PROGRESS_UPDATE_INTERVAL === 0 || processed === missing.length) {
        await db.update(coverArtFetchJobs)
          .set({ processed, found, notFound, errors })
          .where(eq(coverArtFetchJobs.id, jobId));
      }

      if (processed < missing.length) {
        await delay(BATCH_DELAY_MS);
      }
    }

    await db.update(coverArtFetchJobs)
      .set({ status: 'completed', processed, found, notFound, errors, completedAt: new Date() })
      .where(eq(coverArtFetchJobs.id, jobId));
  } catch (err) {
    await db.update(coverArtFetchJobs)
      .set({ status: 'failed', errorMessage: String(err), completedAt: new Date() })
      .where(eq(coverArtFetchJobs.id, jobId));
  }
}

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

    console.log('[auto-fetch] Job status:', JSON.stringify({ id: job.id, status: job.status, found: job.found, notFound: job.notFound, total: job.total, processed: job.processed }));

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
