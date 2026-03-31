import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '../../../lib/utils/api-response';
import {
  isSpotifyConfigured,
  isAuthenticated,
  getStoredSpotifyProfile,
} from '../../../lib/services/spotify';

const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    const configured = isSpotifyConfigured();

    if (!configured) {
      return successResponse({ configured: false, connected: false });
    }

    const connected = await isAuthenticated(session.user.id);
    let username: string | undefined;

    if (connected) {
      const profile = await getStoredSpotifyProfile(session.user.id);
      username = profile?.platformUsername;
    }

    return successResponse({ configured, connected, username });
  },
  {
    service: 'playlists/spotify-status',
    operation: 'get-status',
    defaultCode: 'SPOTIFY_STATUS_ERROR',
    defaultMessage: 'Failed to get Spotify status',
  }
);

export const Route = createFileRoute('/api/playlists/spotify-status')({
  server: { handlers: { GET } },
});
