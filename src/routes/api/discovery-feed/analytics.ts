/**
 * Discovery Feed Analytics API
 *
 * GET /api/discovery-feed/analytics - Get analytics for discovery feed
 *
 * Returns engagement metrics and recommendation quality data.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '../../../lib/utils/api-response';
import {
  getRealTimeMetrics,
  getQualityScore,
  getAnalyticsTrend,
  type AnalyticsPeriod,
} from '../../../lib/services/discovery-analytics';

// Request validation schema
const AnalyticsRequestSchema = z.object({
  period: z.enum(['day', 'week', 'month']).optional().default('day'),
  trend: z.number().min(1).max(30).optional().default(7),
});

// GET /api/discovery-feed/analytics
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const params = {
      period: url.searchParams.get('period') || 'day',
      trend: parseInt(url.searchParams.get('trend') || '7', 10),
    };

    const validated = AnalyticsRequestSchema.parse(params);
    const userId = session.user.id;

    // Get real-time metrics
    const metrics = await getRealTimeMetrics(userId);

    // Get quality score
    const qualityScore = await getQualityScore(userId);

    // Get trend data
    const level = validated.period === 'day' ? 'daily' :
                  validated.period === 'week' ? 'weekly' : 'monthly';
    const trend = await getAnalyticsTrend(validated.trend, level, userId);

    return successResponse({
      metrics,
      qualityScore,
      trend,
      period: validated.period,
    });
  },
  {
    service: 'discovery-feed',
    operation: 'get-analytics',
    defaultCode: 'ANALYTICS_ERROR',
    defaultMessage: 'Failed to get analytics',
  }
);

export const Route = createFileRoute("/api/discovery-feed/analytics")({
  server: {
    handlers: {
      GET,
    },
  },
});
