/**
 * Centralized Analytics Helper Functions
 *
 * Consolidates duplicate functions from:
 * - recommendation-analytics.ts
 * - mood-timeline-analytics.ts
 * - advanced-discovery-analytics.ts
 * - discovery-analytics.ts
 *
 * This module provides shared utilities for:
 * - Artist/title extraction from "Artist - Title" format
 * - Date range calculations
 * - Trend analysis
 * - Diversity scoring (Shannon entropy)
 * - Time slot classification
 * - A/B test confidence intervals
 */

// ============================================================================
// Artist/Title Extraction
// ============================================================================

/**
 * Extract artist name from "Artist - Title" format
 * @param songArtistTitle - Combined string in "Artist - Title" format
 * @returns Artist name, or original string if no separator found
 */
export function extractArtist(songArtistTitle: string): string {
  const parts = songArtistTitle.split(' - ');
  return parts[0]?.trim() || songArtistTitle;
}

/**
 * Extract song title from "Artist - Title" format
 * @param songArtistTitle - Combined string in "Artist - Title" format
 * @returns Song title, or empty string if no separator found
 */
export function extractTitle(songArtistTitle: string): string {
  const parts = songArtistTitle.split(' - ');
  return parts[1]?.trim() || '';
}

// ============================================================================
// Date Range Helpers
// ============================================================================

export type DateRangePeriod = '7d' | '30d' | '90d' | '1y' | 'all';

/**
 * Get date range from period string
 * @param period - Period identifier ('7d', '30d', '90d', '1y', 'all')
 * @returns Object with start and end dates
 */
export function getDateRange(period: DateRangePeriod): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'all':
      start.setFullYear(2020); // Reasonable fallback start date
      break;
  }

  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/**
 * Get date N days ago with time reset to midnight
 * @param days - Number of days to go back
 * @returns Date object set to midnight N days ago
 */
export function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Get start of week (Sunday) for a given date
 * @param date - Input date
 * @returns Date object set to the start of that week (Sunday at midnight)
 */
export function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day; // Adjust to Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get start of month for a given date
 * @param date - Input date
 * @returns Date object set to the first day of that month at midnight
 */
export function getStartOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ============================================================================
// Trend Calculation
// ============================================================================

export type TrendDirection = 'improving' | 'declining' | 'stable';

/**
 * Calculate trend direction from rate comparison
 * @param recentRate - Recent period acceptance rate (0-1)
 * @param olderRate - Older period acceptance rate (0-1)
 * @param threshold - Change threshold to consider significant (default 5%)
 * @returns Trend direction
 */
export function calculateTrend(
  recentRate: number,
  olderRate: number,
  threshold: number = 0.05
): TrendDirection {
  const diff = recentRate - olderRate;
  if (diff > threshold) return 'improving';
  if (diff < -threshold) return 'declining';
  return 'stable';
}

// ============================================================================
// Diversity Score (Shannon Entropy)
// ============================================================================

/**
 * Calculate Shannon entropy-based diversity score
 *
 * Uses the Shannon entropy formula: H = -Sum(p_i * log2(p_i))
 * Normalized to 0-1 range where higher values indicate more diversity.
 *
 * @param itemCounts - Map of item names to their counts
 * @returns Normalized diversity score between 0 and 1
 */
export function calculateDiversityScore(itemCounts: Map<string, number>): number {
  if (itemCounts.size === 0) return 0;

  const total = Array.from(itemCounts.values()).reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;

  // Shannon entropy: H = -Sum(p_i * log2(p_i))
  let entropy = 0;
  for (const count of itemCounts.values()) {
    const probability = count / total;
    if (probability > 0) {
      entropy -= probability * Math.log2(probability);
    }
  }

  // Normalize to 0-1 range (max entropy for N items is log2(N))
  const maxEntropy = Math.log2(itemCounts.size);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

// ============================================================================
// Time Slot Helpers
// ============================================================================

export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'night';

export interface TimeSlotConfig {
  morning: { start: number; end: number };
  afternoon: { start: number; end: number };
  evening: { start: number; end: number };
  night: { start: number; end: number };
}

/**
 * Default time slot configuration
 * Now configurable instead of hardcoded!
 */
export const DEFAULT_TIME_SLOTS: TimeSlotConfig = {
  morning: { start: 5, end: 12 },
  afternoon: { start: 12, end: 17 },
  evening: { start: 17, end: 21 },
  night: { start: 21, end: 5 }, // Wraps around midnight
};

/**
 * Get time slot from hour of day
 * @param hour - Hour of day (0-23)
 * @param config - Optional custom time slot configuration
 * @returns Time slot classification
 */
export function getTimeSlot(
  hour: number,
  config: TimeSlotConfig = DEFAULT_TIME_SLOTS
): TimeSlot {
  if (hour >= config.morning.start && hour < config.morning.end) return 'morning';
  if (hour >= config.afternoon.start && hour < config.afternoon.end) return 'afternoon';
  if (hour >= config.evening.start && hour < config.evening.end) return 'evening';
  return 'night';
}

// ============================================================================
// A/B Test Confidence Intervals
// ============================================================================

export interface ConfidenceInterval {
  lower: number;
  upper: number;
}

/**
 * Calculate Wilson score confidence interval for binomial proportion
 *
 * The Wilson score interval is more accurate than the normal approximation,
 * especially for small sample sizes or extreme proportions.
 *
 * @param successes - Number of successes (e.g., thumbs up count)
 * @param total - Total sample size
 * @param confidence - Confidence level (default 0.95 for 95% CI)
 * @returns Object with lower and upper bounds of the confidence interval
 */
export function calculateConfidenceInterval(
  successes: number,
  total: number,
  confidence: number = 0.95
): ConfidenceInterval {
  if (total === 0) return { lower: 0, upper: 0 };

  // Z-score for confidence level
  // 1.96 for 95%, 2.576 for 99%, 1.645 for 90%
  let z: number;
  if (confidence >= 0.99) {
    z = 2.576;
  } else if (confidence >= 0.95) {
    z = 1.96;
  } else if (confidence >= 0.90) {
    z = 1.645;
  } else {
    // Approximate z-score for other confidence levels
    z = 1.96; // Default to 95%
  }

  const p = successes / total;
  const n = total;

  // Wilson score interval formula
  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));

  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

// ============================================================================
// Period Label Formatting
// ============================================================================

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type TimeGranularity = 'day' | 'week' | 'month' | 'year';

/**
 * Get human-readable period label for a date
 * @param date - Date to format
 * @param granularity - Time granularity for the label
 * @returns Human-readable period label
 */
export function getPeriodLabel(date: Date, granularity: TimeGranularity): string {
  switch (granularity) {
    case 'day':
      return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    case 'week':
      return `Week of ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    case 'month':
      return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
    case 'year':
      return `${date.getFullYear()}`;
  }
}

/**
 * Get period bounds (start and end dates) for a given date and granularity
 * @param date - Reference date
 * @param granularity - Time granularity
 * @returns Object with start and end dates for the period
 */
export function getPeriodBounds(
  date: Date,
  granularity: TimeGranularity
): { start: Date; end: Date } {
  const start = new Date(date);
  const end = new Date(date);

  switch (granularity) {
    case 'day':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'week':
      const dayOfWeek = start.getDay();
      start.setDate(start.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return { start, end };
}

// ============================================================================
// Day Names Helper
// ============================================================================

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Get day name from day of week number
 * @param dayOfWeek - Day of week (0 = Sunday, 6 = Saturday)
 * @returns Day name string
 */
export function getDayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] || 'Unknown';
}
