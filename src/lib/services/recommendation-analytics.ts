/**
 * Advanced Recommendation Analytics Service
 * Provides time-series analytics, quality metrics, and discovery insights
 */

import { db } from '../db';
import { recommendationFeedback } from '../db/schema';
import { eq, and, gte } from 'drizzle-orm';
import {
  extractArtist,
  getDaysAgo,
  getStartOfWeek,
  getStartOfMonth,
  calculateDiversityScore,
  DAY_NAMES,
} from '../utils/analytics-helpers';

// ============================================================================
// Types
// ============================================================================

export interface TasteEvolutionDataPoint {
  period: string; // ISO date string (start of week/month)
  artistCounts: Map<string, number>; // Artist -> feedback count
  thumbsUpCount: number;
  thumbsDownCount: number;
  dominantArtists: string[]; // Top 3 artists for this period
}

export interface TasteEvolutionTimeline {
  dataPoints: TasteEvolutionDataPoint[];
  periodType: 'week' | 'month';
  startDate: Date;
  endDate: Date;
}

export interface RecommendationQualityMetrics {
  acceptanceRate: number; // thumbsUp / total (0.0 - 1.0)
  totalRecommendations: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
  qualityTrend: 'improving' | 'declining' | 'stable'; // Compare recent vs older
  avgTimeToFeedback: number | null; // Average seconds between recommendation and feedback (future)
}

export interface ActivityTrends {
  feedbackByDayOfWeek: Map<number, number>; // 0 (Sunday) - 6 (Saturday) -> count
  feedbackByHourOfDay: Map<number, number>; // 0-23 -> count
  peakDayOfWeek: number | null;
  peakHourOfDay: number | null;
  totalFeedbackCount: number;
  listeningPatternInsights: string[];
}

export interface DiscoveryInsights {
  newArtistsDiscovered: number; // Artists liked in recent period not seen before
  genreDiversityScore: number; // Shannon entropy (0.0 - 1.0, higher = more diverse)
  diversityTrend: 'expanding' | 'narrowing' | 'stable';
  newArtistNames: string[];
}

// ============================================================================
// Caching
// ============================================================================

interface CachedAnalytics<T> {
  data: T;
  timestamp: number;
}

const analyticsCache = new Map<string, CachedAnalytics<unknown>>();
const ANALYTICS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCachedAnalytics<T>(key: string): T | null {
  const cached = analyticsCache.get(key);
  if (cached && Date.now() - cached.timestamp < ANALYTICS_CACHE_TTL_MS) {
    return cached.data as T;
  }
  return null;
}

function setCachedAnalytics<T>(key: string, data: T): void {
  analyticsCache.set(key, { data, timestamp: Date.now() });
}

export function clearAnalyticsCache(userId?: string): void {
  if (userId) {
    // Clear user-specific cache entries
    for (const key of analyticsCache.keys()) {
      if (key.startsWith(userId)) {
        analyticsCache.delete(key);
      }
    }
  } else {
    analyticsCache.clear();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

// Note: extractArtist, getDaysAgo, getStartOfWeek, getStartOfMonth
// are now imported from '../utils/analytics-helpers'

// ============================================================================
// Taste Evolution Timeline (AC 1)
// ============================================================================

/**
 * Get taste evolution timeline showing how music preferences changed over time
 * Groups feedback by week or month depending on time range
 */
export async function getTasteEvolutionTimeline(
  userId: string,
  days: number = 30
): Promise<TasteEvolutionTimeline> {
  const cacheKey = `${userId}:taste-evolution:${days}`;
  const cached = getCachedAnalytics<TasteEvolutionTimeline>(cacheKey);
  if (cached) return cached;

  const startDate = getDaysAgo(days);
  const endDate = new Date();

  // Determine period type: weekly for <= 90 days, monthly for > 90 days
  const periodType: 'week' | 'month' = days <= 90 ? 'week' : 'month';

  // Fetch all feedback in the time range
  const feedback = await db
    .select()
    .from(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        gte(recommendationFeedback.timestamp, startDate)
      )
    )
    .orderBy(recommendationFeedback.timestamp);

  // Group feedback by period
  const periodMap = new Map<string, {
    artistCounts: Map<string, number>;
    thumbsUpCount: number;
    thumbsDownCount: number;
  }>();

  for (const fb of feedback) {
    const periodStart = periodType === 'week'
      ? getStartOfWeek(fb.timestamp)
      : getStartOfMonth(fb.timestamp);

    const periodKey = periodStart.toISOString();

    if (!periodMap.has(periodKey)) {
      periodMap.set(periodKey, {
        artistCounts: new Map(),
        thumbsUpCount: 0,
        thumbsDownCount: 0,
      });
    }

    const periodData = periodMap.get(periodKey)!;
    const artist = extractArtist(fb.songArtistTitle);

    periodData.artistCounts.set(
      artist,
      (periodData.artistCounts.get(artist) || 0) + 1
    );

    if (fb.feedbackType === 'thumbs_up') {
      periodData.thumbsUpCount++;
    } else {
      periodData.thumbsDownCount++;
    }
  }

  // Convert to data points
  const dataPoints: TasteEvolutionDataPoint[] = Array.from(periodMap.entries())
    .map(([period, data]) => {
      // Get top 3 artists for this period
      const dominantArtists = Array.from(data.artistCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([artist]) => artist);

      return {
        period,
        artistCounts: data.artistCounts,
        thumbsUpCount: data.thumbsUpCount,
        thumbsDownCount: data.thumbsDownCount,
        dominantArtists,
      };
    })
    .sort((a, b) => a.period.localeCompare(b.period));

  const timeline: TasteEvolutionTimeline = {
    dataPoints,
    periodType,
    startDate,
    endDate,
  };

  setCachedAnalytics(cacheKey, timeline);
  return timeline;
}

// ============================================================================
// Recommendation Quality Metrics (AC 2)
// ============================================================================

/**
 * Get recommendation quality metrics and trends
 */
export async function getRecommendationQualityMetrics(
  userId: string
): Promise<RecommendationQualityMetrics> {
  const cacheKey = `${userId}:quality-metrics`;
  const cached = getCachedAnalytics<RecommendationQualityMetrics>(cacheKey);
  if (cached) return cached;

  // Get all feedback
  const allFeedback = await db
    .select()
    .from(recommendationFeedback)
    .where(eq(recommendationFeedback.userId, userId))
    .orderBy(recommendationFeedback.timestamp);

  const totalRecommendations = allFeedback.length;
  const thumbsUpCount = allFeedback.filter(f => f.feedbackType === 'thumbs_up').length;
  const thumbsDownCount = allFeedback.filter(f => f.feedbackType === 'thumbs_down').length;
  const acceptanceRate = totalRecommendations > 0 ? thumbsUpCount / totalRecommendations : 0;

  // Determine quality trend by comparing recent vs older feedback
  let qualityTrend: 'improving' | 'declining' | 'stable' = 'stable';

  if (totalRecommendations >= 10) {
    const midpoint = Math.floor(totalRecommendations / 2);
    const olderFeedback = allFeedback.slice(0, midpoint);
    const recentFeedback = allFeedback.slice(midpoint);

    const olderAcceptanceRate = olderFeedback.filter(f => f.feedbackType === 'thumbs_up').length / olderFeedback.length;
    const recentAcceptanceRate = recentFeedback.filter(f => f.feedbackType === 'thumbs_up').length / recentFeedback.length;

    const difference = recentAcceptanceRate - olderAcceptanceRate;

    if (difference > 0.1) {
      qualityTrend = 'improving';
    } else if (difference < -0.1) {
      qualityTrend = 'declining';
    }
  }

  const metrics: RecommendationQualityMetrics = {
    acceptanceRate,
    totalRecommendations,
    thumbsUpCount,
    thumbsDownCount,
    qualityTrend,
    avgTimeToFeedback: null, // Future enhancement: track recommendation -> feedback latency
  };

  setCachedAnalytics(cacheKey, metrics);
  return metrics;
}

// ============================================================================
// Activity Trends (AC 5)
// ============================================================================

/**
 * Get activity trends showing when user provides feedback
 */
export async function getActivityTrends(userId: string): Promise<ActivityTrends> {
  const cacheKey = `${userId}:activity-trends`;
  const cached = getCachedAnalytics<ActivityTrends>(cacheKey);
  if (cached) return cached;

  // Get all feedback
  const allFeedback = await db
    .select()
    .from(recommendationFeedback)
    .where(eq(recommendationFeedback.userId, userId))
    .orderBy(recommendationFeedback.timestamp);

  const feedbackByDayOfWeek = new Map<number, number>();
  const feedbackByHourOfDay = new Map<number, number>();

  for (const fb of allFeedback) {
    const date = new Date(fb.timestamp);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    const hourOfDay = date.getHours(); // 0-23

    feedbackByDayOfWeek.set(dayOfWeek, (feedbackByDayOfWeek.get(dayOfWeek) || 0) + 1);
    feedbackByHourOfDay.set(hourOfDay, (feedbackByHourOfDay.get(hourOfDay) || 0) + 1);
  }

  // Find peak day and hour
  let peakDayOfWeek: number | null = null;
  let maxDayCount = 0;
  for (const [day, count] of feedbackByDayOfWeek.entries()) {
    if (count > maxDayCount) {
      maxDayCount = count;
      peakDayOfWeek = day;
    }
  }

  let peakHourOfDay: number | null = null;
  let maxHourCount = 0;
  for (const [hour, count] of feedbackByHourOfDay.entries()) {
    if (count > maxHourCount) {
      maxHourCount = count;
      peakHourOfDay = hour;
    }
  }

  // Generate insights
  const insights: string[] = [];

  if (peakDayOfWeek !== null) {
    insights.push(`Most active on ${DAY_NAMES[peakDayOfWeek]}`);
  }

  if (peakHourOfDay !== null) {
    const timeOfDay = peakHourOfDay < 12 ? 'morning' : peakHourOfDay < 17 ? 'afternoon' : 'evening';
    insights.push(`Peak listening in the ${timeOfDay} (around ${peakHourOfDay}:00)`);
  }

  // Weekend vs weekday pattern
  const weekendCount = (feedbackByDayOfWeek.get(0) || 0) + (feedbackByDayOfWeek.get(6) || 0);
  const weekdayCount = allFeedback.length - weekendCount;

  if (weekendCount > weekdayCount * 0.5) {
    insights.push('More active on weekends');
  } else if (weekdayCount > weekendCount * 2) {
    insights.push('More active on weekdays');
  }

  const trends: ActivityTrends = {
    feedbackByDayOfWeek,
    feedbackByHourOfDay,
    peakDayOfWeek,
    peakHourOfDay,
    totalFeedbackCount: allFeedback.length,
    listeningPatternInsights: insights,
  };

  setCachedAnalytics(cacheKey, trends);
  return trends;
}

// ============================================================================
// Discovery Insights (AC 6)
// ============================================================================

/**
 * Calculate discovery insights: new artists discovered, genre diversity
 */
export async function getDiscoveryInsights(
  userId: string,
  recentDays: number = 30
): Promise<DiscoveryInsights> {
  const cacheKey = `${userId}:discovery-insights:${recentDays}`;
  const cached = getCachedAnalytics<DiscoveryInsights>(cacheKey);
  if (cached) return cached;

  const recentStartDate = getDaysAgo(recentDays);

  // Get all liked feedback
  const allLikedFeedback = await db
    .select()
    .from(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        eq(recommendationFeedback.feedbackType, 'thumbs_up')
      )
    )
    .orderBy(recommendationFeedback.timestamp);

  // Split into recent and historical
  const recentLiked = allLikedFeedback.filter(f => f.timestamp >= recentStartDate);
  const historicalLiked = allLikedFeedback.filter(f => f.timestamp < recentStartDate);

  // Find new artists discovered
  const historicalArtists = new Set(historicalLiked.map(f => extractArtist(f.songArtistTitle)));
  const recentArtists = recentLiked.map(f => extractArtist(f.songArtistTitle));

  const newArtistNames = recentArtists.filter(artist => !historicalArtists.has(artist));
  const uniqueNewArtists = Array.from(new Set(newArtistNames));
  const newArtistsDiscovered = uniqueNewArtists.length;

  // Calculate genre diversity using artist distribution as proxy
  // Uses Shannon entropy via shared helper
  const recentArtistCounts = new Map<string, number>();
  for (const artist of recentArtists) {
    recentArtistCounts.set(artist, (recentArtistCounts.get(artist) || 0) + 1);
  }

  const genreDiversityScore = calculateDiversityScore(recentArtistCounts);

  // Compare to previous period for trend
  const previousStartDate = getDaysAgo(recentDays * 2);
  const previousPeriodLiked = allLikedFeedback.filter(
    f => f.timestamp >= previousStartDate && f.timestamp < recentStartDate
  );

  const previousArtists = previousPeriodLiked.map(f => extractArtist(f.songArtistTitle));
  const previousArtistCounts = new Map<string, number>();
  for (const artist of previousArtists) {
    previousArtistCounts.set(artist, (previousArtistCounts.get(artist) || 0) + 1);
  }

  const previousDiversityScore = calculateDiversityScore(previousArtistCounts);

  let diversityTrend: 'expanding' | 'narrowing' | 'stable' = 'stable';
  if (genreDiversityScore > previousDiversityScore + 0.1) {
    diversityTrend = 'expanding';
  } else if (genreDiversityScore < previousDiversityScore - 0.1) {
    diversityTrend = 'narrowing';
  }

  const insights: DiscoveryInsights = {
    newArtistsDiscovered,
    genreDiversityScore,
    diversityTrend,
    newArtistNames: uniqueNewArtists.slice(0, 10), // Top 10 new artists
  };

  setCachedAnalytics(cacheKey, insights);
  return insights;
}
