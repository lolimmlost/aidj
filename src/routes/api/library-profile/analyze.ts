import { createFileRoute } from "@tanstack/react-router";
import { ServiceError } from '../../../lib/utils';
import { getOrCreateLibraryProfile } from '../../../lib/services/library-profile';
import { auth } from '../../../lib/auth/auth';

export const Route = createFileRoute("/api/library-profile/analyze")({
  server: {
    handlers: {
  POST: async ({ request }) => {
    // Auth check (protected route)
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
      const { forceRefresh } = await request.json() as { forceRefresh?: boolean };

      // Get or create library profile
      const profile = await getOrCreateLibraryProfile(session.user.id, forceRefresh || false);

      return new Response(JSON.stringify({
        profile: {
          genreDistribution: profile.genreDistribution,
          topKeywords: profile.topKeywords,
          totalSongs: profile.totalSongs,
          lastAnalyzed: profile.lastAnalyzed.toISOString(),
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Library profile analysis failed:', error);
      let code = 'GENERAL_API_ERROR';
      let message = 'Failed to analyze library profile';

      if (error instanceof ServiceError) {
        code = error.code;
        message = error.message;
      } else if (error instanceof Error) {
        message = error.message;
      }

      return new Response(JSON.stringify({ code, message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
    },
  },
});
