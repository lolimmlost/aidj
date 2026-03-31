import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
  serviceUnavailableResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async () => {
    const { isAurralConfigured, getDiscovery } = await import('../../../lib/services/aurral');

    if (!(await isAurralConfigured())) {
      return serviceUnavailableResponse('AURRAL_NOT_CONFIGURED', 'Aurral is not configured');
    }

    const discovery = await getDiscovery();
    return successResponse(discovery);
  },
  {
    service: 'aurral',
    operation: 'discover',
    defaultCode: 'AURRAL_DISCOVER_ERROR',
    defaultMessage: 'Failed to fetch discovery recommendations',
  }
);

export const Route = createFileRoute('/api/aurral/discover')({
  server: { handlers: { GET } },
});
