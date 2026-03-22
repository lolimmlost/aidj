import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
  serviceUnavailableResponse,
} from '../../../lib/utils/api-response';

/**
 * POST /api/aurral/warm-cache
 *
 * Triggers background cache warming for all library artists.
 * Fetches artist list from Navidrome, then enriches each via Aurral.
 * Skips artists already in cache (unexpired).
 *
 * Query params:
 *   limit - max artists to process (default: 200)
 */
const POST = withAuthAndErrorHandling(
  async ({ request }) => {
    const { isAurralConfigured, warmArtistCache } = await import('../../../lib/services/aurral');
    const { getArtists } = await import('../../../lib/services/navidrome');

    if (!(await isAurralConfigured())) {
      return serviceUnavailableResponse('AURRAL_NOT_CONFIGURED', 'Aurral is not configured');
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10), 500);

    // Get library artists from Navidrome
    const artists = await getArtists(0, limit);
    const artistList = artists.map(a => ({
      name: a.name,
      navidromeId: a.id,
    }));

    // Run cache warming (this takes a while — 1.5s per artist)
    const result = await warmArtistCache(artistList, {
      concurrency: 1,
      delayMs: 1500,
    });

    return successResponse({
      totalArtists: artistList.length,
      ...result,
    });
  },
  {
    service: 'aurral',
    operation: 'warm-cache',
    defaultCode: 'CACHE_WARM_ERROR',
    defaultMessage: 'Failed to warm artist cache',
  }
);

export const Route = createFileRoute('/api/aurral/warm-cache')({
  server: { handlers: { POST } },
});
