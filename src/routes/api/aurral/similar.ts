import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
  serviceUnavailableResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ request }) => {
    const { isAurralConfigured, searchArtists, getSimilarArtists } = await import('../../../lib/services/aurral');

    if (!(await isAurralConfigured())) {
      return serviceUnavailableResponse('AURRAL_NOT_CONFIGURED', 'Aurral is not configured');
    }

    const url = new URL(request.url);
    const name = url.searchParams.get('name');
    const mbid = url.searchParams.get('mbid');
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    // Resolve MBID from name if not provided
    let resolvedMbid = mbid;
    if (!resolvedMbid && name) {
      const search = await searchArtists(name, 1);
      resolvedMbid = search.artists?.[0]?.id ?? null;
    }

    if (!resolvedMbid) {
      return errorResponse('NOT_FOUND', 'Could not resolve artist', { status: 404 });
    }

    const result = await getSimilarArtists(resolvedMbid, limit);
    return successResponse({ artists: result.artists, mbid: resolvedMbid });
  },
  {
    service: 'aurral',
    operation: 'similar-artists',
    defaultCode: 'AURRAL_SIMILAR_ERROR',
    defaultMessage: 'Failed to fetch similar artists',
  }
);

export const Route = createFileRoute('/api/aurral/similar')({
  server: { handlers: { GET } },
});
