/**
 * Interest Over Time Chart
 *
 * Line chart showing how the user's interest in their top artists
 * rises and falls over months. Inspired by Koito's interest tracking.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 3.2
 */

import { memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InterestOverTimeChartProps {
  months?: number;
  from?: string;
  to?: string;
}

const ARTIST_COLORS = [
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
];

const trendIcons = {
  rising: TrendingUp,
  falling: TrendingDown,
  stable: Minus,
};

const trendLabels = {
  rising: 'Rising',
  falling: 'Falling',
  stable: 'Stable',
};

const trendColors = {
  rising: 'text-emerald-600 dark:text-emerald-400',
  falling: 'text-red-500 dark:text-red-400',
  stable: 'text-muted-foreground',
};

export const InterestOverTimeChart = memo(function InterestOverTimeChart({
  months = 6,
  from,
  to,
}: InterestOverTimeChartProps) {
  const { data, isLoading, error, refetch } = useQuery<{
    success: boolean;
    mode: 'multi';
    artists: Array<{
      artist: string;
      data: Array<{ month: string; plays: number }>;
      trend: 'rising' | 'falling' | 'stable';
    }>;
  }>({
    queryKey: ['interest-over-time', from || months, to],
    queryFn: async () => {
      const params = from && to
        ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : `months=${months}`;
      const res = await fetch(`/api/listening-history/interest-over-time?${params}`);
      if (!res.ok) throw new Error('Failed to fetch interest data');
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
    retry: false,
  });

  // Transform to recharts format: [{month, artist1, artist2, ...}, ...]
  const chartData = useMemo(() => {
    if (!data?.artists?.length) return [];

    const months = data.artists[0].data.map(d => d.month);
    return months.map((month, i) => {
      const point: Record<string, string | number> = {
        month: month.substring(5), // "2025-01" -> "01"
      };
      for (const artist of data.artists) {
        point[artist.artist] = artist.data[i]?.plays || 0;
      }
      return point;
    });
  }, [data]);

  const formatMonth = (month: string) => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const idx = parseInt(month) - 1;
    return monthNames[idx] || month;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Artist Interest Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">Failed to load interest data</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.artists?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Artist Interest Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No listening data for this period</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Artist Interest Over Time
        </CardTitle>
        <CardDescription>
          How your top artists trend{!from ? ` over the last ${months} months` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <XAxis
                dataKey="month"
                tickFormatter={formatMonth}
                tick={{ fontSize: 11 }}
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
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg border bg-background/95 backdrop-blur-sm px-3 py-2 shadow-md text-sm">
                      <p className="font-medium mb-1">{formatMonth(label as string)}</p>
                      {payload.map(p => (
                        <div key={p.name} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="text-muted-foreground">{p.name}:</span>
                          <span className="font-medium">{p.value} plays</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              {data.artists.map((artist, i) => (
                <Line
                  key={artist.artist}
                  type="monotone"
                  dataKey={artist.artist}
                  stroke={ARTIST_COLORS[i % ARTIST_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Trend badges */}
        <div className="flex flex-wrap gap-2 mt-3">
          {data.artists.map((artist, i) => {
            const TrendIcon = trendIcons[artist.trend];
            return (
              <Badge
                key={artist.artist}
                variant="outline"
                className="flex items-center gap-1.5 px-2.5 py-1"
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: ARTIST_COLORS[i % ARTIST_COLORS.length] }}
                />
                <span className="text-xs">{artist.artist}</span>
                <TrendIcon className={`h-3 w-3 ${trendColors[artist.trend]}`} />
                <span className={`text-xs ${trendColors[artist.trend]}`}>
                  {trendLabels[artist.trend]}
                </span>
              </Badge>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
});

export default InterestOverTimeChart;
