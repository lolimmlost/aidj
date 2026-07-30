import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '@/lib/utils/api-response';

import { getSessionById, rateSession } from '@/lib/services/session-materializer';

const GET = withAuthAndErrorHandling(
  async ({ params, session }) => {
    const { id } = params;

    const result = await getSessionById(id, session.user.id);
    if (!result) {
      return errorResponse('NOT_FOUND', 'Session not found', { status: 404 });
    }

    return successResponse({
      session: {
        ...result.session,
        startedAt: result.session.startedAt.toISOString(),
        endedAt: result.session.endedAt.toISOString(),
        ratedAt: result.session.ratedAt?.toISOString() ?? null,
        createdAt: result.session.createdAt.toISOString(),
        updatedAt: result.session.updatedAt.toISOString(),
      },
      tracks: result.tracks.map((t) => ({
        songId: t.songId,
        artist: t.artist,
        title: t.title,
        album: t.album,
        genre: t.genre,
        playDuration: t.playDuration,
        songDuration: t.songDuration,
        completed: t.completed === 1,
        skipped: t.skipDetected === 1,
        source: t.source,
        playedAt: t.playedAt.toISOString(),
      })),
    });
  },
  {
    service: 'listening-history',
    operation: 'session-detail',
    defaultCode: 'SESSION_DETAIL_ERROR',
    defaultMessage: 'Failed to fetch session details',
  }
);

const POST = withAuthAndErrorHandling(
  async ({ request, params, session }) => {
    const { id } = params;

    const body = await request.json();
    const { rating } = body as { rating: number | null };

    if (rating !== null && rating !== 1) {
      return errorResponse('INVALID_RATING', 'Rating must be 1 (liked) or null (unrate)', { status: 400 });
    }

    const updated = await rateSession(id, session.user.id, rating);
    if (!updated) {
      return errorResponse('NOT_FOUND', 'Session not found', { status: 404 });
    }

    return successResponse({ sessionId: id, rating });
  },
  {
    service: 'listening-history',
    operation: 'session-rate',
    defaultCode: 'SESSION_RATE_ERROR',
    defaultMessage: 'Failed to rate session',
  }
);

export const Route = createFileRoute('/api/listening-history/sessions/$id')({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
});
