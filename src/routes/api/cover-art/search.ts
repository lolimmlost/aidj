/**
 * Cover Art Search API
 * GET /api/cover-art/search?artist=X&album=Y — search Deezer for album art
 */

import { createFileRoute } from '@tanstack/react-router';
import { getDeezerAlbumImage } from '../../../lib/services/deezer';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ request }) => {
    const url = new URL(request.url);
    const artist = url.searchParams.get('artist');
    const album = url.searchParams.get('album');

    if (!artist || !album) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'artist and album query params are required', { status: 400 });
    }

    const imageUrl = await getDeezerAlbumImage(artist, album);

    return successResponse({ imageUrl: imageUrl || null, source: imageUrl ? 'deezer' : null });
  },
  {
    service: 'cover-art',
    operation: 'search',
    defaultCode: 'SEARCH_ERROR',
    defaultMessage: 'Failed to search for cover art',
  }
);

export const Route = createFileRoute('/api/cover-art/search')({
  server: {
    handlers: {
      GET,
    },
  },
});
