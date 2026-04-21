import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '@/lib/utils/api-response';
import { createPlaylist } from '@/lib/services/navidrome';
import { getNavidromeUserCreds } from '@/lib/services/navidrome-users';

const SaveAsPlaylistSchema = z.object({
  name: z.string().min(1).max(120),
  songIds: z.array(z.string().min(1)).min(1).max(200),
});

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const parsed = SaveAsPlaylistSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VALIDATION_ERROR', 'Invalid save-as-playlist request', {
        status: 400,
        details: { issues: parsed.error.issues },
      });
    }

    const { name, songIds } = parsed.data;
    const creds = await getNavidromeUserCreds(session.user.id);
    if (!creds) {
      return errorResponse(
        'NAVIDROME_USER_MISSING',
        'No per-user Navidrome account is linked to this user. Re-onboard to create one.',
        { status: 409 },
      );
    }

    const playlist = await createPlaylist(name, songIds, creds);
    return successResponse(
      {
        playlistId: playlist.id,
        name: playlist.name,
        songCount: playlist.songCount,
      },
      201,
    );
  },
  {
    service: 'radio',
    operation: 'save-as-playlist',
    defaultCode: 'RADIO_SAVE_PLAYLIST_ERROR',
    defaultMessage: 'Failed to save radio as playlist',
  },
);

export const Route = createFileRoute('/api/radio/save-as-playlist')({
  server: { handlers: { POST } },
});
