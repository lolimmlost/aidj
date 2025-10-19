/**
 * Temporal utilities for seasonal pattern detection
 * Story 3.11: Seasonal Preference Tracking
 */

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

/**
 * Extract temporal metadata from a date
 * @param date - The date to extract metadata from
 * @returns Temporal metadata object
 */
export function extractTemporalMetadata(date: Date) {
  const month = date.getMonth() + 1; // 1-12
  const season = getSeason(month);
  const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // Convert Sunday (0) to 7, keep Mon(1)-Sat(6)
  const hourOfDay = date.getHours(); // 0-23

  return {
    month,
    season,
    dayOfWeek,
    hourOfDay,
  };
}

/**
 * Determine the season from a month number
 * @param month - Month number (1-12)
 * @returns Season name
 */
export function getSeason(month: number): Season {
  // Spring: March-May (3-5)
  if (month >= 3 && month <= 5) return 'spring';

  // Summer: June-August (6-8)
  if (month >= 6 && month <= 8) return 'summer';

  // Fall: September-November (9-11)
  if (month >= 9 && month <= 11) return 'fall';

  // Winter: December-February (12, 1-2)
  return 'winter';
}

/**
 * Get the current season
 * @returns Current season
 */
export function getCurrentSeason(): Season {
  const now = new Date();
  return getSeason(now.getMonth() + 1);
}

/**
 * Get seasonal keywords for recommendation prompts
 * @param month - Month number (1-12)
 * @returns Array of seasonal keywords
 */
export function getSeasonalKeywords(month: number): string[] {
  switch (month) {
    case 10: // October
      return ['Halloween', 'spooky', 'horror themes', 'dark', 'atmospheric'];
    case 12: // December
      return ['holiday', 'festive', 'winter themes', 'Christmas', 'celebration'];
    case 7: // July
      return ['summer', 'upbeat', 'beach vibes', 'sunny', 'energetic'];
    case 1: // January
      return ['new year', 'fresh start', 'winter', 'reflective'];
    default:
      return [];
  }
}

/**
 * Get season display name
 * @param season - Season identifier
 * @returns Display name with emoji
 */
export function getSeasonDisplay(season: Season): string {
  const displays: Record<Season, string> = {
    spring: '🌸 Spring',
    summer: '☀️ Summer',
    fall: '🍂 Fall',
    winter: '❄️ Winter',
  };
  return displays[season];
}

/**
 * Get month name
 * @param month - Month number (1-12)
 * @returns Month name
 */
export function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || 'Unknown';
}
