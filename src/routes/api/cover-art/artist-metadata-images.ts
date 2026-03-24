/**
 * Artist Metadata Images API
 * GET /api/cover-art/artist-metadata-images — batch fetch cached Aurral cover images
 *
 * Returns a map of lowercase artist name → coverImageUrl from the metadata cache.
 */

import { createFileRoute } from '@tanstack/react-router';
import { isNotNull } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { artistMetadataCache } from '../../../lib/db/schema/artist-metadata.schema';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async () => {
    const rows = await db
      .select({
        artistName: artistMetadataCache.artistNameNormalized,
        coverImageUrl: artistMetadataCache.coverImageUrl,
      })
      .from(artistMetadataCache)
      .where(isNotNull(artistMetadataCache.coverImageUrl));

    const images: Record<string, string> = {};
    for (const row of rows) {
      if (row.coverImageUrl) {
        images[row.artistName] = row.coverImageUrl;
      }
    }

    return successResponse({ images });
  },
  {
    service: 'cover-art',
    operation: 'artist-metadata-images',
    defaultCode: 'ARTIST_METADATA_IMAGES_ERROR',
    defaultMessage: 'Failed to fetch artist metadata images',
  }
);

export const Route = createFileRoute('/api/cover-art/artist-metadata-images')({
  server: {
    handlers: {
      GET,
    },
  },
});
