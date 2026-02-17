/**
 * Missing Cover Art API
 * GET /api/cover-art/missing — list albums from listening history that may need art
 */

import { createFileRoute } from '@tanstack/react-router';
import { eq, and, sql, desc, isNotNull, ne } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { listeningHistory } from '../../../lib/db/schema/listening-history.schema';
import { savedCoverArt } from '../../../lib/db/schema/saved-cover-art.schema';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;

    // Query distinct albums from listening history with play counts
    const albums = await db
      .select({
        artist: listeningHistory.artist,
        album: listeningHistory.album,
        songId: sql<string>`min(${listeningHistory.songId})`,
        playCount: sql<number>`count(*)::int`,
        savedImageUrl: savedCoverArt.imageUrl,
        savedSource: savedCoverArt.source,
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
          ne(listeningHistory.album, '')
        )
      )
      .groupBy(
        listeningHistory.artist,
        listeningHistory.album,
        savedCoverArt.imageUrl,
        savedCoverArt.source
      )
      .orderBy(desc(sql`count(*)`))
      .limit(100);

    const result = albums.map((row) => ({
      artist: row.artist,
      album: row.album as string,
      songId: row.songId,
      playCount: row.playCount,
      savedArt: row.savedImageUrl
        ? { imageUrl: row.savedImageUrl, source: row.savedSource as string }
        : null,
    }));

    return successResponse({ albums: result });
  },
  {
    service: 'cover-art',
    operation: 'missing',
    defaultCode: 'MISSING_ART_ERROR',
    defaultMessage: 'Failed to fetch albums missing art',
  }
);

export const Route = createFileRoute('/api/cover-art/missing')({
  server: {
    handlers: {
      GET,
    },
  },
});
