/**
 * Seasonal Pattern Detection Service
 * Story 3.11: Task 2 - Detect and analyze seasonal preferences
 */

import { db } from '../db';
import { recommendationFeedback } from '../db/schema';
import { eq, and, gte, sql, count } from 'drizzle-orm';
import { Season, getSeason } from '../utils/temporal';

/**
 * Seasonal preference pattern
 */
export interface SeasonalPattern {
  season: Season;
  month?: number;
  preferredGenres: string[];
  preferredArtists: string[];
  thumbsUpCount: number;
  thumbsDownCount: number;
  totalFeedback: number;
  confidence: number; // 0-1 score
  averageRating: number; // ratio of thumbs up to total
}

/**
 * Detected seasonal preferences for a user
 */
export interface UserSeasonalPreferences {
  userId: string;
  patterns: SeasonalPattern[];
  lastUpdated: Date;
}

/**
 * Minimum feedback entries required per season for pattern detection
 */
const MIN_FEEDBACK_THRESHOLD = 10;

/**
 * Minimum confidence score to consider a pattern valid
 */
const MIN_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Detect seasonal preferences for a user
 * @param userId - User ID to analyze
 * @returns Detected seasonal patterns
 */
export async function detectSeasonalPreferences(userId: string): Promise<UserSeasonalPreferences> {
  const patterns: SeasonalPattern[] = [];

  // Analyze by season
  const seasons: Season[] = ['spring', 'summer', 'fall', 'winter'];

  for (const season of seasons) {
    const pattern = await analyzeSeasonalFeedback(userId, season);
    if (pattern && pattern.confidence >= MIN_CONFIDENCE_THRESHOLD) {
      patterns.push(pattern);
    }
  }

  return {
    userId,
    patterns,
    lastUpdated: new Date(),
  };
}

/**
 * Analyze feedback for a specific season
 * @param userId - User ID
 * @param season - Season to analyze
 * @returns Seasonal pattern or null if insufficient data
 */
async function analyzeSeasonalFeedback(
  userId: string,
  season: Season
): Promise<SeasonalPattern | null> {
  // Fetch all feedback for this season
  const seasonalFeedback = await db
    .select()
    .from(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        eq(recommendationFeedback.season, season)
      )
    );

  // Insufficient data check
  if (seasonalFeedback.length < MIN_FEEDBACK_THRESHOLD) {
    return null;
  }

  // Calculate metrics
  const thumbsUpCount = seasonalFeedback.filter(f => f.feedbackType === 'thumbs_up').length;
  const thumbsDownCount = seasonalFeedback.filter(f => f.feedbackType === 'thumbs_down').length;
  const totalFeedback = seasonalFeedback.length;
  const averageRating = totalFeedback > 0 ? thumbsUpCount / totalFeedback : 0;

  // Extract artists from thumbs up feedback
  const thumbsUpSongs = seasonalFeedback
    .filter(f => f.feedbackType === 'thumbs_up')
    .map(f => f.songArtistTitle);

  const artistCounts = new Map<string, number>();
  for (const song of thumbsUpSongs) {
    // Extract artist (format: "Artist - Title")
    const artist = song.split(' - ')[0]?.trim();
    if (artist) {
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    }
  }

  // Get top artists (sorted by count, take top 10)
  const preferredArtists = Array.from(artistCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([artist]) => artist);

  // Calculate confidence score
  const confidence = calculateConfidence(seasonalFeedback, totalFeedback, averageRating);

  return {
    season,
    preferredGenres: [], // Genre detection would require external metadata
    preferredArtists,
    thumbsUpCount,
    thumbsDownCount,
    totalFeedback,
    confidence,
    averageRating,
  };
}

/**
 * Calculate confidence score for a seasonal pattern
 * Uses statistical significance testing
 * @param seasonalFeedback - Feedback for the season
 * @param totalFeedback - Total feedback count
 * @param averageRating - Average rating (thumbs up ratio)
 * @returns Confidence score (0-1)
 */
function calculateConfidence(
  seasonalFeedback: any[],
  totalFeedback: number,
  averageRating: number
): number {
  // Base confidence on sample size
  const sampleSizeScore = Math.min(totalFeedback / 50, 1.0); // Max confidence at 50+ samples

  // Preference clarity (how decisive are the ratings?)
  const clarityScore = Math.abs(averageRating - 0.5) * 2; // 0.5 is neutral, extremes are clearer

  // Combined confidence
  const confidence = (sampleSizeScore * 0.6) + (clarityScore * 0.4);

  return Math.min(Math.max(confidence, 0), 1);
}

/**
 * Analyze feedback for a specific month
 * @param userId - User ID
 * @param month - Month to analyze (1-12)
 * @returns Seasonal pattern or null if insufficient data
 */
export async function analyzeMonthlyFeedback(
  userId: string,
  month: number
): Promise<SeasonalPattern | null> {
  // Fetch all feedback for this month
  const monthlyFeedback = await db
    .select()
    .from(recommendationFeedback)
    .where(
      and(
        eq(recommendationFeedback.userId, userId),
        eq(recommendationFeedback.month, month)
      )
    );

  // Insufficient data check
  if (monthlyFeedback.length < MIN_FEEDBACK_THRESHOLD) {
    return null;
  }

  // Calculate metrics (same as seasonal analysis)
  const thumbsUpCount = monthlyFeedback.filter(f => f.feedbackType === 'thumbs_up').length;
  const thumbsDownCount = monthlyFeedback.filter(f => f.feedbackType === 'thumbs_down').length;
  const totalFeedback = monthlyFeedback.length;
  const averageRating = totalFeedback > 0 ? thumbsUpCount / totalFeedback : 0;

  // Extract artists
  const thumbsUpSongs = monthlyFeedback
    .filter(f => f.feedbackType === 'thumbs_up')
    .map(f => f.songArtistTitle);

  const artistCounts = new Map<string, number>();
  for (const song of thumbsUpSongs) {
    const artist = song.split(' - ')[0]?.trim();
    if (artist) {
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    }
  }

  const preferredArtists = Array.from(artistCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([artist]) => artist);

  const confidence = calculateConfidence(monthlyFeedback, totalFeedback, averageRating);

  return {
    season: getSeason(month),
    month,
    preferredGenres: [],
    preferredArtists,
    thumbsUpCount,
    thumbsDownCount,
    totalFeedback,
    confidence,
    averageRating,
  };
}

/**
 * Get seasonal preferences for current season
 * @param userId - User ID
 * @returns Current season's pattern or null
 */
export async function getCurrentSeasonalPattern(userId: string): Promise<SeasonalPattern | null> {
  const currentMonth = new Date().getMonth() + 1;
  const currentSeason = getSeason(currentMonth);

  return analyzeSeasonalFeedback(userId, currentSeason);
}

/**
 * Check if user has significant seasonal patterns
 * @param userId - User ID
 * @returns True if user has detectable seasonal preferences
 */
export async function hasSeasonalPatterns(userId: string): Promise<boolean> {
  const preferences = await detectSeasonalPreferences(userId);
  return preferences.patterns.length > 0;
}
