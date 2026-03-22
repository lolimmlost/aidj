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
 * Returns immediately — warming runs in the background.
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

    // Fire and forget — run warming in background, don't await
    warmArtistCache(artistList, {
      concurrency: 1,
      delayMs: 1500,
    }).then(result => {
      console.log(`[AURRAL] Background cache warming finished:`, result);
    }).catch(err => {
      console.error(`[AURRAL] Background cache warming failed:`, err);
    });

    return successResponse({
      message: `Cache warming started for ${artistList.length} artists in background`,
      totalArtists: artistList.length,
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
