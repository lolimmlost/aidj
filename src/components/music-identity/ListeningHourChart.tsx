/**
 * Listening Hour Distribution Chart
 *
 * Bar chart showing when the user listens to music throughout the day.
 * Inspired by Your Spotify's listening hour distribution.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 1.2
 */

import { memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Clock } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface HourlyData {
  hour: number;
  plays: number;
}

interface ListeningHourChartProps {
  preset?: 'week' | 'month' | 'year';
}

// ============================================================================
// Constants
// ============================================================================

function formatHour(hour: number): string {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  if (hour < 12) return `${hour}a`;
  return `${hour - 12}p`;
}

function getTimeOfDayLabel(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Night';
}

const TIME_COLORS: Record<string, string> = {
  Morning: '#f59e0b',   // amber
  Afternoon: '#f97316',  // orange
  Evening: '#8b5cf6',   // purple
  Night: '#3b82f6',     // blue
};

// ============================================================================
// Component
// ============================================================================

export const ListeningHourChart = memo(function ListeningHourChart({
  preset = 'month',
}: ListeningHourChartProps) {
  const { data, isLoading, error } = useQuery<{ success: boolean; data: HourlyData[] }>({
    queryKey: ['listening-by-hour', preset],
    queryFn: async () => {
      const res = await fetch(`/api/listening-history/by-hour?preset=${preset}`);
      if (!res.ok) throw new Error('Failed to fetch hourly data');
      return res.json();
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: false,
  });

  const chartData = useMemo(() => {
    if (!data?.data) return [];
    return data.data.map(d => ({
      ...d,
      label: formatHour(d.hour),
      timeOfDay: getTimeOfDayLabel(d.hour),
      color: TIME_COLORS[getTimeOfDayLabel(d.hour)],
    }));
  }, [data]);

  const peakHour = useMemo(() => {
    if (!chartData.length) return null;
    return chartData.reduce((max, d) => d.plays > max.plays ? d : max, chartData[0]);
  }, [chartData]);

  const totalPlays = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.plays, 0);
  }, [chartData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !chartData.length) {
    return null; // Silently hide if no data
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          When You Listen
        </CardTitle>
        <CardDescription>
          {totalPlays.toLocaleString()} plays this {preset}
          {peakHour && (
            <> &middot; Peak at <strong>{formatHour(peakHour.hour)}</strong> ({peakHour.plays} plays)</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={2}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={35}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-background/95 backdrop-blur-sm px-3 py-2 shadow-md text-sm">
                      <p className="font-medium">{formatHour(d.hour)} - {d.timeOfDay}</p>
                      <p className="text-muted-foreground">{d.plays} plays</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="plays" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Time of day legend */}
        <div className="flex items-center justify-center gap-4 mt-3">
          {Object.entries(TIME_COLORS).map(([label, color]) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color, opacity: 0.8 }} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

export default ListeningHourChart;
