/**
 * Music Identity Dashboard Component
 *
 * Main dashboard for viewing and generating music identity summaries
 * (Spotify Wrapped-style yearly/monthly music reports)
 */

import { memo, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calendar,
  Sparkles,
  TrendingUp,
  Music,
  Users,
  Clock,
  RefreshCw,
  ChevronRight,
  Home,
} from 'lucide-react';
import type { MusicIdentitySummary } from '@/lib/db/schema/music-identity.schema';
import { MusicIdentityCard } from './MusicIdentityCard';
import { TrendAnalysisWidget } from './TrendAnalysisWidget';
import { MoodProfileChart } from './MoodProfileChart';
import { ShareableCard } from './ShareableCard';

// ============================================================================
// Types
// ============================================================================

interface AvailablePeriods {
  years: number[];
  months: Array<{ year: number; month: number }>;
}

interface MusicIdentityListResponse {
  summaries: MusicIdentitySummary[];
  availablePeriods: AvailablePeriods | null;
}

interface GenerateSummaryRequest {
  periodType: 'month' | 'year';
  year: number;
  month?: number;
  regenerate?: boolean;
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchMusicIdentitySummaries(): Promise<MusicIdentityListResponse> {
  const response = await fetch('/api/music-identity?includeAvailable=true');
  if (!response.ok) {
    throw new Error('Failed to fetch music identity summaries');
  }
  const data = await response.json();
  return data.data;
}

async function generateSummary(request: GenerateSummaryRequest): Promise<{
  summary: MusicIdentitySummary;
  isNew: boolean;
}> {
  const response = await fetch('/api/music-identity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to generate summary');
  }

  const data = await response.json();
  return data.data;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || '';
}

// ============================================================================
// Components
// ============================================================================

export function MusicIdentityDashboard() {
  const queryClient = useQueryClient();
  const [selectedSummary, setSelectedSummary] = useState<MusicIdentitySummary | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [generatePeriodType, setGeneratePeriodType] = useState<'month' | 'year'>('year');
  const [generateYear, setGenerateYear] = useState<number>(new Date().getFullYear());
  const [generateMonth, setGenerateMonth] = useState<number>(new Date().getMonth() + 1);

  // Fetch summaries
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.musicIdentity.list(),
    queryFn: fetchMusicIdentitySummaries,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: generateSummary,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.musicIdentity.all() });
      setSelectedSummary(result.summary);
      setShowGenerator(false);
      toast.success(
        result.isNew ? 'Music identity generated!' : 'Found existing summary',
        {
          description: result.summary.title,
        }
      );
    },
    onError: (error) => {
      toast.error('Failed to generate', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });

  const summaries = data?.summaries || [];
  const availablePeriods = data?.availablePeriods;

  // Group summaries by year
  const groupedSummaries = useMemo(() => {
    const grouped = new Map<number, MusicIdentitySummary[]>();
    for (const summary of summaries) {
      const year = summary.year;
      if (!grouped.has(year)) {
        grouped.set(year, []);
      }
      grouped.get(year)!.push(summary);
    }
    return grouped;
  }, [summaries]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Music Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'Failed to load your music identity data'}
          </p>
          <Button onClick={() => refetch()}>Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  // Show selected summary detail view
  if (selectedSummary) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          onClick={() => setSelectedSummary(null)}
          className="mb-4"
        >
          <ChevronRight className="mr-2 h-4 w-4 rotate-180" />
          Back to All Summaries
        </Button>

        <MusicIdentityDetail
          summary={selectedSummary}
          onRefresh={() => {
            generateMutation.mutate({
              periodType: selectedSummary.periodType as 'month' | 'year',
              year: selectedSummary.year,
              month: selectedSummary.month || undefined,
              regenerate: true,
            });
          }}
          isRefreshing={generateMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back to Dashboard Button */}
      <Button variant="ghost" asChild className="mb-2">
        <Link to="/dashboard">
          <Home className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Link>
      </Button>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Your Music Identity
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered insights into your listening journey
          </p>
        </div>

        <Button
          onClick={() => setShowGenerator(!showGenerator)}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Generate New Summary
        </Button>
      </div>

      {/* Generator Panel */}
      {showGenerator && (
        <Card className="border-primary/20 bg-gradient-to-br from-purple-500/5 to-pink-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Music Identity Summary
            </CardTitle>
            <CardDescription>
              Create a personalized summary of your music taste
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Period Type</label>
                <Select
                  value={generatePeriodType}
                  onValueChange={(v) => setGeneratePeriodType(v as 'month' | 'year')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year">Yearly Summary</SelectItem>
                    <SelectItem value="month">Monthly Summary</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Year</label>
                <Select
                  value={generateYear.toString()}
                  onValueChange={(v) => setGenerateYear(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(availablePeriods?.years || [new Date().getFullYear()]).map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {generatePeriodType === 'month' && (
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Month</label>
                  <Select
                    value={generateMonth.toString()}
                    onValueChange={(v) => setGenerateMonth(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1)
                        .filter((month) => {
                          if (!availablePeriods) return true;
                          return availablePeriods.months.some(
                            (m) => m.year === generateYear && m.month === month
                          );
                        })
                        .map((month) => (
                          <SelectItem key={month} value={month.toString()}>
                            {getMonthName(month)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-end">
                <Button
                  onClick={() => {
                    generateMutation.mutate({
                      periodType: generatePeriodType,
                      year: generateYear,
                      month: generatePeriodType === 'month' ? generateMonth : undefined,
                    });
                  }}
                  disabled={generateMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {generateMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {summaries.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Music Identity Summaries Yet</h3>
            <p className="text-muted-foreground mb-4">
              Generate your first summary to discover insights about your music taste
            </p>
            <Button onClick={() => setShowGenerator(true)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Your First Summary
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(groupedSummaries.entries())
            .sort(([a], [b]) => b - a)
            .map(([year, yearSummaries]) => (
              <div key={year} className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  {year}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {yearSummaries
                    .sort((a, b) => (b.month || 0) - (a.month || 0))
                    .map((summary) => (
                      <MusicIdentityCard
                        key={summary.id}
                        summary={summary}
                        onClick={() => setSelectedSummary(summary)}
                      />
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Detail View Component
// ============================================================================

interface MusicIdentityDetailProps {
  summary: MusicIdentitySummary;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const MusicIdentityDetail = memo(function MusicIdentityDetail({
  summary,
  onRefresh,
  isRefreshing,
}: MusicIdentityDetailProps) {
  const [activeTab, setActiveTab] = useState('overview');

  const periodLabel = summary.month
    ? `${getMonthName(summary.month)} ${summary.year}`
    : `${summary.year}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            {summary.title}
          </h1>
          <p className="text-muted-foreground mt-1">
            {summary.periodType === 'year' ? 'Yearly' : 'Monthly'} Summary - {periodLabel}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Regenerate
          </Button>
        </div>
      </div>

      {/* AI Insights Hero */}
      <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-500/20 rounded-xl">
              <Sparkles className="h-6 w-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-2">
                {summary.aiInsights.musicPersonality.type}
              </h3>
              <p className="text-muted-foreground">
                {summary.aiInsights.narrative}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {summary.aiInsights.musicPersonality.traits.map((trait) => (
              <span
                key={trait}
                className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 text-sm font-medium"
              >
                {trait}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground w-full md:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="mood">Mood</TabsTrigger>
          <TabsTrigger value="artists">Artists</TabsTrigger>
          <TabsTrigger value="share">Share</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <OverviewTab summary={summary} />
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <TrendAnalysisWidget
            trendAnalysis={summary.trendAnalysis}
            periodType={summary.periodType as 'month' | 'year'}
          />
        </TabsContent>

        <TabsContent value="mood" className="space-y-4">
          <MoodProfileChart moodProfile={summary.moodProfile} />
        </TabsContent>

        <TabsContent value="artists" className="space-y-4">
          <ArtistsTab summary={summary} />
        </TabsContent>

        <TabsContent value="share" className="space-y-4">
          <ShareableCard summary={summary} />
        </TabsContent>
      </Tabs>
    </div>
  );
});

// ============================================================================
// Overview Tab
// ============================================================================

const OverviewTab = memo(function OverviewTab({ summary }: { summary: MusicIdentitySummary }) {
  const stats = summary.stats;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Stats Cards */}
      <StatCard
        icon={<Music className="h-5 w-5" />}
        label="Total Listens"
        value={stats.totalListens.toLocaleString()}
        subtext={`${stats.uniqueTracks.toLocaleString()} unique tracks`}
      />
      <StatCard
        icon={<Clock className="h-5 w-5" />}
        label="Time Listened"
        value={`${Math.round(stats.totalMinutesListened / 60)}h`}
        subtext={`${stats.totalMinutesListened.toLocaleString()} minutes`}
      />
      <StatCard
        icon={<Users className="h-5 w-5" />}
        label="Artists"
        value={stats.uniqueArtists.toString()}
        subtext="unique artists"
      />
      <StatCard
        icon={<TrendingUp className="h-5 w-5" />}
        label="Completion Rate"
        value={`${stats.completionRate}%`}
        subtext="songs completed"
      />

      {/* Highlights */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Highlights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {summary.aiInsights.highlights.map((highlight, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-purple-600">&#x2022;</span>
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Fun Facts */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Fun Facts</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {summary.aiInsights.funFacts.map((fact, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-pink-600">&#x2726;</span>
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Top Artists */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Top Artists</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {summary.topArtists.slice(0, 5).map((artist, i) => (
              <div key={artist.name} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="font-medium">{artist.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {artist.count} plays ({artist.percentage}%)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Tracks */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Top Tracks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {summary.topTracks.slice(0, 5).map((track, i) => (
              <div key={track.name} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-secondary/10 flex items-center justify-center text-sm font-medium">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="font-medium truncate">{track.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {track.count} plays
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

// ============================================================================
// Artists Tab
// ============================================================================

const ArtistsTab = memo(function ArtistsTab({ summary }: { summary: MusicIdentitySummary }) {
  const affinities = summary.artistAffinities;

  const statusColors = {
    top: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
    rising: 'bg-green-500/20 text-green-700 dark:text-green-300',
    consistent: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
    fading: 'bg-gray-500/20 text-gray-700 dark:text-gray-300',
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Artist Affinities</CardTitle>
          <CardDescription>
            Your relationship with different artists over this period
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {affinities.map((affinity) => (
              <div
                key={affinity.artist}
                className="p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium">{affinity.artist}</h4>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[affinity.status]}`}>
                    {affinity.status}
                  </span>
                </div>
                <div className="text-2xl font-bold text-primary">
                  {affinity.affinityScore}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {affinity.playCount} plays
                </div>
                {affinity.relatedGenres.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {affinity.relatedGenres.slice(0, 3).map((genre) => (
                      <span
                        key={genre}
                        className="px-1.5 py-0.5 rounded bg-muted text-xs"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

// ============================================================================
// Helper Components
// ============================================================================

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
}

const StatCard = memo(function StatCard({ icon, label, value, subtext }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-muted-foreground">{icon}</div>
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <div className="text-3xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{subtext}</div>
      </CardContent>
    </Card>
  );
});

const DashboardSkeleton = memo(function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-6 w-32 mb-4" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
});

export default MusicIdentityDashboard;
