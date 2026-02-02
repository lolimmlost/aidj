/**
 * Album Age Distribution Chart
 *
 * Bar chart showing which decades the user's music comes from.
 * Inspired by Your Spotify's album age trending.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 1.4
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
} from 'recharts';
import { Disc3 } from 'lucide-react';

interface AlbumAgeChartProps {
  preset?: 'week' | 'month' | 'year';
  from?: string;
  to?: string;
}

const DECADE_COLORS: Record<string, string> = {
  '1960s': '#94a3b8',
  '1970s': '#f59e0b',
  '1980s': '#ec4899',
  '1990s': '#8b5cf6',
  '2000s': '#3b82f6',
  '2010s': '#10b981',
  '2020s': '#f97316',
};

function getDecadeColor(decade: string): string {
  return DECADE_COLORS[decade] || '#6b7280';
}

export const AlbumAgeChart = memo(function AlbumAgeChart({
  preset = 'month',
  from,
  to,
}: AlbumAgeChartProps) {
  const { data, isLoading, error } = useQuery<{
    success: boolean;
    distribution: Array<{ decade: string; plays: number }>;
    avgDecade: string | null;
    songsAnalyzed: number;
  }>({
    queryKey: ['album-ages', from || preset, to],
    queryFn: async () => {
      const params = from && to
        ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : `preset=${preset}`;
      const res = await fetch(`/api/listening-history/album-ages?${params}`);
      if (!res.ok) throw new Error('Failed to fetch album ages');
      return res.json();
    },
    staleTime: 30 * 60 * 1000, // 30 minutes (expensive query)
    retry: false,
  });

  const chartData = useMemo(() => {
    if (!data?.distribution) return [];
    return data.distribution.map(d => ({
      ...d,
      fill: getDecadeColor(d.decade),
    }));
  }, [data]);

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
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Disc3 className="h-5 w-5 text-primary" />
          Music Through The Decades
        </CardTitle>
        <CardDescription>
          {data?.songsAnalyzed} songs analyzed
          {data?.avgDecade && (
            <> &middot; Your sweet spot: <strong>{data.avgDecade}</strong></>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <XAxis
                dataKey="decade"
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
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-background/95 backdrop-blur-sm px-3 py-2 shadow-md text-sm">
                      <p className="font-medium">{d.decade}</p>
                      <p className="text-muted-foreground">{d.plays} plays</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="plays" radius={[4, 4, 0, 0]} fill="currentColor">
                {chartData.map((entry, index) => (
                  <rect key={index} fill={entry.fill} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});

export default AlbumAgeChart;
