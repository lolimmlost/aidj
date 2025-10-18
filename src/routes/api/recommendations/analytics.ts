import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../lib/auth/auth';
import {
  buildUserPreferenceProfile,
  getListeningPatterns,
} from '../../../lib/services/preferences';

export interface AnalyticsResponse {
  likedArtists: Array<{ artist: string; count: number }>;
  dislikedArtists: Array<{ artist: string; count: number }>;
  feedbackCount: {
    total: number;
    thumbsUp: number;
    thumbsDown: number;
  };
  topGenres: string[]; // Placeholder for future genre extraction
  activityTrend: {
    hasEnoughData: boolean;
    insights: string[];
  };
}

export const ServerRoute = createServerFileRoute('/api/recommendations/analytics').methods({
  // GET /api/recommendations/analytics - Retrieve user preference analytics
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
      // Build user preference profile
      const profile = await buildUserPreferenceProfile(session.user.id);
      const patterns = await getListeningPatterns(session.user.id);

      // Construct analytics response
      const analytics: AnalyticsResponse = {
        likedArtists: profile.likedArtists.slice(0, 10), // Top 10 liked artists
        dislikedArtists: profile.dislikedArtists.slice(0, 5), // Top 5 disliked artists
        feedbackCount: {
          total: profile.totalFeedbackCount,
          thumbsUp: profile.thumbsUpCount,
          thumbsDown: profile.thumbsDownCount,
        },
        topGenres: [], // TODO: Implement genre extraction in future enhancement
        activityTrend: {
          hasEnoughData: patterns.hasEnoughData,
          insights: patterns.insights,
        },
      };

      return new Response(JSON.stringify(analytics), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to retrieve analytics:', error);

      const message = error instanceof Error ? error.message : 'Failed to retrieve analytics';
      return new Response(JSON.stringify({
        code: 'ANALYTICS_RETRIEVAL_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
