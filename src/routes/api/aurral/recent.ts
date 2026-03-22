import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
  serviceUnavailableResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async () => {
    const { isAurralConfigured, getRecentArtists } = await import('../../../lib/services/aurral');

    if (!(await isAurralConfigured())) {
      return serviceUnavailableResponse('AURRAL_NOT_CONFIGURED', 'Aurral is not configured');
    }

    const artists = await getRecentArtists();
    return successResponse({ artists });
  },
  {
    service: 'aurral',
    operation: 'recent-artists',
    defaultCode: 'AURRAL_RECENT_ERROR',
    defaultMessage: 'Failed to fetch recently added artists',
  }
);

export const Route = createFileRoute('/api/aurral/recent')({
  server: { handlers: { GET } },
});
