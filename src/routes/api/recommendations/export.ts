import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { recommendationFeedback } from '../../../lib/db/schema';
import { eq } from 'drizzle-orm';

export const Route = createFileRoute("/api/recommendations/export")({
  server: {
    handlers: {
  // GET /api/recommendations/export - Export all user feedback data as JSON
  GET: async ({ request }) => {
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
      // Fetch all user feedback
      const allFeedback = await db
        .select()
        .from(recommendationFeedback)
        .where(eq(recommendationFeedback.userId, session.user.id));

      // Prepare export data
      const exportData = {
        exportedAt: new Date().toISOString(),
        userId: session.user.id,
        totalFeedbackCount: allFeedback.length,
        feedback: allFeedback.map(f => ({
          songArtistTitle: f.songArtistTitle,
          feedbackType: f.feedbackType,
          source: f.source,
          timestamp: f.timestamp.toISOString(),
        })),
      };

      // Return as downloadable JSON
      return new Response(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="aidj-feedback-export-${new Date().toISOString().split('T')[0]}.json"`,
        }
      });
    } catch (error: unknown) {
      console.error('Failed to export feedback data:', error);

      const message = error instanceof Error ? error.message : 'Failed to export feedback data';
      return new Response(JSON.stringify({
        code: 'EXPORT_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
    },
  },
});
