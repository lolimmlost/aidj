/**
 * Auto-fetch Cover Art API
 * POST /api/cover-art/auto-fetch — batch search Deezer and auto-save results
 *
 * Accepts { type: 'albums' | 'artists' } in the body.
 * Processes all missing entries sequentially (to respect Deezer rate limits),
 * searching and auto-saving the first result for each.
 *
 * Returns a summary of what was found and saved.
 */

import { createFileRoute } from '@tanstack/react-router';
import { eq, and, sql, desc, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { listeningHistory } from '../../../lib/db/schema/listening-history.schema';
import { savedCoverArt } from '../../../lib/db/schema/saved-cover-art.schema';
import { getDeezerAlbumImage, getDeezerArtistImage } from '../../../lib/services/deezer';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

const BATCH_DELAY_MS = 300; // Delay between Deezer requests to avoid rate limiting

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMissingAlbums(userId: string) {
  return db
    .select({
      artist: listeningHistory.artist,
      album: listeningHistory.album,
      playCount: sql<number>`count(*)::int`,
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
}

async function fetchMissingArtists(userId: string) {
  return db
    .select({
      artist: listeningHistory.artist,
      playCount: sql<number>`count(*)::int`,
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
}

async function saveArt(params: {
  entityId: string;
  entityType: string;
  artist: string;
  album?: string;
  imageUrl: string;
  source: string;
  userId: string;
}) {
  await db
    .insert(savedCoverArt)
    .values({
      entityId: params.entityId,
      entityType: params.entityType,
      artist: params.artist,
      album: params.album || null,
      imageUrl: params.imageUrl,
      source: params.source,
      userId: params.userId,
    })
    .onConflictDoUpdate({
      target: savedCoverArt.entityId,
      set: {
        imageUrl: params.imageUrl,
        source: params.source,
        userId: params.userId,
        savedAt: new Date(),
      },
    });
}

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;
    const body = await request.json();
    const type = body.type as string;

    if (!type || !['albums', 'artists'].includes(type)) {
      return errorResponse('INVALID_FIELD', 'type must be "albums" or "artists"', { status: 400 });
    }

    let processed = 0;
    let found = 0;
    let notFound = 0;
    let errors = 0;

    if (type === 'albums') {
      const missing = await fetchMissingAlbums(userId);
      const total = missing.length;

      for (const row of missing) {
        processed++;
        try {
          const imageUrl = await getDeezerAlbumImage(row.artist, row.album as string);
          if (imageUrl) {
            const entityId = `album:${row.artist.toLowerCase()}:${(row.album as string).toLowerCase()}`;
            await saveArt({
              entityId,
              entityType: 'album',
              artist: row.artist,
              album: row.album as string,
              imageUrl,
              source: 'deezer',
              userId,
            });
            found++;
          } else {
            notFound++;
          }
        } catch {
          errors++;
        }

        // Rate limit: pause between requests
        if (processed < total) {
          await delay(BATCH_DELAY_MS);
        }
      }
    } else {
      const missing = await fetchMissingArtists(userId);
      const total = missing.length;

      for (const row of missing) {
        processed++;
        try {
          const imageUrl = await getDeezerArtistImage(row.artist);
          if (imageUrl) {
            const entityId = `artist:${row.artist.toLowerCase()}`;
            await saveArt({
              entityId,
              entityType: 'artist',
              artist: row.artist,
              imageUrl,
              source: 'deezer',
              userId,
            });
            found++;
          } else {
            notFound++;
          }
        } catch {
          errors++;
        }

        if (processed < total) {
          await delay(BATCH_DELAY_MS);
        }
      }
    }

    return successResponse({
      type,
      processed,
      found,
      notFound,
      errors,
    });
  },
  {
    service: 'cover-art',
    operation: 'auto-fetch',
    defaultCode: 'AUTO_FETCH_ERROR',
    defaultMessage: 'Failed to auto-fetch cover art',
  }
);

export const Route = createFileRoute('/api/cover-art/auto-fetch')({
  server: {
    handlers: {
      POST,
    },
  },
});
