import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
  serviceUnavailableResponse,
} from '../../../lib/utils/api-response';

const POST = withAuthAndErrorHandling(
  async ({ request }) => {
    const { isAurralConfigured, addArtistToLibrary, assertAurralResponsive, AurralUnavailableError } = await import('../../../lib/services/aurral');

    if (!(await isAurralConfigured())) {
      return serviceUnavailableResponse('AURRAL_NOT_CONFIGURED', 'Aurral is not configured');
    }

    const body = await request.json() as { mbid?: string; artistName?: string };
    if (!body.mbid || !body.artistName) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'mbid and artistName are required', { status: 400 });
    }

    try {
      await assertAurralResponsive();
      const result = await addArtistToLibrary(body.mbid, body.artistName);
      return successResponse(result, 202);
    } catch (err) {
      if (err instanceof AurralUnavailableError) {
        console.warn(`[AURRAL] add-artist unavailable for "${body.artistName}": ${err.message}`);
        return serviceUnavailableResponse('AURRAL_UNAVAILABLE', 'The download service is not responding. Try again in a minute.');
      }
      throw err;
    }
  },
  {
    service: 'aurral',
    operation: 'add-artist',
    defaultCode: 'AURRAL_ADD_ERROR',
    defaultMessage: 'Failed to add artist to library',
  }
);

export const Route = createFileRoute('/api/aurral/add-artist')({
  server: { handlers: { POST } },
});
