import { createFileRoute } from '@tanstack/react-router';
import { auth } from '~/lib/auth/auth';
import { db } from '~/lib/db';
import { user, session } from '~/lib/db/schema/auth.schema';
import { sql, gt, lt, desc } from 'drizzle-orm';
import { jsonResponse } from '~/lib/utils/api-response';

const GET = async ({ request }: { request: Request }) => {
  try {
    const sess = await auth.api.getSession({ headers: request.headers });
    if (!sess) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (sess.user.role !== 'admin') {
      return new Response('Forbidden', { status: 403 });
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Clean up expired sessions + stale sessions from old 7-day TTL
    // Keep only sessions created in the last 24h (matches new session config)
    const deleted = await db
      .delete(session)
      .where(sql`${session.expiresAt} < ${now} OR ${session.createdAt} < ${oneDayAgo}`)
      .returning({ id: session.id });
    if (deleted.length > 0) {
      console.log(`🧹 Pruned ${deleted.length} expired/stale sessions`);
    }

    // Run queries in parallel
    const [
      totalUsers,
      recentSignups,
      activeSessions,
      signupsToday,
      signupsThisWeek,
      allUsers,
    ] = await Promise.all([
      // Total user count
      db.select({ count: sql<number>`count(*)` }).from(user),
      // Last 10 signups
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        })
        .from(user)
        .orderBy(desc(user.createdAt))
        .limit(10),
      // Active sessions (not expired)
      db
        .select({ count: sql<number>`count(*)` })
        .from(session)
        .where(gt(session.expiresAt, now)),
      // Signups in last 24h
      db
        .select({ count: sql<number>`count(*)` })
        .from(user)
        .where(gt(user.createdAt, oneDayAgo)),
      // Signups in last 7 days
      db
        .select({ count: sql<number>`count(*)` })
        .from(user)
        .where(gt(user.createdAt, oneWeekAgo)),
      // All users for the table
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          banned: user.banned,
          createdAt: user.createdAt,
        })
        .from(user)
        .orderBy(desc(user.createdAt)),
    ]);

    return jsonResponse({
      ok: true,
      stats: {
        totalUsers: Number(totalUsers[0]?.count ?? 0),
        activeSessions: Number(activeSessions[0]?.count ?? 0),
        signupsToday: Number(signupsToday[0]?.count ?? 0),
        signupsThisWeek: Number(signupsThisWeek[0]?.count ?? 0),
      },
      recentSignups,
      users: allUsers,
    });
  } catch (error) {
    console.error('[Admin Stats] Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};

export const Route = createFileRoute('/api/admin/stats')({
  server: { handlers: { GET } },
});
