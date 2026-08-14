/**
 * Star/Unstar API proxy for Navidrome
 * POST /api/navidrome/star?id={songId} — star a song
 * DELETE /api/navidrome/star?id={songId} — unstar a song
 *
 * Uses per-user Navidrome credentials so stars are scoped to the user.
 * Also syncs to recommendation_feedback and liked_songs_sync tables
 * so the PlayerBar heart icon stays consistent with Navidrome stars.
 */

import { createFileRoute } from '@tanstack/react-router';
import { ensureNavidromeUser } from '../../../lib/services/navidrome-users';
import { setSongLiked } from '../../../lib/services/liked-songs-sync';
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
    // Single write-through: Navidrome star + feedback + ledger + playlist mirror.
    await setSongLiked(session.user.id, songId, true, creds);

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
    // Single write-through: Navidrome unstar + feedback + ledger + playlist mirror.
    await setSongLiked(session.user.id, songId, false, creds);

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
