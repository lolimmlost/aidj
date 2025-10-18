import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { recommendationFeedback } from '../../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { clearPreferenceCache } from '../../../lib/services/preferences';

export const ServerRoute = createServerFileRoute('/api/recommendations/clear').methods({
  // DELETE /api/recommendations/clear - Delete all user feedback data
  DELETE: async ({ request }) => {
    // Authentication middleware validation
    const session = await auth.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true,
      },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // Count existing feedback before deletion (for confirmation)
      const existingFeedback = await db
        .select()
        .from(recommendationFeedback)
        .where(eq(recommendationFeedback.userId, session.user.id));

      const deletedCount = existingFeedback.length;

      // Delete all user feedback
      await db
        .delete(recommendationFeedback)
        .where(eq(recommendationFeedback.userId, session.user.id));

      // Clear user's preference cache
      clearPreferenceCache(session.user.id);

      return new Response(JSON.stringify({
        success: true,
        deletedCount,
        message: `Successfully deleted ${deletedCount} feedback items`,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to clear feedback data:', error);

      const message = error instanceof Error ? error.message : 'Failed to clear feedback data';
      return new Response(JSON.stringify({
        code: 'CLEAR_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
