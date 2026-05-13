/**
 * Shared StatCard primitive for the analytics suite.
 *
 * AIDJ design-system .stat treatment:
 * - icon-prefixed eyebrow header (11px, 0.12em tracking, weight 600, uppercase)
 * - font-display value (Plus Jakarta Sans, extrabold, tracking-tight)
 * - optional inline trend chip (font-mono, colored by direction)
 * - optional progress bar under the value
 * - optional brand gradient + glow for hero/featured stats (use sparingly)
 */
import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MetricTrend = 'up' | 'down' | 'flat';

export function trendVisual(trend?: MetricTrend) {
  if (!trend) return null;
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const klass =
    trend === 'up' ? 'text-emerald-500'
    : trend === 'down' ? 'text-destructive'
    : 'text-muted-foreground';
  return { Icon, klass };
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  caption?: string;
  trend?: MetricTrend;
  /** Optional explicit delta string shown next to the trend icon, e.g. "+3.4%". */
  trendValue?: string;
  /** 0–100 progress bar shown under the value. */
  progress?: number;
  /** Render the value in the AIDJ brand gradient. Reserve for the
   *  hero/featured stat in a row — overuse dilutes it. */
  gradient?: boolean;
  /** Apply the brand glow shadow. Same rule: hero stat only. */
  glow?: boolean;
}

export const StatCard = memo(function StatCard({
  icon: Icon,
  label,
  value,
  caption,
  trend,
  trendValue,
  progress,
  gradient,
  glow,
}: StatCardProps) {
  const t = trendVisual(trend);
  return (
    <Card className={cn(glow && 'card-glow')}>
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
        <CardTitle className="flex items-center gap-1.5 sm:gap-2 eyebrow">
          <Icon className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
          {/* Don't truncate — at narrow mobile widths uppercase + 0.12em
              tracking pushes some labels past one line; let them wrap to
              two rather than cut to "FEED…". */}
          <span className="leading-snug">{label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
        <div
          className={cn(
            'font-display font-extrabold tabular-nums capitalize tracking-tight leading-none',
            'text-2xl sm:text-3xl',
            gradient && 'bg-[image:var(--gradient-brand)] bg-clip-text text-transparent',
          )}
        >
          {value}
        </div>
        {t && (
          <div className={cn('mt-1.5 flex items-center gap-1 font-mono text-[11px]', t.klass)}>
            <t.Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>{trendValue ?? (trend === 'up' ? 'Improving' : trend === 'down' ? 'Declining' : 'Stable')}</span>
          </div>
        )}
        {progress != null && (
          <Progress value={progress} className="mt-2 h-1.5 sm:h-2" />
        )}
        {caption && (
          <p className="mt-1.5 text-[11px] sm:text-xs text-muted-foreground">{caption}</p>
        )}
      </CardContent>
    </Card>
  );
});
