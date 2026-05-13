/**
 * Advanced Analytics Dashboard Component
 * Displays comprehensive music taste analytics with interactive charts
 */

import { useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Skeleton } from '../ui/skeleton';
import { LayoutDashboard, Target, Activity, Compass, Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface EnhancedAnalyticsResponse {
  profile: {
    likedArtists: Array<{ artist: string; count: number }>;
    dislikedArtists: Array<{ artist: string; count: number }>;
    feedbackCount: {
      /** Real interactions (excludes bulk library-sync rows). */
      total: number;
      thumbsUp: number;
      thumbsDown: number;
      /** Bulk library-sync rows. May be missing on older responses. */
      librarySynced?: number;
    };
  };
  tasteEvolution?: {
    dataPoints: Array<{
      period: string;
      dominantArtists: string[];
      thumbsUpCount: number;
      thumbsDownCount: number;
    }>;
    periodType: 'week' | 'month';
  };
  quality?: {
    acceptanceRate: number;
    totalRecommendations: number;
    thumbsUpCount: number;
    thumbsDownCount: number;
    qualityTrend: 'improving' | 'declining' | 'stable';
  };
  activity?: {
    feedbackByDayOfWeek: Record<number, number>;
    feedbackByHourOfDay: Record<number, number>;
    peakDayOfWeek: number | null;
    peakHourOfDay: number | null;
    totalFeedbackCount: number;
    listeningPatternInsights: string[];
  };
  discovery?: {
    newArtistsDiscovered: number;
    genreDiversityScore: number;
    diversityTrend: 'expanding' | 'narrowing' | 'stable';
    newArtistNames: string[];
  };
}

// ============================================================================
// Fetch Analytics
// ============================================================================

async function fetchAnalytics(period: string): Promise<EnhancedAnalyticsResponse> {
  const response = await fetch(`/api/recommendations/analytics?period=${period}&metrics=all`);
  if (!response.ok) {
    throw new Error('Failed to fetch analytics');
  }
  return response.json();
}

// ============================================================================
// Chart Colors
// ============================================================================

const COLORS = {
  primary: '#8b5cf6',
  secondary: '#ec4899',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
};

const PIE_COLORS = ['#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#06b6d4', '#84cc16'];

// ============================================================================
// Components
// ============================================================================

interface AnalyticsDashboardProps {
  period?: '30d' | '90d' | '1y';
}

export function AnalyticsDashboard({ period = '30d' }: AnalyticsDashboardProps) {
  const { data: analytics, isLoading, error } = useQuery({
    queryKey: ['analytics', period],
    queryFn: () => fetchAnalytics(period),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return <AnalyticsLoadingSkeleton />;
  }

  if (error || !analytics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analytics Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Failed to load analytics. Please try again later.</p>
        </CardContent>
      </Card>
    );
  }

  // Check if user has enough data
  if (analytics.profile.feedbackCount.total < 5) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not Enough Data Yet</CardTitle>
          <CardDescription>
            You need at least 5 feedback entries to view analytics. Keep rating songs!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Current feedback: {analytics.profile.feedbackCount.total} / 5
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="listening" className="flex items-center gap-1.5 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <Headphones className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            Listening
          </TabsTrigger>
          <TabsTrigger value="quality" className="flex items-center gap-1.5 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            Quality
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1.5 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="discovery" className="flex items-center gap-1.5 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <Compass className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            Discovery
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <OverviewTab analytics={analytics} />
        </TabsContent>

        <TabsContent value="listening" className="space-y-4">
          <ListeningTab period={period} />
        </TabsContent>

        <TabsContent value="quality" className="space-y-4">
          <QualityTab analytics={analytics} />
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <ActivityTab analytics={analytics} />
        </TabsContent>

        <TabsContent value="discovery" className="space-y-4">
          <DiscoveryTab analytics={analytics} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Overview Tab
// ============================================================================

function OverviewTab({ analytics }: { analytics: EnhancedAnalyticsResponse }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Stats Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Total Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.profile.feedbackCount.total}</div>
          <p className="text-xs text-muted-foreground">
            {analytics.profile.feedbackCount.thumbsUp} up / {analytics.profile.feedbackCount.thumbsDown} down
          </p>
          {analytics.profile.feedbackCount.librarySynced !== undefined &&
           analytics.profile.feedbackCount.librarySynced > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              + {analytics.profile.feedbackCount.librarySynced} library-synced (excluded from charts)
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Acceptance Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {analytics.quality ? `${(analytics.quality.acceptanceRate * 100).toFixed(0)}%` : 'N/A'}
          </div>
          <p className="text-xs text-muted-foreground">
            {analytics.quality?.qualityTrend === 'improving' && '📈 Improving'}
            {analytics.quality?.qualityTrend === 'declining' && '📉 Declining'}
            {analytics.quality?.qualityTrend === 'stable' && '➡️ Stable'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">New Artists</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.discovery?.newArtistsDiscovered || 0}</div>
          <p className="text-xs text-muted-foreground">
            Taste: {analytics.discovery?.diversityTrend || 'stable'}
          </p>
        </CardContent>
      </Card>

      {/* Top Artists */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Top Liked Artists</CardTitle>
          <CardDescription>Artists you've thumbed up most on AI DJ recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          <TopArtistsChart artists={analytics.profile.likedArtists.slice(0, 10)} />
        </CardContent>
      </Card>

      {/* Taste Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Taste Profile</CardTitle>
          <CardDescription>Your musical fingerprint</CardDescription>
        </CardHeader>
        <CardContent>
          <TasteProfileCard analytics={analytics} />
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Quality Tab
// ============================================================================

const QualityTab = memo(function QualityTab({ analytics }: { analytics: EnhancedAnalyticsResponse }) {
  // Memoize chart data transformation for performance
  const chartData = useMemo(() => {
    if (!analytics.tasteEvolution) return [];

    return analytics.tasteEvolution.dataPoints.map(dp => {
      const date = new Date(dp.period);
      const label = analytics.tasteEvolution!.periodType === 'week'
        ? `${date.getMonth() + 1}/${date.getDate()}`
        : `${date.getMonth() + 1}/${date.getFullYear()}`;

      return {
        period: label,
        liked: dp.thumbsUpCount,
        disliked: dp.thumbsDownCount,
        total: dp.thumbsUpCount + dp.thumbsDownCount,
      };
    });
  }, [analytics.tasteEvolution]);

  if (!analytics.quality || !analytics.tasteEvolution) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Quality metrics not available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Recommendation Quality Over Time</CardTitle>
          <CardDescription>
            Acceptance trend: {analytics.quality.qualityTrend}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="liked" fill={COLORS.success} name="Liked" />
              <Bar dataKey="disliked" fill={COLORS.danger} name="Disliked" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Acceptance Rate"
          value={`${(analytics.quality.acceptanceRate * 100).toFixed(1)}%`}
          description={`${analytics.quality.thumbsUpCount} liked out of ${analytics.quality.totalRecommendations}`}
        />
        <MetricCard
          title="Quality Trend"
          value={analytics.quality.qualityTrend}
          description={
            analytics.quality.qualityTrend === 'improving'
              ? 'Recommendations getting better'
              : analytics.quality.qualityTrend === 'declining'
                ? 'Recommendations getting worse'
                : 'Recommendations are consistent'
          }
        />
        <MetricCard
          title="Total Ratings"
          value={analytics.quality.totalRecommendations.toString()}
          description="Feedback events (a song may be rated more than once)"
        />
      </div>
    </div>
  );
});

// ============================================================================
// Activity Tab
// ============================================================================

const ActivityTab = memo(function ActivityTab({ analytics }: { analytics: EnhancedAnalyticsResponse }) {
  // Memoize day and hour data transformations
  const { dayData, hourData } = useMemo(() => {
    if (!analytics.activity) {
      return { dayData: [], hourData: [] };
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayData = dayNames.map((name, index) => ({
      day: name,
      count: analytics.activity!.feedbackByDayOfWeek[index] || 0,
    }));

    const hourData = Object.entries(analytics.activity.feedbackByHourOfDay).map(([hour, count]) => ({
      hour: `${hour}:00`,
      count,
    }));

    return { dayData, hourData };
  }, [analytics.activity]);

  if (!analytics.activity) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Activity data not available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Feedback Patterns</CardTitle>
          <CardDescription>When you most often rate AI DJ recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {analytics.activity.listeningPatternInsights.map((insight, i) => (
              <p key={i} className="text-sm">
                • {insight}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Feedback Events by Day of Week</CardTitle>
            <CardDescription>Summed across every day in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dayData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill={COLORS.primary} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feedback Events by Hour</CardTitle>
            <CardDescription>Summed across every hour in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={hourData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke={COLORS.secondary} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});

// ============================================================================
// Listening Tab (PR 2 of Listening Analytics — sources from listening_history,
// not recommendation_feedback. Surfaces actual play counts and repeat patterns)
// ============================================================================

interface TopArtistRow {
  artist: string;
  plays: number;
  uniqueSongs: number;
  lastPlayedAt: string;
}

interface TopSongRow {
  songId: string;
  artist: string;
  title: string;
  plays: number;
  lastPlayedAt: string;
}

interface SourceCountRow {
  source: string;
  plays: number;
}

// Stable color per source. `unknown` is muted (gray) so the pre-instrumentation
// backlog doesn't visually dominate while early data is sparse.
const SOURCE_COLORS: Record<string, string> = {
  ai_dj: '#8b5cf6',    // violet
  manual: '#3b82f6',   // blue
  radio: '#f59e0b',    // amber
  autoplay: '#10b981', // emerald
  unknown: '#94a3b8',  // slate
};

const SOURCE_LABELS: Record<string, string> = {
  ai_dj: 'AI DJ',
  manual: 'Manual',
  radio: 'Radio',
  autoplay: 'Autoplay',
  unknown: 'Pre-tagged',
};

function periodToDateRange(period: '30d' | '90d' | '1y'): { from: string; to: string } {
  const days = period === '90d' ? 90 : period === '1y' ? 365 : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

const ListeningTab = memo(function ListeningTab({ period }: { period: '30d' | '90d' | '1y' }) {
  const range = useMemo(() => periodToDateRange(period), [period]);

  const topArtists = useQuery({
    queryKey: ['listening-history', 'top-artists', period],
    queryFn: async () => {
      const params = new URLSearchParams({ from: range.from, to: range.to, limit: '10' });
      const res = await fetch(`/api/listening-history/top-artists?${params}`);
      if (!res.ok) throw new Error('Failed to fetch top artists');
      const json = await res.json() as { success: boolean; data: TopArtistRow[] };
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const topSongs = useQuery({
    queryKey: ['listening-history', 'top-songs', period],
    queryFn: async () => {
      const params = new URLSearchParams({ from: range.from, to: range.to, limit: '15' });
      const res = await fetch(`/api/listening-history/top-songs?${params}`);
      if (!res.ok) throw new Error('Failed to fetch top songs');
      const json = await res.json() as { success: boolean; data: TopSongRow[] };
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const bySource = useQuery({
    queryKey: ['listening-history', 'by-source', period],
    queryFn: async () => {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      const res = await fetch(`/api/listening-history/by-source?${params}`);
      if (!res.ok) throw new Error('Failed to fetch source breakdown');
      const json = await res.json() as { success: boolean; data: SourceCountRow[] };
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-4">
      <SourceBreakdownCard query={bySource} />
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Top Played Artists</CardTitle>
          <CardDescription>
            By total plays in this period. The plays-per-unique-song ratio surfaces
            artists where the same few tracks repeat (high) vs deep catalog rotation (low).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topArtists.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : topArtists.error ? (
            <p className="text-sm text-destructive">Failed to load.</p>
          ) : !topArtists.data || topArtists.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No listening history in this period.</p>
          ) : (
            <ul className="space-y-2">
              {topArtists.data.map((row) => {
                const ratio = row.uniqueSongs > 0 ? row.plays / row.uniqueSongs : 0;
                const ratioBadgeClass =
                  ratio >= 4 ? 'text-destructive'
                  : ratio >= 2.5 ? 'text-warning'
                  : 'text-muted-foreground';
                return (
                  <li key={row.artist} className="flex items-baseline gap-3 text-sm">
                    <span className="flex-1 truncate font-medium">{row.artist}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {row.plays} plays
                    </span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {row.uniqueSongs} unique
                    </span>
                    <span className={cn('tabular-nums text-xs font-medium', ratioBadgeClass)}
                          title="Plays per unique song">
                      {ratio.toFixed(1)}×
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Played Songs</CardTitle>
          <CardDescription>
            Most-repeated individual tracks. High counts here are the songs the
            AI DJ or your manual choices keep returning to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topSongs.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : topSongs.error ? (
            <p className="text-sm text-destructive">Failed to load.</p>
          ) : !topSongs.data || topSongs.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No listening history in this period.</p>
          ) : (
            <ol className="space-y-2">
              {topSongs.data.map((row) => (
                <li key={row.songId} className="flex items-baseline gap-3 text-sm">
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium">{row.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.artist}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">{row.plays} plays</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
    </div>
  );
});

const SourceBreakdownCard = memo(function SourceBreakdownCard({
  query,
}: {
  query: { isLoading: boolean; error: unknown; data: SourceCountRow[] | undefined };
}) {
  const { rows, chartData, total } = useMemo(() => {
    const data = query.data ?? [];
    const sum = data.reduce((acc, r) => acc + r.plays, 0);
    const shaped = data.map((r) => ({
      name: SOURCE_LABELS[r.source] ?? r.source,
      value: r.plays,
      source: r.source,
    }));
    return { rows: data, chartData: shaped, total: sum };
  }, [query.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plays by Source</CardTitle>
        <CardDescription>
          Where your plays came from. AI DJ, manual picks, radio, and autoplay are
          tagged from instrumentation rollout onward; older plays show as "Pre-tagged".
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : query.error ? (
          <p className="text-sm text-destructive">Failed to load.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No listening history in this period.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[1fr_1fr] items-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                >
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.source}
                      fill={SOURCE_COLORS[entry.source] ?? '#94a3b8'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name) => {
                    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                    return [`${value} plays (${pct}%)`, name];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <ul className="space-y-2 text-sm">
              {rows.map((row) => {
                const pct = total > 0 ? (row.plays / total) * 100 : 0;
                return (
                  <li key={row.source} className="flex items-baseline gap-3">
                    <span
                      aria-hidden
                      className="inline-block size-3 rounded-sm shrink-0"
                      style={{ backgroundColor: SOURCE_COLORS[row.source] ?? '#94a3b8' }}
                    />
                    <span className="flex-1 truncate">{SOURCE_LABELS[row.source] ?? row.source}</span>
                    <span className="tabular-nums text-muted-foreground">{row.plays}</span>
                    <span className="tabular-nums text-xs text-muted-foreground w-12 text-right">
                      {pct.toFixed(1)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Discovery Tab
// ============================================================================

const DiscoveryTab = memo(function DiscoveryTab({ analytics }: { analytics: EnhancedAnalyticsResponse }) {
  if (!analytics.discovery) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Discovery insights not available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="New Artists Discovered"
          value={analytics.discovery.newArtistsDiscovered.toString()}
          description="In the selected period"
        />
        <MetricCard
          title="Diversity Score"
          value={`${(analytics.discovery.genreDiversityScore * 100).toFixed(0)}%`}
          description="How varied your taste is"
        />
        <MetricCard
          title="Diversity Trend"
          value={analytics.discovery.diversityTrend}
          description={
            analytics.discovery.diversityTrend === 'expanding'
              ? 'Exploring more variety'
              : analytics.discovery.diversityTrend === 'narrowing'
                ? 'Focusing on favorites'
                : 'Taste is stable'
          }
        />
      </div>

      {analytics.discovery.newArtistNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>New Artists You've Discovered</CardTitle>
            <CardDescription>
              {analytics.discovery.newArtistNames.length} new artist
              {analytics.discovery.newArtistNames.length !== 1 ? 's' : ''} added to your favorites
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {analytics.discovery.newArtistNames.map((artist) => (
                <span
                  key={artist}
                  className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                >
                  {artist}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

// ============================================================================
// Helper Components
// ============================================================================

const TopArtistsChart = memo(function TopArtistsChart({ artists }: { artists: Array<{ artist: string; count: number }> }) {
  // Memoize chart data transformation
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const chartData = useMemo(() => {
    return artists.slice(0, 5).map((item, index) => ({
      name: item.artist,
      value: item.count,
      color: PIE_COLORS[index % PIE_COLORS.length],
    }));
  }, [artists]);

  if (artists.length === 0) {
    return <p className="text-sm text-muted-foreground">No artist data available</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={(entry) => `${entry.name} (${entry.value})`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
});

const TasteProfileCard = memo(function TasteProfileCard({ analytics }: { analytics: EnhancedAnalyticsResponse }) {
  // Memoize derived data
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const { topArtists, diversityScore } = useMemo(() => ({
    topArtists: analytics.profile.likedArtists.slice(0, 3),
    diversityScore: analytics.discovery?.genreDiversityScore || 0,
  }), [analytics.profile.likedArtists, analytics.discovery?.genreDiversityScore]);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">Dominant Artists</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {topArtists.map((artist) => (
            <span
              key={artist.artist}
              className="inline-flex items-center rounded-md bg-secondary/10 px-2 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              {artist.artist}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Diversity</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary/20">
            <div
              className="h-full bg-secondary"
              style={{ width: `${diversityScore * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium">{(diversityScore * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
});

const MetricCard = memo(function MetricCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold capitalize">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
});

const AnalyticsLoadingSkeleton = memo(function AnalyticsLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {['card-1', 'card-2', 'card-3'].map((key) => (
          <Card key={key}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
});
