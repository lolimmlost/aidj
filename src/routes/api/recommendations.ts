import { createServerFileRoute } from '@tanstack/react-start/server';
import { ServiceError } from '../../lib/utils';
import { generateRecommendations } from '../../lib/services/ollama';
import { getOrCreateLibraryProfile } from '../../lib/services/library-profile';
import { rankRecommendations } from '../../lib/services/genre-matcher';
import { auth } from '../../lib/auth/auth';

export const ServerRoute = createServerFileRoute('/api/recommendations').methods({
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
      const { prompt, model, useGenreFiltering } = await request.json() as {
        prompt: string;
        model?: string;
        useGenreFiltering?: boolean;
      };

      if (!prompt) {
        return new Response(JSON.stringify({ error: 'Prompt required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Generate base recommendations from Ollama
      const recommendations = await generateRecommendations({
        prompt,
        model,
        userId: session.user.id
      });

      // Apply genre-based filtering and ranking if requested (Story 3.7)
      if (useGenreFiltering && session.user.id) {
        try {
          // Get library profile for genre matching
          const libraryProfile = await getOrCreateLibraryProfile(session.user.id, false);

          if (libraryProfile && Object.keys(libraryProfile.genreDistribution).length > 0) {
            // Apply genre similarity scoring and ranking
            const scoredRecommendations = rankRecommendations(
              libraryProfile,
              recommendations.recommendations,
              0.3 // Threshold: filter out scores < 0.3
            );

            console.log(`🎯 Genre filtering: ${recommendations.recommendations.length} → ${scoredRecommendations.length} recommendations after filtering`);

            return new Response(JSON.stringify({
              data: {
                recommendations: scoredRecommendations
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          } else {
            console.log(`⚠️ No genre profile available, returning unfiltered recommendations`);
          }
        } catch (genreError) {
          // Graceful fallback: if genre filtering fails, return basic recommendations
          console.warn('⚠️ Genre filtering failed, falling back to basic recommendations:', genreError);
        }
      }

      // Return basic recommendations (no genre filtering)
      return new Response(JSON.stringify({ data: recommendations }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      // Standardized error (AC3 stub)
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
});
