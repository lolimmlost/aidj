/**
 * Star/Unstar API proxy for Navidrome
 * POST /api/navidrome/star?id={songId} — star a song
 * DELETE /api/navidrome/star?id={songId} — unstar a song
 *
 * Uses per-user Navidrome credentials so stars are scoped to the user.
 */

import { createFileRoute } from '@tanstack/react-router';
import { starSong, unstarSong } from '../../../lib/services/navidrome';
import { ensureNavidromeUser } from '../../../lib/services/navidrome-users';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const songId = url.searchParams.get('id');

    if (!songId) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'Song ID required', { status: 400 });
    }

    const creds = await ensureNavidromeUser(session.user.id, session.user.name, session.user.email);
    await starSong(songId, creds);
    return successResponse({ starred: true, songId });
  },
  {
    service: 'navidrome',
    operation: 'star',
    defaultCode: 'STAR_ERROR',
    defaultMessage: 'Failed to star song',
  }
);

const DELETE = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const songId = url.searchParams.get('id');

    if (!songId) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'Song ID required', { status: 400 });
    }

    const creds = await ensureNavidromeUser(session.user.id, session.user.name, session.user.email);
    await unstarSong(songId, creds);
    return successResponse({ starred: false, songId });
  },
  {
    service: 'navidrome',
    operation: 'unstar',
    defaultCode: 'UNSTAR_ERROR',
    defaultMessage: 'Failed to unstar song',
  }
);

export const Route = createFileRoute('/api/navidrome/star')({
  server: {
    handlers: {
      POST,
      DELETE,
    },
  },
});
