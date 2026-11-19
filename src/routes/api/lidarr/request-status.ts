import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
  serviceUnavailableResponse,
} from '../../../lib/utils/api-response';

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/lidarr/request-status?mbid=… — live Lidarr state for an artist the
 * library doesn't have yet, plus who has requested what (#436). Read straight
 * from Lidarr so the card never trusts the stale metadata cache (#435).
 */
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const { getConfigAsync } = await import('../../../lib/config/config');
    const config = await getConfigAsync();
    if (!config.lidarrUrl || !config.lidarrApiKey) {
      return serviceUnavailableResponse('LIDARR_NOT_CONFIGURED', 'Lidarr is not configured');
    }

    const mbid = new URL(request.url).searchParams.get('mbid') ?? '';
    if (!MBID.test(mbid)) {
      return errorResponse('VALIDATION_ERROR', 'mbid is required', { status: 400 });
    }

    const { getArtistRequestStatus, getAlbumsFiledElsewhere } = await import('../../../lib/services/lidarr-request');
    const { getRequestSummary } = await import('../../../lib/services/artist-requests');
    const [status, requests] = await Promise.all([
      getArtistRequestStatus(mbid),
      getRequestSummary(mbid, session.user.id).catch(() => ({})),
    ]);
    // Collabs requested from this card live under their lead artist in Lidarr (#436): look those
    // up by release-group id so the card shows their real state instead of offering Get again.
    const elsewhere = Object.keys(requests).filter(key => key !== 'artist' && !(key in status.albums));
    const filedElsewhere = elsewhere.length ? await getAlbumsFiledElsewhere(elsewhere).catch(() => ({})) : {};
    return successResponse({ ...status, albums: { ...filedElsewhere, ...status.albums }, requests });
  },
  {
    service: 'lidarr',
    operation: 'request-status',
    defaultCode: 'LIDARR_STATUS_ERROR',
    defaultMessage: 'Failed to read Lidarr status',
  },
);

export const Route = createFileRoute('/api/lidarr/request-status')({
  server: { handlers: { GET } },
});
