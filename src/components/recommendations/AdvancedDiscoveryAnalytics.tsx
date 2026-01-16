/**
 * Advanced Discovery Analytics Dashboard Component
 *
 * Comprehensive analytics for recommendation effectiveness:
 * - Acceptance rate by recommendation type (similar/discovery/mood/personalized)
 * - Top recommended artists and genres
 * - User engagement patterns by time and day
 * - A/B testing capabilities for recommendation algorithms
 */

import { useMemo, memo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
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
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Music,
  Users,
  Disc3,
  FlaskConical,
  BarChart3,
  Clock,
  Calendar,
  Sparkles,
  Target,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface RecommendationModeMetrics {
  mode: string;
  totalRecommendations: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
  acceptanceRate: number;
  avgEngagementTime?: number;
  trend: 'improving' | 'declining' | 'stable';
}

interface TopArtistMetric {
  artist: string;
  recommendationCount: number;
  acceptanceRate: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
}

interface TopGenreMetric {
  genre: string;
  recommendationCount: number;
  acceptanceRate: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
  avgScore?: number;
}

interface EngagementPattern {
  timeSlot: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number;
  engagementCount: number;
  acceptanceRate: number;
  avgPlayDuration?: number;
}

interface ABTestResult {
  variantName: string;
  variantId: string;
  sampleSize: number;
  acceptanceRate: number;
  clickThroughRate: number;
  playRate: number;
  saveRate: number;
  isWinner: boolean;
}

interface ABTest {
  testId: string;
  testName: string;
  description: string;
  status: 'active' | 'completed' | 'paused';
  startDate: string;
  endDate?: string;
  variants: ABTestResult[];
  conclusionSummary?: string;
}

interface DiscoveryAnalyticsResponse {
  success: boolean;
  period: string;
  metrics: {
    summary?: {
      totalFeedback: number;
      overallAcceptanceRate: number;
      discoveryScore: number;
      weekOverWeekChange: number;
      monthOverMonthChange: number;
    };
    modeMetrics?: RecommendationModeMetrics[];
    topArtists?: TopArtistMetric[];
    topGenres?: TopGenreMetric[];
    engagementPatterns?: EngagementPattern[];
    abTests?: {
      active: ABTest[];
      completed: ABTest[];
    };
  };
  generatedAt: string;
}

// ============================================================================
// API
// ============================================================================

async function fetchDiscoveryAnalytics(
  period: '7d' | '30d' | '90d' | '1y' | 'all'
): Promise<DiscoveryAnalyticsResponse> {
  const response = await fetch(`/api/recommendations/discovery-analytics?period=${period}`);
  if (!response.ok) {
    throw new Error('Failed to fetch discovery analytics');
  }
  return response.json();
}

// ============================================================================
// Constants
// ============================================================================

const COLORS = {
  primary: '#8b5cf6',
  secondary: '#ec4899',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  purple: '#a855f7',
  indigo: '#6366f1',
  cyan: '#06b6d4',
  emerald: '#34d399',
};

const MODE_COLORS: Record<string, string> = {
  similar: COLORS.primary,
  discovery: COLORS.success,
  mood: COLORS.secondary,
  personalized: COLORS.purple,
  playlist: COLORS.info,
  search: COLORS.warning,
  library: COLORS.indigo,
};

const MODE_LABELS: Record<string, string> = {
  similar: 'Similar Songs',
  discovery: 'Discovery',
  mood: 'Mood-Based',
  personalized: 'Personalized',
  playlist: 'Playlist',
  search: 'Search',
  library: 'Library',
};

const PIE_COLORS = [
  COLORS.primary,
  COLORS.secondary,
  COLORS.success,
  COLORS.warning,
  COLORS.info,
  COLORS.purple,
  COLORS.cyan,
  COLORS.emerald,
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ============================================================================
// Main Component
// ============================================================================

interface AdvancedDiscoveryAnalyticsProps {
  period?: '7d' | '30d' | '90d' | '1y' | 'all';
}

export function AdvancedDiscoveryAnalytics({
  period = '30d',
}: AdvancedDiscoveryAnalyticsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState(period);

  const { data, isLoading, error } = useQuery({
    queryKey: ['discovery-analytics', selectedPeriod],
    queryFn: () => fetchDiscoveryAnalytics(selectedPeriod),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Debug logging
  if (data && !isLoading) {
    console.log('📊 Discovery Analytics Data:', {
      summary: data.metrics.summary,
      modeMetricsCount: data.metrics.modeMetrics?.length || 0,
      topArtistsCount: data.metrics.topArtists?.length || 0,
      topGenresCount: data.metrics.topGenres?.length || 0,
      engagementPatternsCount: data.metrics.engagementPatterns?.length || 0,
      activeTestsCount: data.metrics.abTests?.active?.length || 0,
      completedTestsCount: data.metrics.abTests?.completed?.length || 0,
    });
  }

  if (isLoading) {
    return <AnalyticsLoadingSkeleton />;
  }

  if (error || !data?.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analytics Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load discovery analytics. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { metrics } = data;

  // Check if user has enough data
  if (!metrics.summary || metrics.summary.totalFeedback < 5) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Not Enough Data Yet
          </CardTitle>
          <CardDescription>
            You need at least 5 feedback entries to view discovery analytics.
            Keep rating songs to unlock insights!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress
            value={(metrics.summary?.totalFeedback || 0) * 20}
            className="h-2"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            Current feedback: {metrics.summary?.totalFeedback || 0} / 5
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-2xl font-bold tracking-tight">
            Analytics Overview
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Your recommendation patterns
          </p>
        </div>
        <select
          className="flex h-9 sm:h-10 w-full sm:w-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={selectedPeriod}
          onChange={(e) =>
            setSelectedPeriod(e.target.value as typeof selectedPeriod)
          }
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="1y">Last Year</option>
          <option value="all">All Time</option>
        </select>
      </div>

      {/* Summary Cards */}
      <SummaryCards summary={metrics.summary} />

      {/* Tabs */}
      <Tabs defaultValue="modes" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="modes" className="gap-1 sm:gap-2 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <Target className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden sm:inline">Types</span>
          </TabsTrigger>
          <TabsTrigger value="content" className="gap-1 sm:gap-2 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <Music className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden sm:inline">Content</span>
          </TabsTrigger>
          <TabsTrigger value="engagement" className="gap-1 sm:gap-2 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <Clock className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden sm:inline">Time</span>
          </TabsTrigger>
          <TabsTrigger value="experiments" className="gap-1 sm:gap-2 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <FlaskConical className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden sm:inline">Tests</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="modes" className="space-y-4">
          <RecommendationModesTab modeMetrics={metrics.modeMetrics || []} />
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <TopContentTab
            topArtists={metrics.topArtists || []}
            topGenres={metrics.topGenres || []}
          />
        </TabsContent>

        <TabsContent value="engagement" className="space-y-4">
          <EngagementTab engagementPatterns={metrics.engagementPatterns || []} />
        </TabsContent>

        <TabsContent value="experiments" className="space-y-4">
          <ABTestingTab
            activeTests={metrics.abTests?.active || []}
            completedTests={metrics.abTests?.completed || []}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Summary Cards
// ============================================================================

const SummaryCards = memo(function SummaryCards({
  summary,
}: {
  summary: NonNullable<DiscoveryAnalyticsResponse['metrics']['summary']>;
}) {
  const trendIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-success" />;
    if (change < 0) return <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-danger" />;
    return <Minus className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />;
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
          <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
            <span className="truncate">Feedback</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="text-lg sm:text-2xl font-bold">{summary.totalFeedback}</div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            Songs rated
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
          <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
            <Target className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
            <span className="truncate">Accept Rate</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="text-lg sm:text-2xl font-bold">
            {(summary.overallAcceptanceRate * 100).toFixed(1)}%
          </div>
          <div className="flex items-center gap-1 text-[10px] sm:text-xs">
            {trendIcon(summary.weekOverWeekChange)}
            <span
              className={
                summary.weekOverWeekChange > 0
                  ? 'text-success'
                  : summary.weekOverWeekChange < 0
                    ? 'text-danger'
                    : 'text-muted-foreground'
              }
            >
              {summary.weekOverWeekChange > 0 ? '+' : ''}
              {summary.weekOverWeekChange.toFixed(1)}%
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
          <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
            <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
            <span className="truncate">Discovery</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="text-lg sm:text-2xl font-bold">
            {summary.discoveryScore.toFixed(0)}
          </div>
          <Progress value={summary.discoveryScore} className="mt-1 sm:mt-2 h-1.5 sm:h-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
          <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
            <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
            <span className="truncate">Monthly</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="text-lg sm:text-2xl font-bold">
              {summary.monthOverMonthChange > 0 ? '+' : ''}
              {summary.monthOverMonthChange.toFixed(1)}%
            </div>
            {summary.monthOverMonthChange > 0 ? (
              <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
            ) : summary.monthOverMonthChange < 0 ? (
              <ArrowDownRight className="h-4 w-4 sm:h-5 sm:w-5 text-danger" />
            ) : (
              <Minus className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
            )}
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            vs prev month
          </p>
        </CardContent>
      </Card>
    </div>
  );
});

// ============================================================================
// Recommendation Modes Tab
// ============================================================================

const RecommendationModesTab = memo(function RecommendationModesTab({
  modeMetrics,
}: {
  modeMetrics: RecommendationModeMetrics[];
}) {
  console.log('🎯 RecommendationModesTab - modeMetrics:', modeMetrics);

  const chartData = useMemo(() => {
    return modeMetrics.map((m) => ({
      name: MODE_LABELS[m.mode] || m.mode,
      mode: m.mode,
      total: m.totalRecommendations,
      accepted: m.thumbsUpCount,
      rejected: m.thumbsDownCount,
      acceptanceRate: m.acceptanceRate * 100,
    }));
  }, [modeMetrics]);

  const pieData = useMemo(() => {
    return modeMetrics.map((m, i) => ({
      name: MODE_LABELS[m.mode] || m.mode,
      value: m.totalRecommendations,
      color: MODE_COLORS[m.mode] || PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [modeMetrics]);

  if (modeMetrics.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            No recommendation data available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
      {/* Acceptance Rate by Mode */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-sm sm:text-base">Acceptance by Type</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Performance by recommendation type
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <ResponsiveContainer width="100%" height={200} className="sm:!h-[300px]">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10 }}
              />
              <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(value: number) => `${value.toFixed(1)}%`}
                labelStyle={{ color: 'var(--foreground)' }}
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                }}
              />
              <Bar
                dataKey="acceptanceRate"
                fill={COLORS.primary}
                radius={[0, 4, 4, 0]}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={MODE_COLORS[entry.mode] || COLORS.primary}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Distribution Pie Chart */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-sm sm:text-base">Distribution</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Recommendations by type
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <ResponsiveContainer width="100%" height={200} className="sm:!h-[300px]">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ percent }) =>
                  `${(percent * 100).toFixed(0)}%`
                }
                outerRadius={70}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Mode Details Cards */}
      <Card className="lg:col-span-2">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-sm sm:text-base">Details by Type</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Performance per recommendation source
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
            {modeMetrics.map((metric) => (
              <ModeMetricCard key={metric.mode} metric={metric} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

const ModeMetricCard = memo(function ModeMetricCard({
  metric,
}: {
  metric: RecommendationModeMetrics;
}) {
  const trendBadge = () => {
    switch (metric.trend) {
      case 'improving':
        return (
          <Badge variant="outline" className="bg-success/10 text-success text-[10px] sm:text-xs px-1 sm:px-2">
            <TrendingUp className="mr-0.5 sm:mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
            <span className="hidden sm:inline">Improving</span>
            <span className="sm:hidden">↑</span>
          </Badge>
        );
      case 'declining':
        return (
          <Badge variant="outline" className="bg-danger/10 text-danger text-[10px] sm:text-xs px-1 sm:px-2">
            <TrendingDown className="mr-0.5 sm:mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
            <span className="hidden sm:inline">Declining</span>
            <span className="sm:hidden">↓</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] sm:text-xs px-1 sm:px-2">
            <Minus className="mr-0.5 sm:mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
            <span className="hidden sm:inline">Stable</span>
            <span className="sm:hidden">−</span>
          </Badge>
        );
    }
  };

  return (
    <div
      className="rounded-lg border p-2 sm:p-4"
      style={{
        borderLeftColor: MODE_COLORS[metric.mode] || COLORS.primary,
        borderLeftWidth: 3,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <h4 className="font-semibold text-xs sm:text-sm truncate">
          {MODE_LABELS[metric.mode] || metric.mode}
        </h4>
        {trendBadge()}
      </div>
      <div className="mt-2 sm:mt-3 space-y-1 sm:space-y-2">
        <div className="flex justify-between text-[10px] sm:text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-medium">{metric.totalRecommendations}</span>
        </div>
        <div className="flex justify-between text-[10px] sm:text-sm">
          <span className="text-muted-foreground">👍</span>
          <span className="font-medium text-success">
            {metric.thumbsUpCount}
          </span>
        </div>
        <div className="flex justify-between text-[10px] sm:text-sm">
          <span className="text-muted-foreground">👎</span>
          <span className="font-medium text-danger">
            {metric.thumbsDownCount}
          </span>
        </div>
        <div className="pt-1 sm:pt-2">
          <div className="flex justify-between text-[10px] sm:text-sm">
            <span className="text-muted-foreground">Rate</span>
            <span className="font-bold">
              {(metric.acceptanceRate * 100).toFixed(0)}%
            </span>
          </div>
          <Progress
            value={metric.acceptanceRate * 100}
            className="mt-1 h-1.5 sm:h-2"
          />
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// Top Content Tab
// ============================================================================

const TopContentTab = memo(function TopContentTab({
  topArtists,
  topGenres,
}: {
  topArtists: TopArtistMetric[];
  topGenres: TopGenreMetric[];
}) {
  console.log('🎨 TopContentTab - topArtists:', topArtists.length, 'topGenres:', topGenres.length);

  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
      {/* Top Artists */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Users className="h-4 w-4 sm:h-5 sm:w-5" />
            Top Artists
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Most recommended artists
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="space-y-2 sm:space-y-3">
            {topArtists.slice(0, 6).map((artist, index) => (
              <div
                key={artist.artist}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] sm:text-xs font-medium text-primary shrink-0">
                    {index + 1}
                  </span>
                  <span className="font-medium text-xs sm:text-sm truncate">{artist.artist}</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                  <span className="text-[10px] sm:text-sm text-muted-foreground hidden xs:inline">
                    {artist.recommendationCount}
                  </span>
                  <Badge
                    variant={
                      artist.acceptanceRate > 0.7
                        ? 'default'
                        : artist.acceptanceRate > 0.5
                          ? 'secondary'
                          : 'outline'
                    }
                    className="text-[10px] sm:text-xs px-1 sm:px-2"
                  >
                    {(artist.acceptanceRate * 100).toFixed(0)}%
                  </Badge>
                </div>
              </div>
            ))}
            {topArtists.length === 0 && (
              <p className="text-xs sm:text-sm text-muted-foreground">
                No artist data available yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top Genres */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Disc3 className="h-4 w-4 sm:h-5 sm:w-5" />
            Top Genres
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Most recommended genres
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <ResponsiveContainer width="100%" height={180} className="sm:!h-[300px]">
            <RadarChart
              cx="50%"
              cy="50%"
              outerRadius="70%"
              data={topGenres.slice(0, 6).map((g) => ({
                genre: g.genre.length > 8 ? g.genre.slice(0, 8) + '...' : g.genre,
                count: g.recommendationCount,
                acceptance: g.acceptanceRate * 100,
              }))}
            >
              <PolarGrid />
              <PolarAngleAxis dataKey="genre" tick={{ fontSize: 9 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 8 }} />
              <Radar
                name="Accept %"
                dataKey="acceptance"
                stroke={COLORS.primary}
                fill={COLORS.primary}
                fillOpacity={0.5}
              />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
          {topGenres.length === 0 && (
            <p className="text-xs sm:text-sm text-muted-foreground">
              No genre data available yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

// ============================================================================
// Engagement Tab
// ============================================================================

const EngagementTab = memo(function EngagementTab({
  engagementPatterns,
}: {
  engagementPatterns: EngagementPattern[];
}) {
  console.log('⏰ EngagementTab - patterns:', engagementPatterns.length);

  const timeSlotData = useMemo(() => {
    const slots = ['morning', 'afternoon', 'evening', 'night'];
    return slots.map((slot) => {
      const patterns = engagementPatterns.filter((p) => p.timeSlot === slot);
      const total = patterns.reduce((sum, p) => sum + p.engagementCount, 0);
      const avgAcceptance =
        patterns.length > 0
          ? patterns.reduce((sum, p) => sum + p.acceptanceRate, 0) /
            patterns.length
          : 0;
      return {
        name: slot.charAt(0).toUpperCase() + slot.slice(1),
        engagement: total,
        acceptanceRate: avgAcceptance * 100,
      };
    });
  }, [engagementPatterns]);

  const dayData = useMemo(() => {
    return DAY_NAMES.map((day, index) => {
      const patterns = engagementPatterns.filter((p) => p.dayOfWeek === index);
      const total = patterns.reduce((sum, p) => sum + p.engagementCount, 0);
      const avgAcceptance =
        patterns.length > 0
          ? patterns.reduce((sum, p) => sum + p.acceptanceRate, 0) /
            patterns.length
          : 0;
      return {
        day,
        engagement: total,
        acceptanceRate: avgAcceptance * 100,
      };
    });
  }, [engagementPatterns]);

  if (engagementPatterns.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 sm:pt-6">
          <p className="text-xs sm:text-sm text-muted-foreground">
            No engagement data available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
      {/* Engagement by Time of Day */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
            By Time of Day
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Your peak engagement times
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <ResponsiveContainer width="100%" height={180} className="sm:!h-[300px]">
            <BarChart data={timeSlotData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10 }}
              />
              <Tooltip contentStyle={{ fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Bar
                yAxisId="left"
                dataKey="engagement"
                fill={COLORS.primary}
                name="Count"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="acceptanceRate"
                stroke={COLORS.success}
                name="Accept %"
                strokeWidth={2}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Engagement by Day of Week */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
            By Day of Week
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Weekly patterns
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <ResponsiveContainer width="100%" height={180} className="sm:!h-[300px]">
            <LineChart data={dayData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10 }}
              />
              <Tooltip contentStyle={{ fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="engagement"
                stroke={COLORS.primary}
                name="Count"
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="acceptanceRate"
                stroke={COLORS.success}
                name="Accept %"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
});

// ============================================================================
// A/B Testing Tab
// ============================================================================

const ABTestingTab = memo(function ABTestingTab({
  activeTests,
  completedTests,
}: {
  activeTests: ABTest[];
  completedTests: ABTest[];
}) {
  console.log('🧪 ABTestingTab - active:', activeTests.length, 'completed:', completedTests.length);

  if (activeTests.length === 0 && completedTests.length === 0) {
    return (
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <FlaskConical className="h-4 w-4 sm:h-5 sm:w-5" />
            A/B Testing
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            No tests found
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <p className="text-xs sm:text-sm text-muted-foreground">
            Tests compare algorithms to find what works best for you.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {activeTests.map((test) => (
        <ABTestCard key={test.testId} test={test} />
      ))}
      {completedTests.length > 0 && (
        <>
          <h3 className="text-sm sm:text-lg font-semibold">Completed Tests</h3>
          {completedTests.map((test) => (
            <ABTestCard key={test.testId} test={test} />
          ))}
        </>
      )}
    </div>
  );
});

const ABTestCard = memo(function ABTestCard({ test }: { test: ABTest }) {
  const chartData = test.variants.map((v) => ({
    name: v.variantName.length > 10 ? v.variantName.slice(0, 10) + '...' : v.variantName,
    fullName: v.variantName,
    acceptanceRate: v.acceptanceRate * 100,
    clickRate: v.clickThroughRate * 100,
    playRate: v.playRate * 100,
    saveRate: v.saveRate * 100,
    sampleSize: v.sampleSize,
    isWinner: v.isWinner,
  }));

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <FlaskConical className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="truncate">{test.testName}</span>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm line-clamp-2">{test.description}</CardDescription>
          </div>
          <Badge
            variant={
              test.status === 'active'
                ? 'default'
                : test.status === 'completed'
                  ? 'secondary'
                  : 'outline'
            }
            className="text-[10px] sm:text-xs shrink-0"
          >
            {test.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          {/* Variants Comparison Chart */}
          <ResponsiveContainer width="100%" height={180} className="sm:!h-[250px]">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={{ fontSize: '11px' }} />
              <Legend wrapperStyle={{ fontSize: '9px' }} />
              <Bar
                dataKey="acceptanceRate"
                fill={COLORS.success}
                name="Accept"
              />
              <Bar
                dataKey="clickRate"
                fill={COLORS.primary}
                name="Click"
              />
              <Bar
                dataKey="playRate"
                fill={COLORS.info}
                name="Play"
              />
            </BarChart>
          </ResponsiveContainer>

          {/* Variants Details */}
          <div className="space-y-2 sm:space-y-3">
            {test.variants.map((variant) => (
              <div
                key={variant.variantId}
                className={`rounded-lg border p-2 sm:p-3 ${
                  variant.isWinner ? 'border-success bg-success/5' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-xs sm:text-sm truncate">{variant.variantName}</span>
                  {variant.isWinner && (
                    <Badge className="bg-success text-[10px] sm:text-xs px-1 sm:px-2">Winner</Badge>
                  )}
                </div>
                <div className="mt-1.5 sm:mt-2 grid grid-cols-2 gap-1 sm:gap-2 text-[10px] sm:text-sm">
                  <div>
                    <span className="text-muted-foreground">N: </span>
                    <span className="font-medium">{variant.sampleSize}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Accept: </span>
                    <span className="font-medium">
                      {(variant.acceptanceRate * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Click: </span>
                    <span className="font-medium">
                      {(variant.clickThroughRate * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Play: </span>
                    <span className="font-medium">
                      {(variant.playRate * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {test.conclusionSummary && (
              <div className="rounded-lg bg-muted p-2 sm:p-3">
                <p className="text-xs sm:text-sm font-medium">Conclusion</p>
                <p className="text-[10px] sm:text-sm text-muted-foreground line-clamp-2">
                  {test.conclusionSummary}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Loading Skeleton
// ============================================================================

const AnalyticsLoadingSkeleton = memo(function AnalyticsLoadingSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="space-y-2">
          <Skeleton className="h-6 sm:h-8 w-36 sm:w-48" />
          <Skeleton className="h-3 sm:h-4 w-48 sm:w-64" />
        </div>
        <Skeleton className="h-9 sm:h-10 w-full sm:w-32" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <Skeleton className="h-3 sm:h-4 w-16 sm:w-24" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <Skeleton className="h-6 sm:h-8 w-12 sm:w-16" />
              <Skeleton className="mt-1 sm:mt-2 h-2 sm:h-3 w-20 sm:w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="p-3 sm:p-6">
          <Skeleton className="h-4 sm:h-6 w-32 sm:w-48" />
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <Skeleton className="h-40 sm:h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
});

export default AdvancedDiscoveryAnalytics;
