import { createFileRoute } from "@tanstack/react-router";
import { search } from '../../../lib/services/navidrome';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

/**
 * Search endpoint for songs in Navidrome
 * Supports GET requests with query parameters for easier client-side usage
 */
const GET = withAuthAndErrorHandling(
  async ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';
    const _type = url.searchParams.get('type') || 'song'; // song, album, artist
    const start = parseInt(url.searchParams.get('start') || '0', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    if (!query) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'Query parameter "q" is required', { status: 400 });
    }

    // Use the navidrome search service
    const results = await search(query, start, limit);

    // Map results to the expected format for the collaboration suggest song dialog
    const songs = results.map(song => ({
      id: song.id,
      title: song.name || song.title || 'Unknown',
      artist: song.artist || 'Unknown Artist',
      album: song.album,
      duration: song.duration,
    }));

    return successResponse({ songs });
  },
  {
    service: 'navidrome-search',
    operation: 'search',
    defaultCode: 'SEARCH_ERROR',
    defaultMessage: 'Failed to search songs',
  }
);

// Also support POST for consistency with other endpoints
const POST = withAuthAndErrorHandling(
  async ({ request }) => {
    const { query, type: _type = 'song', start = 0, limit = 20 } = await request.json() as {
      query: string;
      type?: string;
      start?: number;
      limit?: number;
    };

    if (!query) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'Query is required', { status: 400 });
    }

    const results = await search(query, start, limit);

    const songs = results.map(song => ({
      id: song.id,
      title: song.name || song.title || 'Unknown',
      artist: song.artist || 'Unknown Artist',
      album: song.album,
      duration: song.duration,
    }));

    return successResponse({ songs });
  },
  {
    service: 'navidrome-search',
    operation: 'search',
    defaultCode: 'SEARCH_ERROR',
    defaultMessage: 'Failed to search songs',
  }
);

export const Route = createFileRoute("/api/navidrome/search")({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
});
