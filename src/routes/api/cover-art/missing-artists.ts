/**
 * Missing Artist Art API
 * GET /api/cover-art/missing-artists — list artists from listening history that may need images
 */

import { createFileRoute } from '@tanstack/react-router';
import { eq, and, sql, desc, isNull } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { listeningHistory } from '../../../lib/db/schema/listening-history.schema';
import { savedCoverArt } from '../../../lib/db/schema/saved-cover-art.schema';
import { artistMetadataCache } from '../../../lib/db/schema/artist-metadata.schema';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;
    const url = new URL(request.url);
    const includeSaved = url.searchParams.get('includeSaved') === 'true';

    // Query distinct artists from listening history with play counts
    // Excludes artists that have either a saved Deezer image or an Aurral metadata image
    const artists = await db
      .select({
        artist: listeningHistory.artist,
        playCount: sql<number>`count(*)::int`,
        savedImageUrl: savedCoverArt.imageUrl,
        savedSource: savedCoverArt.source,
      })
      .from(listeningHistory)
      .leftJoin(
        savedCoverArt,
        and(
          eq(savedCoverArt.entityId, sql`concat('artist:', lower(${listeningHistory.artist}))`),
          eq(savedCoverArt.entityType, 'artist')
        )
      )
      .leftJoin(
        artistMetadataCache,
        eq(
          artistMetadataCache.artistNameNormalized,
          sql`lower(${listeningHistory.artist})`
        )
      )
      .where(
        and(
          eq(listeningHistory.userId, userId),
          ...(includeSaved ? [] : [
            isNull(savedCoverArt.imageUrl),
            isNull(artistMetadataCache.coverImageUrl),
          ])
        )
      )
      .groupBy(
        listeningHistory.artist,
        savedCoverArt.imageUrl,
        savedCoverArt.source,
        artistMetadataCache.coverImageUrl,
        artistMetadataCache.artistNameNormalized
      )
      .orderBy(desc(sql`count(*)`))
      .limit(200);

    const result = artists.map((row) => ({
      artist: row.artist,
      playCount: row.playCount,
      savedArt: row.savedImageUrl
        ? { imageUrl: row.savedImageUrl, source: row.savedSource as string }
        : null,
    }));

    return successResponse({ artists: result });
  },
  {
    service: 'cover-art',
    operation: 'missing-artists',
    defaultCode: 'MISSING_ARTIST_ART_ERROR',
    defaultMessage: 'Failed to fetch artists missing art',
  }
);

export const Route = createFileRoute('/api/cover-art/missing-artists')({
  server: {
    handlers: {
      GET,
    },
  },
});
