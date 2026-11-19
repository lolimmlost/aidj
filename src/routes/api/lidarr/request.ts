import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
  serviceUnavailableResponse,
} from '../../../lib/utils/api-response';

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/lidarr/request — get music for an artist the library doesn't have (#435, #436).
 * Body: { mbid, artistName, mode: 'artist' | 'release' | 'song', releaseGroupId?, songTitle?, recheck? }
 * Release type/title come from the server's MusicBrainz cache, not the client.
 */
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const { getConfigAsync } = await import('../../../lib/config/config');
    const config = await getConfigAsync();
    if (!config.lidarrUrl || !config.lidarrApiKey) {
      return serviceUnavailableResponse('LIDARR_NOT_CONFIGURED', 'Lidarr is not configured');
    }

    const body = await request.json().catch(() => ({})) as {
      mbid?: string; artistName?: string; mode?: string;
      releaseGroupId?: string; songTitle?: string; recheck?: boolean;
    };
    const mode = body.mode;
    if (!body.mbid || !MBID.test(body.mbid) || !body.artistName?.trim()) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'mbid and artistName are required', { status: 400 });
    }
    if (mode !== 'artist' && mode !== 'release' && mode !== 'song') {
      return errorResponse('VALIDATION_ERROR', "mode must be 'artist', 'release' or 'song'", { status: 400 });
    }
    if (mode === 'release' && !(body.releaseGroupId && MBID.test(body.releaseGroupId))) {
      return errorResponse('VALIDATION_ERROR', 'releaseGroupId is required for a release', { status: 400 });
    }
    const songTitle = body.songTitle?.trim().slice(0, 200);
    if (mode === 'song' && !songTitle) {
      return errorResponse('VALIDATION_ERROR', 'songTitle is required for a song', { status: 400 });
    }

    const { requestFromLidarr } = await import('../../../lib/services/lidarr-request');
    const { getCachedReleaseGroups, recordRequest, refreshCachedLidarrState } = await import('../../../lib/services/artist-requests');

    const releaseGroups = await getCachedReleaseGroups(body.mbid);
    const rg = mode === 'release' ? releaseGroups.find(r => r.id === body.releaseGroupId) : undefined;

    const input = {
      mbid: body.mbid,
      artistName: body.artistName.trim(),
      mode,
      releaseGroupId: mode === 'release' ? body.releaseGroupId : undefined,
      releaseTitle: rg?.title,
      releaseType: rg?.primaryType,
      songTitle: mode === 'song' ? songTitle : undefined,
      releaseGroups,
      recheck: body.recheck === true,
    } as const;

    const result = await requestFromLidarr(input, {
      lookupAlbum: async (artist, song) => {
        if (!config.lastfmApiKey) return null;
        const { getLastFmClient } = await import('../../../lib/services/lastfm');
        const info = await getLastFmClient(config.lastfmApiKey)?.getTrackInfo(artist, song).catch(() => null);
        return info?.album ?? null;
      },
    });

    // Bookkeeping must not turn a successful Lidarr request into an error.
    try {
      await recordRequest(session.user.id, input, result);
      if (result.lidarrArtistId !== undefined) {
        const monitored = result.outcome === 'monitored' || result.outcome === 'already_monitored';
        await refreshCachedLidarrState(body.mbid, result.lidarrArtistId, monitored);
      }
    } catch (err) {
      console.warn('[lidarr-request] failed to record request:', err);
    }

    console.log(`[lidarr-request] ${session.user.id} ${mode} "${input.artistName}"${result.releaseTitle ? ` / "${result.releaseTitle}"` : ''} → ${result.outcome}`);
    return successResponse(result);
  },
  {
    service: 'lidarr',
    operation: 'request',
    defaultCode: 'LIDARR_REQUEST_ERROR',
    defaultMessage: 'Failed to request from Lidarr',
  },
);

export const Route = createFileRoute('/api/lidarr/request')({
  server: { handlers: { POST } },
});
