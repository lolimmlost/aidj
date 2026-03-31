/**
 * Cover Art Auto-Fetch Service
 *
 * Extracted background processing functions for auto-fetching cover art from Deezer.
 * Used by both the auto-fetch API route and the onboarding complete handler.
 */

import { eq, and, sql, desc, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { listeningHistory } from '@/lib/db/schema/listening-history.schema';
import { savedCoverArt } from '@/lib/db/schema/saved-cover-art.schema';
import { coverArtFetchJobs } from '@/lib/db/schema/cover-art-jobs.schema';
import { getDeezerAlbumImage, getDeezerArtistImage } from '@/lib/services/deezer';

const BATCH_DELAY_MS = 300;
const PROGRESS_UPDATE_INTERVAL = 5;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processAlbumsInBackground(jobId: string, userId: string) {
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

export async function processArtistsInBackground(jobId: string, userId: string) {
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
