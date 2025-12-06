// API endpoint for mood-based recommendations
// Phase 3: Updated to use unified recommendations service (AI mood translation)

import { createFileRoute } from "@tanstack/react-router";
import { ServiceError } from '../../lib/utils';
import { getRecommendations } from '../../lib/services/recommendations';
import { auth } from '../../lib/auth/auth';

export const Route = createFileRoute("/api/recommendations")({
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
      const { prompt, limit = 20 } = await request.json() as {
        prompt: string;
        limit?: number;
        // Deprecated: These are no longer used
        model?: string;
        useGenreFiltering?: boolean;
      };

      if (!prompt) {
        return new Response(JSON.stringify({ error: 'Prompt required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log(`🎭 Generating mood-based recommendations for: "${prompt}"`);

      // Use the unified recommendations service with 'mood' mode
      // AI translates the mood to a smart playlist query, then Navidrome evaluates it
      const result = await getRecommendations({
        mode: 'mood',
        moodDescription: prompt,
        limit,
      });

      console.log(`✅ Got ${result.songs.length} recommendations from ${result.source}`);

      // Transform to legacy format for backward compatibility
      const recommendations = result.songs.map(song => ({
        song: `${song.artist} - ${song.title}`,
        explanation: `Matched your mood: "${prompt}"`,
        songId: song.id,
        url: song.url,
        inLibrary: true,
      }));

      return new Response(JSON.stringify({
        data: {
          recommendations,
          source: result.source,
          mode: result.mode,
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Recommendation generation failed:', error);
      let code = 'GENERAL_API_ERROR';
      let message = 'Failed to generate recommendations';
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
