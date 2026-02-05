/**
 * Period Comparison Utilities
 *
 * Calculates previous equivalent time periods and percentage changes
 * for period-over-period comparison cards on the dashboard.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 1.1
 */

/**
 * Given a date range, calculate the equivalent previous period.
 * e.g., if current = Jan 15 - Jan 22 (7 days), previous = Jan 8 - Jan 15
 */
export function getLastPeriod(start: Date, end: Date): { start: Date; end: Date } {
  const durationMs = end.getTime() - start.getTime();
  return {
    start: new Date(start.getTime() - durationMs),
    end: new Date(start.getTime()),
  };
}

/**
 * Calculate percentage change between two values.
 * Returns null if previous is 0 (can't compute meaningful percentage).
 */
export function getPercentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current > 0 ? 100 : null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Get preset date ranges for common periods.
 */
export function getPresetRange(preset: 'day' | 'week' | 'month' | 'year'): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (preset) {
    case 'day':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start.setDate(start.getDate() - 30);
      break;
    case 'year':
      start.setFullYear(start.getFullYear() - 1);
      break;
  }

  return { start, end };
}

/**
 * Format a percentage change for display.
 * Returns "+23%" or "-12%" with appropriate sign.
 */
export function formatPercentChange(percent: number | null): string {
  if (percent === null) return '';
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent}%`;
}
