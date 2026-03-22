import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
  serviceUnavailableResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async () => {
    const { isAurralConfigured, getDownloads } = await import('../../../lib/services/aurral');

    if (!(await isAurralConfigured())) {
      return serviceUnavailableResponse('AURRAL_NOT_CONFIGURED', 'Aurral is not configured');
    }

    const downloads = await getDownloads();
    return successResponse({ downloads });
  },
  {
    service: 'aurral',
    operation: 'downloads',
    defaultCode: 'AURRAL_DOWNLOADS_ERROR',
    defaultMessage: 'Failed to fetch download status',
  }
);

export const Route = createFileRoute('/api/aurral/downloads')({
  server: { handlers: { GET } },
});
