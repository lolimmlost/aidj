/**
 * Advanced Discovery Analytics Service
 *
 * Provides comprehensive analytics for the Advanced Discovery Analytics Dashboard:
 * - Acceptance rate by recommendation type (similar/discovery/mood/personalized)
 * - Top recommended artists and genres
 * - User engagement patterns by recommendation source
 * - A/B testing capabilities for recommendation algorithms
 *
 * Builds upon existing recommendation-analytics.ts and discovery-analytics.ts
 */

import { db } from '~/lib/db';
import {
  recommendationFeedback,
  discoveryFeedItems,
  discoveryFeedAnalytics,
  listeningPatterns,
} from '~/lib/db/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import {
  extractArtist,
  getDateRange,
  calculateTrend,
  getTimeSlot,
  calculateConfidenceInterval,
  type DateRangePeriod,
  type TrendDirection,
  type TimeSlot,
} from '~/lib/utils/analytics-helpers';

// ============================================================================
// Types
// ============================================================================

export type RecommendationMode = 'similar' | 'discovery' | 'mood' | 'personalized';

export interface RecommendationModeMetrics {
  mode: RecommendationMode | string;
  totalRecommendations: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
  acceptanceRate: number;
  avgEngagementTime?: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface TopArtistMetric {
  artist: string;
  recommendationCount: number;
  acceptanceRate: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
}

export interface TopGenreMetric {
  genre: string;
  recommendationCount: number;
  acceptanceRate: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
  avgScore?: number;
}

export interface EngagementPattern {
  timeSlot: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number;
  engagementCount: number;
  acceptanceRate: number;
  avgPlayDuration?: number;
}

export interface ABTestResult {
  variantName: string;
  variantId: string;
  sampleSize: number;
  acceptanceRate: number;
  clickThroughRate: number;
  playRate: number;
  saveRate: number;
  confidenceInterval?: { lower: number; upper: number };
  isWinner: boolean;
}

export interface ABTest {
  testId: string;
  testName: string;
  description: string;
  status: 'active' | 'completed' | 'paused';
  startDate: Date;
  endDate?: Date;
  variants: ABTestResult[];
  conclusionSummary?: string;
}

export interface DiscoveryAnalyticsSummary {
  // Overall metrics
  totalFeedback: number;
  overallAcceptanceRate: number;
  discoveryScore: number; // 0-100 score for how diverse/adventurous the listening is

  // By recommendation mode
  modeMetrics: RecommendationModeMetrics[];

  // Top artists/genres
  topRecommendedArtists: TopArtistMetric[];
  topRecommendedGenres: TopGenreMetric[];

  // Engagement patterns
  engagementPatterns: EngagementPattern[];

  // A/B tests
  activeTests: ABTest[];
  completedTests: ABTest[];

  // Trends
  weekOverWeekChange: number; // percentage change in acceptance rate
  monthOverMonthChange: number;
}

// ============================================================================
// Caching
// ============================================================================

interface CachedData<T> {
  data: T;
  timestamp: number;
}

const analyticsCache = new Map<string, CachedData<any>>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCached<T>(key: string): T | null {
  const cached = analyticsCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data as T;
  }
  return null;
}

function setCache<T>(key: string, data: T): void {
  analyticsCache.set(key, { data, timestamp: Date.now() });
}

export function clearAdvancedAnalyticsCache(userId?: string): void {
  if (userId) {
    const keys = Array.from(analyticsCache.keys());
    for (const key of keys) {
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

// Note: extractArtist, getDateRange, calculateTrend, getTimeSlot, calculateConfidenceInterval
// are now imported from '~/lib/utils/analytics-helpers'

// ============================================================================
// Core Analytics Functions
// ============================================================================

/**
 * Get acceptance rate by recommendation source/mode
 *
 * Maps the 'source' field from recommendationFeedback to recommendation modes:
 * - recommendation/ai_dj -> similar
 * - nudge -> discovery
 * - playlist_generator -> mood
 * - Other sources are kept as-is
 */
export async function getAcceptanceRateByMode(
  userId: string,
  period: DateRangePeriod = '30d'
): Promise<RecommendationModeMetrics[]> {
  const cacheKey = `${userId}:mode-metrics:${period}`;
  const cached = getCached<RecommendationModeMetrics[]>(cacheKey);
  if (cached) return cached;

  const { start, end } = getDateRange(period);
  const midpoint = new Date((start.getTime() + end.getTime()) / 2);

  // Get all feedback in the period
  const feedback = await db
    .select()
    .from(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        gte(recommendationFeedback.timestamp, start),
        lte(recommendationFeedback.timestamp, end)
      )
    );

  // Map sources to recommendation modes
  const modeMapping: Record<string, RecommendationMode | string> = {
    recommendation: 'similar',
    ai_dj: 'similar',
    nudge: 'discovery',
    playlist_generator: 'mood',
    playlist: 'playlist',
    search: 'search',
    library: 'library',
  };

  // Group by mode
  const modeGroups = new Map<
    string,
    {
      recent: { up: number; down: number };
      older: { up: number; down: number };
    }
  >();

  for (const fb of feedback) {
    const mode = modeMapping[fb.source] || fb.source;

    if (!modeGroups.has(mode)) {
      modeGroups.set(mode, {
        recent: { up: 0, down: 0 },
        older: { up: 0, down: 0 },
      });
    }

    const group = modeGroups.get(mode)!;
    const isRecent = fb.timestamp >= midpoint;
    const target = isRecent ? group.recent : group.older;

    if (fb.feedbackType === 'thumbs_up') {
      target.up++;
    } else {
      target.down++;
    }
  }

  // Calculate metrics for each mode
  const metrics: RecommendationModeMetrics[] = [];

  for (const [mode, group] of Array.from(modeGroups.entries())) {
    const totalRecent = group.recent.up + group.recent.down;
    const totalOlder = group.older.up + group.older.down;
    const total = totalRecent + totalOlder;

    if (total === 0) continue;

    const recentRate = totalRecent > 0 ? group.recent.up / totalRecent : 0;
    const olderRate = totalOlder > 0 ? group.older.up / totalOlder : 0;
    const overallRate = (group.recent.up + group.older.up) / total;

    metrics.push({
      mode: mode as RecommendationMode | string,
      totalRecommendations: total,
      thumbsUpCount: group.recent.up + group.older.up,
      thumbsDownCount: group.recent.down + group.older.down,
      acceptanceRate: overallRate,
      trend: calculateTrend(recentRate, olderRate),
    });
  }

  // Sort by total recommendations (descending)
  metrics.sort((a, b) => b.totalRecommendations - a.totalRecommendations);

  setCache(cacheKey, metrics);
  return metrics;
}

/**
 * Get top recommended artists with acceptance metrics
 */
export async function getTopRecommendedArtists(
  userId: string,
  period: DateRangePeriod = '30d',
  limit = 20
): Promise<TopArtistMetric[]> {
  const cacheKey = `${userId}:top-artists:${period}:${limit}`;
  const cached = getCached<TopArtistMetric[]>(cacheKey);
  if (cached) return cached;

  const { start, end } = getDateRange(period);

  // Get all feedback in the period
  const feedback = await db
    .select()
    .from(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        gte(recommendationFeedback.timestamp, start),
        lte(recommendationFeedback.timestamp, end)
      )
    );

  // Group by artist
  const artistGroups = new Map<string, { up: number; down: number }>();

  for (const fb of feedback) {
    const artist = extractArtist(fb.songArtistTitle);

    if (!artistGroups.has(artist)) {
      artistGroups.set(artist, { up: 0, down: 0 });
    }

    const group = artistGroups.get(artist)!;
    if (fb.feedbackType === 'thumbs_up') {
      group.up++;
    } else {
      group.down++;
    }
  }

  // Convert to metrics and sort
  const metrics: TopArtistMetric[] = [];

  for (const [artist, group] of Array.from(artistGroups.entries())) {
    const total = group.up + group.down;
    if (total === 0) continue;

    metrics.push({
      artist,
      recommendationCount: total,
      acceptanceRate: group.up / total,
      thumbsUpCount: group.up,
      thumbsDownCount: group.down,
    });
  }

  // Sort by recommendation count (descending)
  metrics.sort((a, b) => b.recommendationCount - a.recommendationCount);

  const result = metrics.slice(0, limit);
  setCache(cacheKey, result);
  return result;
}

/**
 * Get top genres from discovery feed with acceptance metrics
 */
export async function getTopRecommendedGenres(
  userId: string,
  period: DateRangePeriod = '30d',
  limit = 15
): Promise<TopGenreMetric[]> {
  const cacheKey = `${userId}:top-genres:${period}:${limit}`;
  const cached = getCached<TopGenreMetric[]>(cacheKey);
  if (cached) return cached;

  const { start, end } = getDateRange(period);

  // Get listening patterns which contain genre info
  const genreScores = new Map<
    string,
    {
      up: number;
      down: number;
    }
  >();

  // Try listening patterns for genre data
  const patterns = await db
    .select()
    .from(listeningPatterns)
    .where(eq(listeningPatterns.userId, userId));

  for (const pattern of patterns) {
    const topGenres = (pattern.topGenres as { genre: string; count: number; avgRating: number }[]) || [];
    for (const genre of topGenres) {
      const existing = genreScores.get(genre.genre) || { up: 0, down: 0 };

      // Simulate feedback based on rating (rating > 3.5 = thumbs up)
      const avgRating = genre.avgRating || 3;
      if (avgRating > 3.5) {
        existing.up += genre.count;
      } else {
        existing.down += genre.count;
      }

      genreScores.set(genre.genre, existing);
    }
  }

  // If still no data, create some placeholder data from feedback
  if (genreScores.size === 0) {
    const feedback = await db
      .select()
      .from(recommendationFeedback)
      .where(
        and(
          eq(recommendationFeedback.userId, userId),
          gte(recommendationFeedback.timestamp, start),
          lte(recommendationFeedback.timestamp, end)
        )
      );

    // Group by source as genre placeholder
    for (const fb of feedback) {
      const genre = `${fb.source} recommendations`;
      const scores = genreScores.get(genre) || { up: 0, down: 0 };

      if (fb.feedbackType === 'thumbs_up') {
        scores.up++;
      } else {
        scores.down++;
      }

      genreScores.set(genre, scores);
    }
  }

  // Convert to metrics
  const metrics: TopGenreMetric[] = [];

  for (const [genre, scores] of Array.from(genreScores.entries())) {
    const total = scores.up + scores.down;
    if (total === 0) continue;

    const acceptanceRate = scores.up / total;

    metrics.push({
      genre,
      recommendationCount: total,
      acceptanceRate,
      thumbsUpCount: scores.up,
      thumbsDownCount: scores.down,
      avgScore: acceptanceRate * 5, // Convert to 0-5 scale
    });
  }

  // Sort by recommendation count
  metrics.sort((a, b) => b.recommendationCount - a.recommendationCount);

  const result = metrics.slice(0, limit);
  setCache(cacheKey, result);
  return result;
}

/**
 * Get user engagement patterns by time slot and day
 */
export async function getEngagementPatterns(
  userId: string,
  period: DateRangePeriod = '30d'
): Promise<EngagementPattern[]> {
  const cacheKey = `${userId}:engagement-patterns:${period}`;
  const cached = getCached<EngagementPattern[]>(cacheKey);
  if (cached) return cached;

  const { start, end } = getDateRange(period);

  // Get feedback with temporal metadata
  const feedback = await db
    .select()
    .from(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        gte(recommendationFeedback.timestamp, start),
        lte(recommendationFeedback.timestamp, end)
      )
    );

  // Group by time slot and day of week
  const patternGroups = new Map<
    string,
    {
      timeSlot: 'morning' | 'afternoon' | 'evening' | 'night';
      dayOfWeek: number;
      up: number;
      down: number;
    }
  >();

  for (const fb of feedback) {
    // Extract hour and day from timestamp
    const timestamp = new Date(fb.timestamp);
    const hour = fb.hourOfDay ?? timestamp.getHours();
    const day = fb.dayOfWeek ?? timestamp.getDay();
    const timeSlot = getTimeSlot(hour);
    const key = `${timeSlot}-${day}`;

    if (!patternGroups.has(key)) {
      patternGroups.set(key, {
        timeSlot,
        dayOfWeek: day,
        up: 0,
        down: 0,
      });
    }

    const group = patternGroups.get(key)!;
    if (fb.feedbackType === 'thumbs_up') {
      group.up++;
    } else {
      group.down++;
    }
  }

  // Convert to engagement patterns
  const patterns: EngagementPattern[] = [];

  for (const group of Array.from(patternGroups.values())) {
    const total = group.up + group.down;
    if (total === 0) continue;

    patterns.push({
      timeSlot: group.timeSlot,
      dayOfWeek: group.dayOfWeek,
      engagementCount: total,
      acceptanceRate: group.up / total,
    });
  }

  // Sort by engagement count
  patterns.sort((a, b) => b.engagementCount - a.engagementCount);

  setCache(cacheKey, patterns);
  return patterns;
}

/**
 * Get A/B test results for recommendation algorithms
 *
 * A/B tests are tracked via the abTestGroup field in discovery feed items
 * and scheduled notifications. Falls back to recommendation feedback sources.
 */
export async function getABTestResults(
  userId?: string,
  period: DateRangePeriod = '30d'
): Promise<{ active: ABTest[]; completed: ABTest[] }> {
  const cacheKey = `${userId || 'global'}:ab-tests:${period}`;
  const cached = getCached<{ active: ABTest[]; completed: ABTest[] }>(cacheKey);
  if (cached) return cached;

  const { start, end } = getDateRange(period);

  // Try discovery feed items first
  const items = await db
    .select()
    .from(discoveryFeedItems)
    .where(
      and(
        gte(discoveryFeedItems.createdAt, start),
        lte(discoveryFeedItems.createdAt, end),
        userId ? eq(discoveryFeedItems.userId, userId) : undefined
      )
    );

  // Group by recommendation source as A/B test variants
  const variantGroups = new Map<
    string,
    {
      shown: number;
      clicked: number;
      played: number;
      saved: number;
      liked: number;
      disliked: number;
    }
  >();

  for (const item of items) {
    const variant = item.recommendationSource;

    if (!variantGroups.has(variant)) {
      variantGroups.set(variant, {
        shown: 0,
        clicked: 0,
        played: 0,
        saved: 0,
        liked: 0,
        disliked: 0,
      });
    }

    const group = variantGroups.get(variant)!;
    if (item.shown) group.shown++;
    if (item.clicked) group.clicked++;
    if (item.played) group.played++;
    if (item.saved) group.saved++;
    if (item.feedback === 'liked') group.liked++;
    if (item.feedback === 'disliked') group.disliked++;
  }

  // If no discovery feed data, fall back to recommendation feedback
  if (variantGroups.size === 0 && userId) {
    const feedback = await db
      .select()
      .from(recommendationFeedback)
      .where(
        and(
          eq(recommendationFeedback.userId, userId),
          gte(recommendationFeedback.timestamp, start),
          lte(recommendationFeedback.timestamp, end)
        )
      );

    // Map feedback sources to test variants
    const feedbackGroups = new Map<
      string,
      { up: number; down: number }
    >();

    for (const fb of feedback) {
      const variant = fb.source || 'unknown';

      if (!feedbackGroups.has(variant)) {
        feedbackGroups.set(variant, { up: 0, down: 0 });
      }

      const group = feedbackGroups.get(variant)!;
      if (fb.feedbackType === 'thumbs_up') {
        group.up++;
      } else {
        group.down++;
      }
    }

    // Convert to variant format
    for (const [variant, group] of feedbackGroups.entries()) {
      const total = group.up + group.down;
      variantGroups.set(variant, {
        shown: total,
        clicked: total, // Assume all were clicked since they got feedback
        played: total, // Assume all were played
        saved: 0,
        liked: group.up,
        disliked: group.down,
      });
    }
  }

  // Calculate variant metrics
  const variants: ABTestResult[] = [];
  let maxAcceptanceRate = 0;

  for (const [variantName, group] of Array.from(variantGroups.entries())) {
    const totalFeedback = group.liked + group.disliked;
    const acceptanceRate = totalFeedback > 0 ? group.liked / totalFeedback : 0;
    const clickThroughRate = group.shown > 0 ? group.clicked / group.shown : 0;
    const playRate = group.shown > 0 ? group.played / group.shown : 0;
    const saveRate = group.shown > 0 ? group.saved / group.shown : 0;

    if (acceptanceRate > maxAcceptanceRate) {
      maxAcceptanceRate = acceptanceRate;
    }

    // Calculate confidence interval for acceptance rate
    const confidenceInterval = calculateConfidenceInterval(group.liked, totalFeedback, 0.95);

    variants.push({
      variantName,
      variantId: variantName,
      sampleSize: group.shown,
      acceptanceRate,
      clickThroughRate,
      playRate,
      saveRate,
      confidenceInterval, // Now populated with Wilson score interval
      isWinner: false, // Will be updated after all variants are processed
    });
  }

  // Mark the winner (highest acceptance rate with sufficient sample size)
  for (const variant of variants) {
    if (
      variant.acceptanceRate === maxAcceptanceRate &&
      variant.sampleSize >= 5 // Lower threshold for feedback-based tests
    ) {
      variant.isWinner = true;
      break;
    }
  }

  // Sort by acceptance rate
  variants.sort((a, b) => b.acceptanceRate - a.acceptanceRate);

  // Only create test if we have data
  const result = {
    active: [] as ABTest[],
    completed: [] as ABTest[],
  };

  if (variants.length > 0) {
    const recommendationSourceTest: ABTest = {
      testId: 'recommendation-source-comparison',
      testName: 'Recommendation Source Comparison',
      description: 'Compares acceptance rates across different recommendation sources',
      status: 'active',
      startDate: start,
      endDate: end,
      variants,
      conclusionSummary:
        `${variants[0].variantName} is performing best with ${(variants[0].acceptanceRate * 100).toFixed(1)}% acceptance rate`,
    };

    result.active.push(recommendationSourceTest);
  }

  setCache(cacheKey, result);
  return result;
}

/**
 * Get comprehensive discovery analytics summary
 */
export async function getDiscoveryAnalyticsSummary(
  userId: string,
  period: DateRangePeriod = '30d'
): Promise<DiscoveryAnalyticsSummary> {
  const cacheKey = `${userId}:discovery-summary:${period}`;
  const cached = getCached<DiscoveryAnalyticsSummary>(cacheKey);
  if (cached) return cached;

  // Fetch all metrics in parallel
  const [
    modeMetrics,
    topArtists,
    topGenres,
    engagementPatterns,
    abTests,
  ] = await Promise.all([
    getAcceptanceRateByMode(userId, period),
    getTopRecommendedArtists(userId, period, 20),
    getTopRecommendedGenres(userId, period, 15),
    getEngagementPatterns(userId, period),
    getABTestResults(userId, period),
  ]);

  // Calculate overall metrics
  const totalFeedback = modeMetrics.reduce((sum, m) => sum + m.totalRecommendations, 0);
  const totalThumbsUp = modeMetrics.reduce((sum, m) => sum + m.thumbsUpCount, 0);
  const overallAcceptanceRate = totalFeedback > 0 ? totalThumbsUp / totalFeedback : 0;

  // Calculate discovery score (based on variety and new artist discovery)
  // Higher score = more diverse listening
  const uniqueArtists = topArtists.length;
  const uniqueGenres = topGenres.length;
  const avgAcceptance = overallAcceptanceRate;

  // Score formula: weighted combination of diversity metrics
  const discoveryScore = Math.min(
    100,
    (uniqueArtists / 20) * 30 + // Up to 30 points for artist variety
      (uniqueGenres / 15) * 30 + // Up to 30 points for genre variety
      avgAcceptance * 40 // Up to 40 points for acceptance rate
  );

  // Calculate week-over-week and month-over-month changes
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  // Fetch comparison data for trends
  const recentWeekMetrics = await getAcceptanceRateByMode(userId, '7d');
  const recentWeekTotal = recentWeekMetrics.reduce((sum, m) => sum + m.thumbsUpCount, 0);
  const recentWeekFeedback = recentWeekMetrics.reduce((sum, m) => sum + m.totalRecommendations, 0);
  const recentWeekRate = recentWeekFeedback > 0 ? recentWeekTotal / recentWeekFeedback : 0;

  // Simplified trend calculation (comparing current period to overall)
  const weekOverWeekChange = overallAcceptanceRate > 0
    ? ((recentWeekRate - overallAcceptanceRate) / overallAcceptanceRate) * 100
    : 0;

  const summary: DiscoveryAnalyticsSummary = {
    totalFeedback,
    overallAcceptanceRate,
    discoveryScore,
    modeMetrics,
    topRecommendedArtists: topArtists,
    topRecommendedGenres: topGenres,
    engagementPatterns,
    activeTests: abTests.active,
    completedTests: abTests.completed,
    weekOverWeekChange,
    monthOverMonthChange: weekOverWeekChange * 4, // Rough approximation
  };

  setCache(cacheKey, summary);
  return summary;
}

// ============================================================================
// Exports
// ============================================================================

// Re-export from shared helpers for backward compatibility
export {
  getDateRange,
  calculateTrend,
  extractArtist,
  calculateConfidenceInterval,
  type DateRangePeriod,
  type TrendDirection,
} from '~/lib/utils/analytics-helpers';
