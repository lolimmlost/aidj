/**
 * Artist Image Search API
 * GET /api/cover-art/search-artist?artist=X — search Deezer for artist image
 */

import { createFileRoute } from '@tanstack/react-router';
import { getDeezerArtistImage } from '../../../lib/services/deezer';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ request }) => {
    const url = new URL(request.url);
    const artist = url.searchParams.get('artist');

    if (!artist) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'artist query param is required', { status: 400 });
    }

    const imageUrl = await getDeezerArtistImage(artist);

    return successResponse({ imageUrl: imageUrl || null, source: imageUrl ? 'deezer' : null });
  },
  {
    service: 'cover-art',
    operation: 'search-artist',
    defaultCode: 'SEARCH_ARTIST_ERROR',
    defaultMessage: 'Failed to search for artist image',
  }
);

export const Route = createFileRoute('/api/cover-art/search-artist')({
  server: {
    handlers: {
      GET,
    },
  },
});
