/**
 * GET /api/dj/known-transitions — the user's known transitions (DJ tab "Set prep"), most played first.
 * Optional ?from=<songId> limits to the exits of one song.
 */
import { createFileRoute } from '@tanstack/react-router';
import { and, desc, eq } from 'drizzle-orm';
import { auth } from '~/lib/auth/auth';
import { db } from '~/lib/db';
import { knownTransitions } from '~/lib/db/schema';
import { canonicalNavidromeId } from '~/lib/utils/navidrome-id';

export const Route = createFileRoute('/api/dj/known-transitions/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return new Response('Unauthorized', { status: 401 });
        const from = new URL(request.url).searchParams.get('from');
        const where = from
          ? and(eq(knownTransitions.userId, session.user.id), eq(knownTransitions.fromSongId, canonicalNavidromeId(from)))
          : eq(knownTransitions.userId, session.user.id);
        const rows = await db
          .select()
          .from(knownTransitions)
          .where(where)
          .orderBy(desc(knownTransitions.plays), desc(knownTransitions.updatedAt));
        return Response.json({ data: rows });
      },
    },
  },
});
