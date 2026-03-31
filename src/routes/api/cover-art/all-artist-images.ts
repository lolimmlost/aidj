/**
 * Unified Artist Images API
 * GET /api/cover-art/all-artist-images — merged map from both Deezer saved + Aurral metadata.
 *
 * Returns { images: Record<string, string> } keyed by lowercase artist name.
 * Deezer takes priority when both exist.
 */

import { createFileRoute } from '@tanstack/react-router';
import { eq, isNotNull } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { savedCoverArt } from '../../../lib/db/schema/saved-cover-art.schema';
import { artistMetadataCache } from '../../../lib/db/schema/artist-metadata.schema';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async () => {
    const [savedRows, metadataRows] = await Promise.all([
      db.select({ artist: savedCoverArt.artist, imageUrl: savedCoverArt.imageUrl })
        .from(savedCoverArt)
        .where(eq(savedCoverArt.entityType, 'artist')),
      db.select({ artistName: artistMetadataCache.artistNameNormalized, coverImageUrl: artistMetadataCache.coverImageUrl })
        .from(artistMetadataCache)
        .where(isNotNull(artistMetadataCache.coverImageUrl)),
    ]);

    const images: Record<string, string> = {};
    // Aurral first (lower priority)
    for (const row of metadataRows) {
      if (row.coverImageUrl) images[row.artistName] = row.coverImageUrl;
    }
    // Deezer overwrites (higher priority)
    for (const row of savedRows) {
      images[row.artist.toLowerCase()] = row.imageUrl;
    }

    return successResponse({ images });
  },
  {
    service: 'cover-art',
    operation: 'all-artist-images',
    defaultCode: 'ALL_ARTIST_IMAGES_ERROR',
    defaultMessage: 'Failed to fetch unified artist images',
  }
);

export const Route = createFileRoute('/api/cover-art/all-artist-images')({
  server: {
    handlers: {
      GET,
    },
  },
});
