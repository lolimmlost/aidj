/**
 * Advanced Discovery Analytics API
 *
 * GET /api/recommendations/discovery-analytics - Get comprehensive discovery analytics
 *
 * Query params:
 * - period: '7d' | '30d' | '90d' | '1y' | 'all' (default: '30d')
 * - metrics: comma-separated list of metrics to include (default: 'all')
 *   - mode: Acceptance rate by recommendation mode
 *   - artists: Top recommended artists
 *   - genres: Top recommended genres
 *   - engagement: Engagement patterns by time/day
 *   - abtest: A/B test results
 *
 * Returns comprehensive analytics for the Advanced Discovery Analytics Dashboard.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import {
  withAuthAndErrorHandling,
} from '../../../lib/utils/api-response';
import {
  getDiscoveryAnalyticsSummary,
  getAcceptanceRateByMode,
  getTopRecommendedArtists,
  getTopRecommendedGenres,
  getEngagementPatterns,
  getABTestResults,
} from '../../../lib/services/advanced-discovery-analytics';
import type {
  RecommendationModeMetrics,
  TopArtistMetric,
  TopGenreMetric,
  EngagementPattern,
  ABTest,
} from '../../../lib/services/advanced-discovery-analytics';

// Request validation schema
const AnalyticsRequestSchema = z.object({
  period: z.enum(['7d', '30d', '90d', '1y', 'all']).optional().default('30d'),
  metrics: z.string().optional().default('all'),
  artistLimit: z.coerce.number().min(1).max(100).optional().default(20),
  genreLimit: z.coerce.number().min(1).max(50).optional().default(15),
});

// Response type
export interface AdvancedDiscoveryAnalyticsResponse {
  success: boolean;
  period: '7d' | '30d' | '90d' | '1y' | 'all';
  metrics: {
    summary?: {
      totalFeedback: number;
      overallAcceptanceRate: number;
      discoveryScore: number;
      weekOverWeekChange: number;
      monthOverMonthChange: number;
    };
    modeMetrics?: RecommendationModeMetrics[];
    topArtists?: TopArtistMetric[];
    topGenres?: TopGenreMetric[];
    engagementPatterns?: EngagementPattern[];
    abTests?: {
      active: ABTest[];
      completed: ABTest[];
    };
  };
  generatedAt: string;
}

// GET /api/recommendations/discovery-analytics
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const params = {
      period: url.searchParams.get('period') || '30d',
      metrics: url.searchParams.get('metrics') || 'all',
      artistLimit: url.searchParams.get('artistLimit') || '20',
      genreLimit: url.searchParams.get('genreLimit') || '15',
    };

    const validated = AnalyticsRequestSchema.parse(params);
    const userId = session.user.id;

    // Determine which metrics to fetch
    const requestedMetrics = validated.metrics === 'all'
      ? ['summary', 'mode', 'artists', 'genres', 'engagement', 'abtest']
      : validated.metrics.split(',').map(m => m.trim().toLowerCase());

    // Build response based on requested metrics
    const response: AdvancedDiscoveryAnalyticsResponse = {
      success: true,
      period: validated.period,
      metrics: {},
      generatedAt: new Date().toISOString(),
    };

    // Fetch requested metrics in parallel where possible
    const fetchPromises: Promise<void>[] = [];

    // If 'all' or 'summary' is requested, fetch the full summary
    if (requestedMetrics.includes('summary') || requestedMetrics.includes('all')) {
      fetchPromises.push(
        (async () => {
          const summary = await getDiscoveryAnalyticsSummary(userId, validated.period);
          response.metrics.summary = {
            totalFeedback: summary.totalFeedback,
            overallAcceptanceRate: summary.overallAcceptanceRate,
            discoveryScore: summary.discoveryScore,
            weekOverWeekChange: summary.weekOverWeekChange,
            monthOverMonthChange: summary.monthOverMonthChange,
          };

          // If full summary, populate all metrics from it
          if (requestedMetrics.includes('all')) {
            response.metrics.modeMetrics = summary.modeMetrics;
            response.metrics.topArtists = summary.topRecommendedArtists;
            response.metrics.topGenres = summary.topRecommendedGenres;
            response.metrics.engagementPatterns = summary.engagementPatterns;
            response.metrics.abTests = {
              active: summary.activeTests,
              completed: summary.completedTests,
            };
          }
        })()
      );
    } else {
      // Fetch individual metrics as requested
      if (requestedMetrics.includes('mode')) {
        fetchPromises.push(
          (async () => {
            response.metrics.modeMetrics = await getAcceptanceRateByMode(userId, validated.period);
          })()
        );
      }

      if (requestedMetrics.includes('artists')) {
        fetchPromises.push(
          (async () => {
            response.metrics.topArtists = await getTopRecommendedArtists(
              userId,
              validated.period,
              validated.artistLimit
            );
          })()
        );
      }

      if (requestedMetrics.includes('genres')) {
        fetchPromises.push(
          (async () => {
            response.metrics.topGenres = await getTopRecommendedGenres(
              userId,
              validated.period,
              validated.genreLimit
            );
          })()
        );
      }

      if (requestedMetrics.includes('engagement')) {
        fetchPromises.push(
          (async () => {
            response.metrics.engagementPatterns = await getEngagementPatterns(userId, validated.period);
          })()
        );
      }

      if (requestedMetrics.includes('abtest')) {
        fetchPromises.push(
          (async () => {
            const abTests = await getABTestResults(userId, validated.period);
            response.metrics.abTests = abTests;
          })()
        );
      }
    }

    // Wait for all metrics to be fetched
    await Promise.all(fetchPromises);

    // Return raw response (not wrapped in { data: ... }) for frontend compatibility
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
  {
    service: 'discovery-analytics',
    operation: 'get-analytics',
    defaultCode: 'DISCOVERY_ANALYTICS_ERROR',
    defaultMessage: 'Failed to get discovery analytics',
  }
);

export const Route = createFileRoute("/api/recommendations/discovery-analytics")({
  server: {
    handlers: {
      GET,
    },
  },
});
