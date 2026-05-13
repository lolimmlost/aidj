/**
 * Shared chart-theming helpers for recharts.
 *
 * The Analytics page, AdvancedDiscoveryAnalytics, MoodTimeline, and the
 * music-identity dashboard all use recharts. Without these shared values
 * each chart drifts: some show heavy default tooltips, others have
 * `contentStyle={{ fontSize: '12px' }}` and nothing else, etc.
 *
 * Use these to keep tooltip popovers and cursors consistent everywhere.
 */

import type { CSSProperties } from 'react';

/**
 * Tooltip popover style — rounded, hairline border, themed background,
 * small body type. Pass to `<Tooltip contentStyle={chartTooltipContentStyle}>`.
 */
export const chartTooltipContentStyle: CSSProperties = {
  borderRadius: 8,
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
  padding: '8px 10px',
  boxShadow: '0 4px 12px -2px hsl(var(--foreground) / 0.08)',
};

/**
 * Label style for tooltip body — slightly muted to match the popover.
 */
export const chartTooltipLabelStyle: CSSProperties = {
  color: 'hsl(var(--muted-foreground))',
  fontSize: 11,
  fontWeight: 500,
  marginBottom: 2,
};

/**
 * Cursor for bar charts. Sits *behind* the bars as a subtle muted fill.
 */
export const chartBarCursor = {
  fill: 'hsl(var(--muted))',
  opacity: 0.4,
} as const;

/**
 * Cursor for line/area charts. A thin vertical guide line.
 */
export const chartLineCursor = {
  stroke: 'hsl(var(--muted-foreground))',
  strokeWidth: 1,
  strokeDasharray: '3 3',
} as const;

/**
 * Sensible default axis tick style for the analytics suite.
 */
export const chartAxisTick = { fontSize: 11 } as const;

/**
 * Tailwind class string for wrapping a custom recharts `Tooltip content` prop.
 * Keeps custom multi-line tooltip layouts visually aligned with the simple
 * single-line tooltips that use `chartTooltipContentStyle`.
 *
 * Usage:
 *   <Tooltip content={({active, payload, label}) =>
 *     active ? <div className={chartTooltipPopoverClass}>{...}</div> : null} />
 */
export const chartTooltipPopoverClass =
  'rounded-lg border border-border bg-popover text-popover-foreground shadow-[0_4px_12px_-2px_hsl(var(--foreground)/0.08)]';
