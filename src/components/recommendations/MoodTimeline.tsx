/**
 * Mood Timeline Visualization Component
 *
 * Interactive timeline displaying the evolution of user's music taste and mood preferences.
 * Supports zoom/pan, filtering, and historical data analysis.
 *
 * Story: Mood Timeline Visualization with Historical Music Preference Tracking
 */

import { useState, useMemo, useCallback, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import {
  ZoomIn,
  ZoomOut,
  Calendar,
  Filter,
  Download,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Music,
  TrendingUp,
  Sparkles,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface MoodDistribution {
  chill: number;
  energetic: number;
  melancholic: number;
  happy: number;
  focused: number;
  romantic: number;
  aggressive: number;
  neutral: number;
}

interface TopItem {
  name: string;
  count: number;
  percentage: number;
}

interface TimelineDataPoint {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  moodDistribution: MoodDistribution;
  topGenres: TopItem[];
  topArtists: TopItem[];
  topTracks: TopItem[];
  totalListens: number;
  totalFeedback: number;
  acceptanceRate: number;
  diversityScore: number;
  season?: string;
  isSignificantChange?: boolean;
  changeDescription?: string;
}

interface MoodTimelineResponse {
  dataPoints: TimelineDataPoint[];
  granularity: 'day' | 'week' | 'month' | 'year';
  startDate: string;
  endDate: string;
  totalPeriods: number;
  hasMoreData: boolean;
}

interface MoodTimelineProps {
  initialStartDate?: Date;
  initialEndDate?: Date;
  initialGranularity?: 'day' | 'week' | 'month' | 'year';
  onPeriodSelect?: (period: TimelineDataPoint) => void;
}

type TimeGranularity = 'day' | 'week' | 'month' | 'year';

// ============================================================================
// Constants
// ============================================================================

const MOOD_COLORS: Record<keyof MoodDistribution, string> = {
  chill: '#8b5cf6',      // Violet
  energetic: '#f59e0b',  // Amber
  melancholic: '#3b82f6', // Blue
  happy: '#10b981',      // Emerald
  focused: '#6366f1',    // Indigo
  romantic: '#ec4899',   // Pink
  aggressive: '#ef4444', // Red
  neutral: '#9ca3af',    // Gray
};

const MOOD_LABELS: Record<keyof MoodDistribution, string> = {
  chill: 'Chill',
  energetic: 'Energetic',
  melancholic: 'Melancholic',
  happy: 'Happy',
  focused: 'Focused',
  romantic: 'Romantic',
  aggressive: 'Intense',
  neutral: 'Neutral',
};

const GRANULARITY_OPTIONS: { value: TimeGranularity; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

// ============================================================================
// API Functions
// ============================================================================

async function fetchMoodTimeline(
  startDate: Date,
  endDate: Date,
  granularity: TimeGranularity,
  filters?: { moods?: string[]; genres?: string[]; artists?: string[] }
): Promise<MoodTimelineResponse> {
  const params = new URLSearchParams({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    granularity,
  });

  if (filters?.moods?.length) {
    params.set('moods', filters.moods.join(','));
  }
  if (filters?.genres?.length) {
    params.set('genres', filters.genres.join(','));
  }
  if (filters?.artists?.length) {
    params.set('artists', filters.artists.join(','));
  }

  const response = await fetch(`/api/recommendations/mood-timeline?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch mood timeline');
  }
  return response.json();
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDefaultDateRange(): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 3); // Default: last 3 months
  return { start, end };
}

function formatDateRange(start: Date, end: Date): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
}

// ============================================================================
// Subcomponents
// ============================================================================

const MoodTimelineTooltip = memo(function MoodTimelineTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  const dataPoint = payload[0]?.payload as TimelineDataPoint & { [key: string]: number };
  if (!dataPoint) return null;

  // Safely handle undefined or null moodDistribution
  const moodDistribution = dataPoint.moodDistribution || {};
  const hasMoodData = Object.keys(moodDistribution).length > 0;

  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg max-w-xs">
      <p className="font-medium text-sm mb-2">{dataPoint.periodLabel || 'Unknown Period'}</p>

      {/* Mood Breakdown */}
      {hasMoodData && (
        <div className="space-y-1 mb-3">
          <p className="text-xs text-muted-foreground font-medium">Mood Distribution</p>
          {Object.entries(moodDistribution)
            .filter(([, value]) => typeof value === 'number' && value > 0.05)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .slice(0, 4)
            .map(([mood, value]) => {
              const moodKey = mood as keyof MoodDistribution;
              if (!MOOD_COLORS[moodKey] || !MOOD_LABELS[moodKey]) return null;
              return (
                <div key={mood} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: MOOD_COLORS[moodKey] }}
                  />
                  <span className="text-xs">{MOOD_LABELS[moodKey]}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {((value as number) * 100).toFixed(0)}%
                  </span>
                </div>
              );
            })}
        </div>
      )}

      {/* Top Artists */}
      {dataPoint.topArtists && Array.isArray(dataPoint.topArtists) && dataPoint.topArtists.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-muted-foreground font-medium">Top Artists</p>
          <p className="text-xs truncate">
            {dataPoint.topArtists.slice(0, 3).map(a => a?.name || 'Unknown').join(', ')}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Listens:</span>{' '}
          <span className="font-medium">{dataPoint.totalListens ?? 0}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Acceptance:</span>{' '}
          <span className="font-medium">{((dataPoint.acceptanceRate ?? 0) * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Significant Change Indicator */}
      {dataPoint.isSignificantChange && dataPoint.changeDescription && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="flex items-center gap-1 text-primary">
            <Sparkles className="w-3 h-3" />
            <span className="text-xs font-medium">Milestone</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {dataPoint.changeDescription}
          </p>
        </div>
      )}
    </div>
  );
});

const TimelineControls = memo(function TimelineControls({
  granularity,
  onGranularityChange,
  dateRange,
  onDateRangeChange,
  onReset,
}: {
  granularity: TimeGranularity;
  onGranularityChange: (g: TimeGranularity) => void;
  dateRange: { start: Date; end: Date };
  onDateRangeChange: (range: { start: Date; end: Date }) => void;
  onReset: () => void;
}) {
  const shiftDateRange = useCallback((direction: 'back' | 'forward') => {
    const diff = dateRange.end.getTime() - dateRange.start.getTime();
    const shift = direction === 'back' ? -diff : diff;

    onDateRangeChange({
      start: new Date(dateRange.start.getTime() + shift),
      end: new Date(dateRange.end.getTime() + shift),
    });
  }, [dateRange, onDateRangeChange]);

  const zoomIn = useCallback(() => {
    const center = new Date((dateRange.start.getTime() + dateRange.end.getTime()) / 2);
    const halfRange = (dateRange.end.getTime() - dateRange.start.getTime()) / 4;

    onDateRangeChange({
      start: new Date(center.getTime() - halfRange),
      end: new Date(center.getTime() + halfRange),
    });
  }, [dateRange, onDateRangeChange]);

  const zoomOut = useCallback(() => {
    const center = new Date((dateRange.start.getTime() + dateRange.end.getTime()) / 2);
    const halfRange = dateRange.end.getTime() - dateRange.start.getTime();

    onDateRangeChange({
      start: new Date(center.getTime() - halfRange),
      end: new Date(center.getTime() + halfRange),
    });
  }, [dateRange, onDateRangeChange]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Granularity Selector */}
      <div className="flex rounded-md border border-input bg-background">
        {GRANULARITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onGranularityChange(option.value)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              granularity === option.value
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            } ${option.value === 'day' ? 'rounded-l-md' : ''} ${
              option.value === 'year' ? 'rounded-r-md' : ''
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" onClick={() => shiftDateRange('back')}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-xs text-muted-foreground px-2 min-w-[160px] text-center">
          {formatDateRange(dateRange.start, dateRange.end)}
        </span>
        <Button variant="outline" size="icon-sm" onClick={() => shiftDateRange('forward')}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" onClick={zoomIn} title="Zoom In">
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={zoomOut} title="Zoom Out">
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={onReset} title="Reset">
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
});

const MoodLegend = memo(function MoodLegend({
  activeMoods,
  onToggleMood,
}: {
  activeMoods: Set<keyof MoodDistribution>;
  onToggleMood: (mood: keyof MoodDistribution) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(MOOD_LABELS).map(([mood, label]) => {
        const isActive = activeMoods.has(mood as keyof MoodDistribution);
        return (
          <button
            key={mood}
            onClick={() => onToggleMood(mood as keyof MoodDistribution)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: MOOD_COLORS[mood as keyof MoodDistribution],
                opacity: isActive ? 1 : 0.4,
              }}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
});

const PeriodDetails = memo(function PeriodDetails({
  period,
  onGeneratePlaylist,
  onExportSnapshot,
}: {
  period: TimelineDataPoint | null;
  onGeneratePlaylist: () => void;
  onExportSnapshot: () => void;
}) {
  if (!period) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            Click on a point in the timeline to view details
          </p>
        </CardContent>
      </Card>
    );
  }

  // Safely get dominant mood
  const moodDistribution = period.moodDistribution || {};
  const dominantMood = Object.entries(moodDistribution).length > 0
    ? Object.entries(moodDistribution).sort(([, a], [, b]) => b - a)[0]
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{period.periodLabel}</CardTitle>
        <CardDescription>
          {period.totalListens || 0} listens • {period.totalFeedback || 0} ratings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dominant Mood */}
        {dominantMood && MOOD_COLORS[dominantMood[0] as keyof MoodDistribution] && (
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: MOOD_COLORS[dominantMood[0] as keyof MoodDistribution] }}
            />
            <span className="text-sm font-medium">
              Dominant: {MOOD_LABELS[dominantMood[0] as keyof MoodDistribution] || dominantMood[0]}
            </span>
            <span className="text-xs text-muted-foreground">
              ({(dominantMood[1] * 100).toFixed(0)}%)
            </span>
          </div>
        )}

        {/* Top Artists */}
        {period.topArtists && Array.isArray(period.topArtists) && period.topArtists.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Top Artists</p>
            <div className="flex flex-wrap gap-1">
              {period.topArtists.slice(0, 5).map((artist) => artist?.name && (
                <span
                  key={artist.name}
                  className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {artist.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Top Genres */}
        {period.topGenres && Array.isArray(period.topGenres) && period.topGenres.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Top Genres</p>
            <div className="flex flex-wrap gap-1">
              {period.topGenres.slice(0, 5).map((genre) => genre?.name && (
                <span
                  key={genre.name}
                  className="inline-flex items-center rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                >
                  {genre.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">Acceptance Rate</p>
            <p className="text-lg font-bold">{(period.acceptanceRate * 100).toFixed(0)}%</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">Diversity</p>
            <p className="text-lg font-bold">{(period.diversityScore * 100).toFixed(0)}%</p>
          </div>
        </div>

        {/* Significant Change */}
        {period.isSignificantChange && (
          <div className="rounded-lg bg-primary/10 p-3">
            <div className="flex items-center gap-1 text-primary mb-1">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">Milestone Detected</span>
            </div>
            <p className="text-xs text-muted-foreground">{period.changeDescription}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onGeneratePlaylist}
          >
            <Music className="w-4 h-4 mr-1" />
            Relive This Period
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportSnapshot}
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

const TimelineLoadingSkeleton = memo(function TimelineLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-8 w-48" />
      </div>
      <Skeleton className="h-[400px] w-full" />
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-6 w-20" />
        ))}
      </div>
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export function MoodTimeline({
  initialStartDate,
  initialEndDate,
  initialGranularity = 'week',
  onPeriodSelect,
}: MoodTimelineProps) {
  // State
  const defaultRange = getDefaultDateRange();
  const [dateRange, setDateRange] = useState({
    start: initialStartDate || defaultRange.start,
    end: initialEndDate || defaultRange.end,
  });
  const [granularity, setGranularity] = useState<TimeGranularity>(initialGranularity);
  const [activeMoods, setActiveMoods] = useState<Set<keyof MoodDistribution>>(
    new Set(Object.keys(MOOD_COLORS) as (keyof MoodDistribution)[])
  );
  const [selectedPeriod, setSelectedPeriod] = useState<TimelineDataPoint | null>(null);
  const [brushRange, setBrushRange] = useState<[number, number] | null>(null);

  // Fetch timeline data
  const { data: timeline, isLoading, error } = useQuery({
    queryKey: ['mood-timeline', dateRange.start.toISOString(), dateRange.end.toISOString(), granularity],
    queryFn: () => fetchMoodTimeline(dateRange.start, dateRange.end, granularity),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Transform data for chart
  const chartData = useMemo(() => {
    if (!timeline?.dataPoints) return [];

    return timeline.dataPoints.map((dp) => {
      const entry: any = {
        name: dp.periodLabel,
        periodStart: dp.periodStart,
        isSignificantChange: dp.isSignificantChange,
        // Include full data point for tooltip access
        periodLabel: dp.periodLabel,
        moodDistribution: dp.moodDistribution || {},
        topArtists: dp.topArtists || [],
        topGenres: dp.topGenres || [],
        topTracks: dp.topTracks || [],
        totalListens: dp.totalListens || 0,
        totalFeedback: dp.totalFeedback || 0,
        acceptanceRate: dp.acceptanceRate || 0,
        diversityScore: dp.diversityScore || 0,
        changeDescription: dp.changeDescription || '',
      };

      // Add mood values (filtered by active moods)
      if (dp.moodDistribution) {
        for (const mood of Object.keys(MOOD_COLORS) as (keyof MoodDistribution)[]) {
          if (activeMoods.has(mood)) {
            entry[mood] = (dp.moodDistribution[mood] || 0) * 100;
          }
        }
      }

      return entry;
    });
  }, [timeline, activeMoods]);

  // Handlers
  const handleToggleMood = useCallback((mood: keyof MoodDistribution) => {
    setActiveMoods((prev) => {
      const next = new Set(prev);
      if (next.has(mood)) {
        next.delete(mood);
      } else {
        next.add(mood);
      }
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    const defaultRange = getDefaultDateRange();
    setDateRange(defaultRange);
    setGranularity('week');
    setActiveMoods(new Set(Object.keys(MOOD_COLORS) as (keyof MoodDistribution)[]));
    setSelectedPeriod(null);
    setBrushRange(null);
  }, []);

  const handleChartClick = useCallback((data: any) => {
    if (data?.activePayload?.[0]?.payload) {
      const periodStart = data.activePayload[0].payload.periodStart;
      const period = timeline?.dataPoints.find((dp) => dp.periodStart === periodStart);
      if (period) {
        setSelectedPeriod(period);
        onPeriodSelect?.(period);
      }
    }
  }, [timeline, onPeriodSelect]);

  const handleGeneratePlaylist = useCallback(async () => {
    if (!selectedPeriod) return;

    try {
      const response = await fetch('/api/recommendations/mood-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'regenerate-playlist',
          periodStart: selectedPeriod.periodStart,
          periodEnd: selectedPeriod.periodEnd,
          blendRatio: 100,
          maxTracks: 25,
        }),
      });

      if (response.ok) {
        const playlist = await response.json();
        // Could show a toast or open a modal here
        console.log('Generated playlist:', playlist);
      }
    } catch (error) {
      console.error('Failed to generate playlist:', error);
    }
  }, [selectedPeriod]);

  const handleExportSnapshot = useCallback(async () => {
    if (!selectedPeriod) return;

    try {
      // First create the snapshot
      const createResponse = await fetch('/api/recommendations/mood-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-snapshot',
          name: `${selectedPeriod.periodLabel} Snapshot`,
          periodStart: selectedPeriod.periodStart,
          periodEnd: selectedPeriod.periodEnd,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Failed to create snapshot:', errorData);
        alert(`Failed to create snapshot: ${errorData.message || 'Please try again.'}`);
        return;
      }

      const snapshot = await createResponse.json();

      // Then export it
      const exportResponse = await fetch('/api/recommendations/mood-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'export-snapshot',
          snapshotId: snapshot.id,
          format: 'json',
        }),
      });

      if (!exportResponse.ok) {
        const errorData = await exportResponse.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Failed to export snapshot:', errorData);
        alert(`Failed to export snapshot: ${errorData.message || 'Please try again.'}`);
        return;
      }

      const blob = await exportResponse.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `taste-snapshot-${selectedPeriod.periodLabel.replace(/\s+/g, '-').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Optional: Show success message
      console.log('Snapshot exported successfully');
    } catch (error) {
      console.error('Failed to export snapshot:', error);
      alert(`An error occurred while exporting the snapshot. Please try again.`);
    }
  }, [selectedPeriod]);

  // Handle brush change for zooming
  const handleBrushChange = useCallback((range: { startIndex?: number; endIndex?: number }) => {
    if (range.startIndex !== undefined && range.endIndex !== undefined) {
      setBrushRange([range.startIndex, range.endIndex]);
    }
  }, []);

  // Loading state
  if (isLoading) {
    return <TimelineLoadingSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Timeline Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load timeline data. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!timeline?.dataPoints?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Timeline Data</CardTitle>
          <CardDescription>
            Start rating songs to build your mood timeline!
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <TrendingUp className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Your mood timeline will show how your music taste evolves over time.
            Rate more songs using thumbs up/down to start building your timeline.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Mood Timeline</h3>
          <p className="text-sm text-muted-foreground">
            Visualize your music taste evolution over time
          </p>
        </div>
        <TimelineControls
          granularity={granularity}
          onGranularityChange={setGranularity}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
        />
      </div>

      {/* Main Chart */}
      <Card>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart
              data={chartData}
              onClick={handleChartClick}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <defs>
                {Object.entries(MOOD_COLORS).map(([mood, color]) => (
                  <linearGradient key={mood} id={`gradient-${mood}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip content={<MoodTimelineTooltip />} />

              {/* Stacked Areas for each mood */}
              {(Object.keys(MOOD_COLORS) as (keyof MoodDistribution)[])
                .filter((mood) => activeMoods.has(mood))
                .map((mood) => (
                  <Area
                    key={mood}
                    type="monotone"
                    dataKey={mood}
                    stackId="1"
                    stroke={MOOD_COLORS[mood]}
                    fill={`url(#gradient-${mood})`}
                    name={MOOD_LABELS[mood]}
                  />
                ))}

              {/* Reference lines for significant changes */}
              {chartData
                .filter((dp) => dp.isSignificantChange)
                .map((dp, i) => (
                  <ReferenceLine
                    key={`milestone-${i}`}
                    x={dp.name as string}
                    stroke="#f59e0b"
                    strokeDasharray="3 3"
                    label={{
                      value: '✨',
                      position: 'top',
                      fill: '#f59e0b',
                    }}
                  />
                ))}

              {/* Brush for zooming */}
              <Brush
                dataKey="name"
                height={30}
                stroke="#8b5cf6"
                fill="hsl(var(--muted))"
                onChange={handleBrushChange}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Mood Legend */}
      <MoodLegend activeMoods={activeMoods} onToggleMood={handleToggleMood} />

      {/* Period Details Panel */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Summary Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total Periods</p>
                  <p className="text-xl font-bold">{timeline.totalPeriods}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Milestones</p>
                  <p className="text-xl font-bold">
                    {timeline.dataPoints.filter((dp) => dp.isSignificantChange).length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Acceptance</p>
                  <p className="text-xl font-bold">
                    {(
                      (timeline.dataPoints.reduce((sum, dp) => sum + dp.acceptanceRate, 0) /
                        timeline.dataPoints.length) *
                      100
                    ).toFixed(0)}
                    %
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Diversity</p>
                  <p className="text-xl font-bold">
                    {(
                      (timeline.dataPoints.reduce((sum, dp) => sum + dp.diversityScore, 0) /
                        timeline.dataPoints.length) *
                      100
                    ).toFixed(0)}
                    %
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <PeriodDetails
          period={selectedPeriod}
          onGeneratePlaylist={handleGeneratePlaylist}
          onExportSnapshot={handleExportSnapshot}
        />
      </div>
    </div>
  );
}

export default MoodTimeline;
