/**
 * Saved Artist Images API
 * GET /api/cover-art/artist-images — batch fetch all saved artist images
 *
 * Used by the browse artists page to show Deezer images as fallback
 * when Navidrome has no artist photo.
 */

import { createFileRoute } from '@tanstack/react-router';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { savedCoverArt } from '../../../lib/db/schema/saved-cover-art.schema';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async () => {
    const rows = await db
      .select({
        artist: savedCoverArt.artist,
        imageUrl: savedCoverArt.imageUrl,
      })
      .from(savedCoverArt)
      .where(eq(savedCoverArt.entityType, 'artist'));

    // Return as a map keyed by lowercase artist name for easy lookup
    const images: Record<string, string> = {};
    for (const row of rows) {
      images[row.artist.toLowerCase()] = row.imageUrl;
    }

    return successResponse({ images });
  },
  {
    service: 'cover-art',
    operation: 'artist-images',
    defaultCode: 'ARTIST_IMAGES_ERROR',
    defaultMessage: 'Failed to fetch saved artist images',
  }
);

export const Route = createFileRoute('/api/cover-art/artist-images')({
  server: {
    handlers: {
      GET,
    },
  },
});
