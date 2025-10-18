import { createServerFileRoute } from '@tanstack/react-start/server';
import { auth } from '../../../lib/auth/auth';
import { buildUserPreferenceProfile } from '../../../lib/services/preferences';
import {
  getTasteEvolutionTimeline,
  getRecommendationQualityMetrics,
  getActivityTrends,
  getDiscoveryInsights,
} from '../../../lib/services/recommendation-analytics';

// Legacy response type for backward compatibility
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

// Enhanced analytics response with comprehensive metrics
export interface EnhancedAnalyticsResponse {
  // Basic profile (legacy compatibility)
  profile: {
    likedArtists: Array<{ artist: string; count: number }>;
    dislikedArtists: Array<{ artist: string; count: number }>;
    feedbackCount: {
      total: number;
      thumbsUp: number;
      thumbsDown: number;
    };
  };

  // Taste evolution over time
  tasteEvolution?: {
    dataPoints: Array<{
      period: string;
      dominantArtists: string[];
      thumbsUpCount: number;
      thumbsDownCount: number;
    }>;
    periodType: 'week' | 'month';
  };

  // Quality metrics
  quality?: {
    acceptanceRate: number;
    totalRecommendations: number;
    thumbsUpCount: number;
    thumbsDownCount: number;
    qualityTrend: 'improving' | 'declining' | 'stable';
  };

  // Activity patterns
  activity?: {
    feedbackByDayOfWeek: Record<number, number>;
    feedbackByHourOfDay: Record<number, number>;
    peakDayOfWeek: number | null;
    peakHourOfDay: number | null;
    totalFeedbackCount: number;
    listeningPatternInsights: string[];
  };

  // Discovery insights
  discovery?: {
    newArtistsDiscovered: number;
    genreDiversityScore: number;
    diversityTrend: 'expanding' | 'narrowing' | 'stable';
    newArtistNames: string[];
  };
}

export const ServerRoute = createServerFileRoute('/api/recommendations/analytics').methods({
  // GET /api/recommendations/analytics - Retrieve user preference analytics
  // Query params: ?period=30d|90d|1y  &metrics=quality,activity,taste,discovery
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
      // Parse query parameters
      const url = new URL(request.url);
      const periodParam = url.searchParams.get('period') || '30d';
      const metricsParam = url.searchParams.get('metrics') || 'all';

      // Convert period to days
      const periodDays = periodParam === '90d' ? 90 : periodParam === '1y' ? 365 : 30;

      // Determine which metrics to fetch
      const requestedMetrics = metricsParam === 'all'
        ? ['quality', 'activity', 'taste', 'discovery']
        : metricsParam.split(',').map(m => m.trim());

      // Build user preference profile (always needed for basic profile)
      const profile = await buildUserPreferenceProfile(session.user.id);

      // Build enhanced analytics response
      const analytics: EnhancedAnalyticsResponse = {
        profile: {
          likedArtists: profile.likedArtists.slice(0, 10),
          dislikedArtists: profile.dislikedArtists.slice(0, 5),
          feedbackCount: {
            total: profile.totalFeedbackCount,
            thumbsUp: profile.thumbsUpCount,
            thumbsDown: profile.thumbsDownCount,
          },
        },
      };

      // Fetch taste evolution if requested
      if (requestedMetrics.includes('taste')) {
        const tasteEvolution = await getTasteEvolutionTimeline(session.user.id, periodDays);
        analytics.tasteEvolution = {
          dataPoints: tasteEvolution.dataPoints.map(dp => ({
            period: dp.period,
            dominantArtists: dp.dominantArtists,
            thumbsUpCount: dp.thumbsUpCount,
            thumbsDownCount: dp.thumbsDownCount,
          })),
          periodType: tasteEvolution.periodType,
        };
      }

      // Fetch quality metrics if requested
      if (requestedMetrics.includes('quality')) {
        const quality = await getRecommendationQualityMetrics(session.user.id);
        analytics.quality = quality;
      }

      // Fetch activity trends if requested
      if (requestedMetrics.includes('activity')) {
        const activity = await getActivityTrends(session.user.id);
        analytics.activity = {
          feedbackByDayOfWeek: Object.fromEntries(activity.feedbackByDayOfWeek),
          feedbackByHourOfDay: Object.fromEntries(activity.feedbackByHourOfDay),
          peakDayOfWeek: activity.peakDayOfWeek,
          peakHourOfDay: activity.peakHourOfDay,
          totalFeedbackCount: activity.totalFeedbackCount,
          listeningPatternInsights: activity.listeningPatternInsights,
        };
      }

      // Fetch discovery insights if requested
      if (requestedMetrics.includes('discovery')) {
        const discovery = await getDiscoveryInsights(session.user.id, periodDays);
        analytics.discovery = discovery;
      }

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
