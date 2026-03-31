import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';
import {
  isSpotifyConfigured,
  isAuthenticated,
  getUserPlaylistSummaries,
} from '../../../lib/services/spotify';

const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    if (!isSpotifyConfigured()) {
      return errorResponse('SPOTIFY_NOT_CONFIGURED', 'Spotify is not configured', { status: 503 });
    }

    const connected = await isAuthenticated(session.user.id);
    if (!connected) {
      return errorResponse('SPOTIFY_NOT_CONNECTED', 'Spotify account not connected. Please connect first.', { status: 401 });
    }

    const playlists = await getUserPlaylistSummaries(session.user.id);
    return successResponse({ playlists });
  },
  {
    service: 'playlists/spotify-playlists',
    operation: 'list',
    defaultCode: 'SPOTIFY_PLAYLISTS_ERROR',
    defaultMessage: 'Failed to fetch Spotify playlists',
  }
);

export const Route = createFileRoute('/api/playlists/spotify-playlists')({
  server: { handlers: { GET } },
});
