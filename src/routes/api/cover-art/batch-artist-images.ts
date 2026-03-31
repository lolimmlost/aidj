/**
 * Batch Artist Image Lookup API
 * POST /api/cover-art/batch-artist-images — fetch Deezer images for multiple artists
 *
 * Accepts { artists: string[] } and returns { images: Record<string, string> }
 * where keys are lowercase artist names and values are image URLs.
 * Uses the cached getDeezerArtistImage() which has 7-day server-side TTL.
 */

import { createFileRoute } from '@tanstack/react-router';
import { getDeezerArtistImage } from '../../../lib/services/deezer';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

const POST = withAuthAndErrorHandling(
  async ({ request }) => {
    const body = await request.json() as { artists?: string[] };

    if (!body.artists || !Array.isArray(body.artists) || body.artists.length === 0) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'artists array is required', { status: 400 });
    }

    // Cap at 10 to avoid excessive Deezer lookups per request
    const artists = body.artists.slice(0, 10);
    const images: Record<string, string> = {};

    const results = await Promise.allSettled(
      artists.map(async (name) => {
        const imageUrl = await getDeezerArtistImage(name);
        if (imageUrl) {
          images[name.toLowerCase()] = imageUrl;
        }
      })
    );

    return successResponse({ images });
  },
  {
    service: 'cover-art',
    operation: 'batch-artist-images',
    defaultCode: 'BATCH_ARTIST_IMAGES_ERROR',
    defaultMessage: 'Failed to fetch batch artist images',
  }
);

export const Route = createFileRoute('/api/cover-art/batch-artist-images')({
  server: {
    handlers: {
      POST,
    },
  },
});
