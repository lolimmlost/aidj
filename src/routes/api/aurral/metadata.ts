import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
  serviceUnavailableResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ request }) => {
    const { isAurralConfigured, getEnrichedArtist, AurralUnavailableError } = await import('../../../lib/services/aurral');

    if (!(await isAurralConfigured())) {
      return serviceUnavailableResponse('AURRAL_NOT_CONFIGURED', 'Aurral is not configured');
    }

    const url = new URL(request.url);
    const name = url.searchParams.get('name');
    const navidromeId = url.searchParams.get('navidromeId') ?? undefined;

    if (!name) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'name query param is required', { status: 400 });
    }

    let metadata;
    try {
      metadata = await getEnrichedArtist(name, navidromeId);
    } catch (err) {
      // Configured but not answering (wedged/restarting) — a distinct 503 so the UI can say
      // "try again in a minute" instead of "no results" (#336).
      if (err instanceof AurralUnavailableError) {
        console.warn(`[AURRAL] metadata unavailable for "${name}": ${err.message}`);
        return serviceUnavailableResponse('AURRAL_UNAVAILABLE', 'The artist lookup service is not responding. Try again in a minute.');
      }
      throw err;
    }
    if (!metadata) {
      return successResponse({ metadata: null, found: false });
    }

    return successResponse({ metadata, found: true });
  },
  {
    service: 'aurral',
    operation: 'get-metadata',
    defaultCode: 'AURRAL_METADATA_ERROR',
    defaultMessage: 'Failed to fetch artist metadata',
  }
);

export const Route = createFileRoute('/api/aurral/metadata')({
  server: { handlers: { GET } },
});
