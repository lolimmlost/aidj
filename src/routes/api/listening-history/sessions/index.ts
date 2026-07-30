import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';
import { db } from '@/lib/db';
import { listeningSessions } from '@/lib/db/schema';
import { eq, and, gte, lte, desc, isNotNull, count } from 'drizzle-orm';
import { getPresetRange } from '@/lib/utils/period-comparison';

const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;
    const url = new URL(request.url);

    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const preset = (url.searchParams.get('preset') || 'month') as 'week' | 'month' | 'year';
    const source = url.searchParams.get('source');
    const rated = url.searchParams.get('rated');
    const sort = (url.searchParams.get('sort') || 'recent') as 'recent' | 'longest' | 'rating';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20'), 1), 50);

    const range = fromParam && toParam
      ? { start: new Date(fromParam), end: new Date(toParam) }
      : getPresetRange(preset);

    const conditions = [
      eq(listeningSessions.userId, userId),
      gte(listeningSessions.startedAt, range.start),
      lte(listeningSessions.startedAt, range.end),
    ];

    if (source) {
      conditions.push(eq(listeningSessions.dominantSource, source));
    }
    if (rated === 'true') {
      conditions.push(isNotNull(listeningSessions.rating));
    }

    const orderBy = sort === 'longest'
      ? desc(listeningSessions.durationMinutes)
      : sort === 'rating'
        ? desc(listeningSessions.rating)
        : desc(listeningSessions.startedAt);

    const sessions = await db
      .select()
      .from(listeningSessions)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit);

    const [countResult] = await db
      .select({ total: count() })
      .from(listeningSessions)
      .where(and(...conditions));

    return successResponse({
      sessions: sessions.map((s) => ({
        id: s.id,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt.toISOString(),
        durationMinutes: s.durationMinutes,
        songCount: s.songCount,
        uniqueArtistCount: s.uniqueArtistCount,
        uniqueGenreCount: s.uniqueGenreCount,
        completionRate: s.completionRate,
        skipRate: s.skipRate,
        avgPlayPercentage: s.avgPlayPercentage,
        topArtists: s.topArtists,
        topGenres: s.topGenres,
        sourceMix: s.sourceMix,
        dominantSource: s.dominantSource,
        dayOfWeek: s.dayOfWeek,
        hourOfDay: s.hourOfDay,
        season: s.season,
        rating: s.rating,
        ratedAt: s.ratedAt?.toISOString() ?? null,
      })),
      total: countResult?.total ?? sessions.length,
    });
  },
  {
    service: 'listening-history',
    operation: 'sessions-list',
    defaultCode: 'SESSIONS_ERROR',
    defaultMessage: 'Failed to fetch listening sessions',
  }
);

export const Route = createFileRoute('/api/listening-history/sessions/')({
  server: {
    handlers: {
      GET,
    },
  },
});
