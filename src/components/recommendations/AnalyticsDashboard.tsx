/**
 * Advanced Analytics Dashboard Component
 * Displays comprehensive music taste analytics with interactive charts
 */

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

// ============================================================================
// Types
// ============================================================================

interface EnhancedAnalyticsResponse {
  profile: {
    likedArtists: Array<{ artist: string; count: number }>;
    dislikedArtists: Array<{ artist: string; count: number }>;
    feedbackCount: {
      total: number;
      thumbsUp: number;
      thumbsDown: number;
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="discovery">Discovery</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <OverviewTab analytics={analytics} />
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
          <CardDescription>Your most favorited artists</CardDescription>
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

function QualityTab({ analytics }: { analytics: EnhancedAnalyticsResponse }) {
  if (!analytics.quality || !analytics.tasteEvolution) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Quality metrics not available.</p>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const chartData = analytics.tasteEvolution.dataPoints.map(dp => {
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
          description="Songs rated"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Activity Tab
// ============================================================================

function ActivityTab({ analytics }: { analytics: EnhancedAnalyticsResponse }) {
  if (!analytics.activity) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Activity data not available.</p>
        </CardContent>
      </Card>
    );
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

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Listening Patterns</CardTitle>
          <CardDescription>When you're most active</CardDescription>
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
            <CardTitle>Activity by Day of Week</CardTitle>
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
            <CardTitle>Activity by Hour</CardTitle>
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
}

// ============================================================================
// Discovery Tab
// ============================================================================

function DiscoveryTab({ analytics }: { analytics: EnhancedAnalyticsResponse }) {
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
}

// ============================================================================
// Helper Components
// ============================================================================

function TopArtistsChart({ artists }: { artists: Array<{ artist: string; count: number }> }) {
  if (artists.length === 0) {
    return <p className="text-sm text-muted-foreground">No artist data available</p>;
  }

  const chartData = artists.slice(0, 5).map((item, index) => ({
    name: item.artist,
    value: item.count,
    color: PIE_COLORS[index % PIE_COLORS.length],
  }));

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
}

function TasteProfileCard({ analytics }: { analytics: EnhancedAnalyticsResponse }) {
  const topArtists = analytics.profile.likedArtists.slice(0, 3);
  const diversityScore = analytics.discovery?.genreDiversityScore || 0;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">Dominant Artists</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {topArtists.map((artist) => (
            <span
              key={artist.artist}
              className="inline-flex items-center rounded-md bg-secondary/10 px-2 py-0.5 text-xs font-medium text-secondary"
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
}

function MetricCard({ title, value, description }: { title: string; value: string; description: string }) {
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
}

function AnalyticsLoadingSkeleton() {
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
}
