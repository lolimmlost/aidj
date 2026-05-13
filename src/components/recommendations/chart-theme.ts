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
 *
 * IMPORTANT: AIDJ tokens are stored as full `oklch(...)` values (not raw
 * H/S/L components), so wrapping in `hsl(var(--popover))` produces invalid
 * CSS and the tooltip renders with default browser styling (black text on
 * transparent bg). Use `var(--popover)` etc. directly.
 */
export const chartTooltipContentStyle: CSSProperties = {
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
  fontSize: 12,
  padding: '8px 10px',
  boxShadow: 'var(--shadow-md)',
};

/**
 * Label style for tooltip body — slightly muted to match the popover.
 */
export const chartTooltipLabelStyle: CSSProperties = {
  color: 'var(--muted-foreground)',
  fontSize: 11,
  fontWeight: 500,
  marginBottom: 2,
};

/**
 * Cursor for bar charts. Sits *behind* the bars as a subtle muted fill.
 */
export const chartBarCursor = {
  fill: 'var(--muted)',
  opacity: 0.4,
} as const;

/**
 * Cursor for line/area charts. A thin vertical guide line.
 */
export const chartLineCursor = {
  stroke: 'var(--muted-foreground)',
  strokeWidth: 1,
  strokeDasharray: '3 3',
} as const;

/**
 * Sensible default axis tick style for the analytics suite.
 */
export const chartAxisTick = { fontSize: 11 } as const;

/**
 * Canonical AIDJ chart palette. Maps to the `--chart-1` … `--chart-5` CSS
 * variables defined in styles.css and themed in themes.css. Use these for
 * recharts `fill` / `stroke` props so a theme switch (Midnight Club, Vinyl
 * Lounge, etc.) repaints the charts automatically.
 *
 * Slot 1 (magenta in the default dark theme) is the "now playing / featured"
 * accent. Slot 2 is violet, 3 is cyan, 4 is emerald, 5 is amber.
 */
export const chartPalette = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

/** Soft slate fill for "unknown / pre-tagged" buckets that shouldn't compete
 *  for visual attention with real data. */
export const chartMutedColor = 'var(--muted-foreground)';

/**
 * Stable color for known play sources. Reaches into `--chart-N` for typed
 * sources so themes repaint them; null/unknown stays muted slate so the
 * pre-instrumentation backlog doesn't dominate.
 */
export const sourceColors: Record<string, string> = {
  ai_dj: 'var(--chart-2)',     // violet — AI accent
  manual: 'var(--chart-3)',    // cyan
  radio: 'var(--chart-5)',     // amber
  autoplay: 'var(--chart-4)',  // emerald
  unknown: chartMutedColor,
};

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
  'rounded-lg border border-border bg-popover text-popover-foreground shadow-lg';
