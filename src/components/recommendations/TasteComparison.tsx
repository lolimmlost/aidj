/**
 * Taste Comparison Component
 *
 * Displays side-by-side comparison of taste profiles from different time periods.
 *
 * Story: Mood Timeline Visualization with Historical Music Preference Tracking
 */

import { useState, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { ArrowRight, TrendingUp, TrendingDown, Minus, Users, Music } from 'lucide-react';

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

interface TasteComparisonData {
  past: {
    periodLabel: string;
    topArtists: string[];
    topGenres: string[];
    moodDistribution: MoodDistribution;
    acceptanceRate: number;
  };
  current: {
    periodLabel: string;
    topArtists: string[];
    topGenres: string[];
    moodDistribution: MoodDistribution;
    acceptanceRate: number;
  };
  changes: {
    newArtists: string[];
    droppedArtists: string[];
    newGenres: string[];
    droppedGenres: string[];
    moodShift: string;
    acceptanceRateChange: number;
  };
}

interface TasteComparisonProps {
  pastPeriod?: { start: Date; end: Date };
  currentPeriod?: { start: Date; end: Date };
}

// ============================================================================
// Constants
// ============================================================================

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

// ============================================================================
// API Functions
// ============================================================================

async function fetchTasteComparison(
  pastPeriod: { start: Date; end: Date },
  currentPeriod: { start: Date; end: Date }
): Promise<TasteComparisonData> {
  const response = await fetch('/api/recommendations/mood-timeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'compare-profiles',
      pastStartDate: pastPeriod.start.toISOString(),
      pastEndDate: pastPeriod.end.toISOString(),
      currentStartDate: currentPeriod.start.toISOString(),
      currentEndDate: currentPeriod.end.toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch taste comparison');
  }

  return response.json();
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDefaultPeriods(): { past: { start: Date; end: Date }; current: { start: Date; end: Date } } {
  const now = new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  return {
    past: { start: sixMonthsAgo, end: threeMonthsAgo },
    current: { start: threeMonthsAgo, end: now },
  };
}

// ============================================================================
// Subcomponents
// ============================================================================

const MoodRadarChart = memo(function MoodRadarChart({
  past,
  current,
}: {
  past: MoodDistribution;
  current: MoodDistribution;
}) {
  const chartData = useMemo(() => {
    return (Object.keys(MOOD_LABELS) as (keyof MoodDistribution)[]).map((mood) => ({
      mood: MOOD_LABELS[mood],
      past: Math.round(past[mood] * 100),
      current: Math.round(current[mood] * 100),
    }));
  }, [past, current]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={chartData}>
        <PolarGrid />
        <PolarAngleAxis dataKey="mood" tick={{ fontSize: 11 }} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Radar
          name="Past"
          dataKey="past"
          stroke="#8b5cf6"
          fill="#8b5cf6"
          fillOpacity={0.3}
        />
        <Radar
          name="Current"
          dataKey="current"
          stroke="#10b981"
          fill="#10b981"
          fillOpacity={0.3}
        />
        <Legend />
      </RadarChart>
    </ResponsiveContainer>
  );
});

const ChangeIndicator = memo(function ChangeIndicator({
  change,
  isPercentage = false,
}: {
  change: number;
  isPercentage?: boolean;
}) {
  const absChange = Math.abs(change);
  const formatted = isPercentage ? `${(absChange * 100).toFixed(1)}%` : absChange.toString();

  if (change > 0.01) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-500">
        <TrendingUp className="w-4 h-4" />
        +{formatted}
      </span>
    );
  } else if (change < -0.01) {
    return (
      <span className="inline-flex items-center gap-1 text-red-500">
        <TrendingDown className="w-4 h-4" />
        -{formatted}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Minus className="w-4 h-4" />
      No change
    </span>
  );
});

const ArtistChanges = memo(function ArtistChanges({
  newArtists,
  droppedArtists,
}: {
  newArtists: string[];
  droppedArtists: string[];
}) {
  return (
    <div className="space-y-3">
      {newArtists.length > 0 && (
        <div>
          <p className="text-xs font-medium text-emerald-500 mb-1">New Favorites</p>
          <div className="flex flex-wrap gap-1">
            {newArtists.slice(0, 5).map((artist) => (
              <span
                key={artist}
                className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600"
              >
                {artist}
              </span>
            ))}
            {newArtists.length > 5 && (
              <span className="text-xs text-muted-foreground">
                +{newArtists.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {droppedArtists.length > 0 && (
        <div>
          <p className="text-xs font-medium text-red-500 mb-1">Moved On From</p>
          <div className="flex flex-wrap gap-1">
            {droppedArtists.slice(0, 5).map((artist) => (
              <span
                key={artist}
                className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600"
              >
                {artist}
              </span>
            ))}
            {droppedArtists.length > 5 && (
              <span className="text-xs text-muted-foreground">
                +{droppedArtists.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {newArtists.length === 0 && droppedArtists.length === 0 && (
        <p className="text-sm text-muted-foreground">No significant artist changes</p>
      )}
    </div>
  );
});

const TasteComparisonSkeleton = memo(function TasteComparisonSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[200px]" />
      </div>
      <Skeleton className="h-[300px]" />
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export function TasteComparison({ pastPeriod, currentPeriod }: TasteComparisonProps) {
  const defaultPeriods = getDefaultPeriods();
  const [periods, setPeriods] = useState({
    past: pastPeriod || defaultPeriods.past,
    current: currentPeriod || defaultPeriods.current,
  });

  const { data: comparison, isLoading, error } = useQuery({
    queryKey: [
      'taste-comparison',
      periods.past.start.toISOString(),
      periods.past.end.toISOString(),
      periods.current.start.toISOString(),
      periods.current.end.toISOString(),
    ],
    queryFn: () => fetchTasteComparison(periods.past, periods.current),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <TasteComparisonSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparison Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load taste comparison. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!comparison) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Taste Evolution</h3>
        <p className="text-sm text-muted-foreground">
          Compare how your music preferences have changed
        </p>
      </div>

      {/* Period Labels */}
      <div className="flex items-center justify-center gap-4 py-2">
        <div className="text-center">
          <p className="text-sm font-medium text-violet-500">Past</p>
          <p className="text-xs text-muted-foreground">{comparison.past.periodLabel}</p>
        </div>
        <ArrowRight className="w-5 h-5 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium text-emerald-500">Current</p>
          <p className="text-xs text-muted-foreground">{comparison.current.periodLabel}</p>
        </div>
      </div>

      {/* Side by Side Comparison */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Past Profile */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-violet-500" />
              Past Profile
            </CardTitle>
            <CardDescription>{comparison.past.periodLabel}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                <Users className="w-3 h-3 inline mr-1" />
                Top Artists
              </p>
              <div className="flex flex-wrap gap-1">
                {comparison.past.topArtists.slice(0, 5).map((artist) => (
                  <span
                    key={artist}
                    className="inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-600"
                  >
                    {artist}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                <Music className="w-3 h-3 inline mr-1" />
                Top Genres
              </p>
              <div className="flex flex-wrap gap-1">
                {comparison.past.topGenres.slice(0, 5).map((genre) => (
                  <span
                    key={genre}
                    className="inline-flex items-center rounded-full bg-secondary/50 px-2 py-0.5 text-xs font-medium"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs text-muted-foreground">Acceptance Rate</p>
              <p className="text-xl font-bold">
                {(comparison.past.acceptanceRate * 100).toFixed(0)}%
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Current Profile */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              Current Profile
            </CardTitle>
            <CardDescription>{comparison.current.periodLabel}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                <Users className="w-3 h-3 inline mr-1" />
                Top Artists
              </p>
              <div className="flex flex-wrap gap-1">
                {comparison.current.topArtists.slice(0, 5).map((artist) => (
                  <span
                    key={artist}
                    className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600"
                  >
                    {artist}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                <Music className="w-3 h-3 inline mr-1" />
                Top Genres
              </p>
              <div className="flex flex-wrap gap-1">
                {comparison.current.topGenres.slice(0, 5).map((genre) => (
                  <span
                    key={genre}
                    className="inline-flex items-center rounded-full bg-secondary/50 px-2 py-0.5 text-xs font-medium"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs text-muted-foreground">Acceptance Rate</p>
              <p className="text-xl font-bold">
                {(comparison.current.acceptanceRate * 100).toFixed(0)}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mood Radar Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mood Profile Comparison</CardTitle>
          <CardDescription>
            How your mood preferences have shifted
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MoodRadarChart
            past={comparison.past.moodDistribution}
            current={comparison.current.moodDistribution}
          />
        </CardContent>
      </Card>

      {/* Changes Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What's Changed</CardTitle>
          <CardDescription>Key differences between periods</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Acceptance Rate Change */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Acceptance Rate</span>
            <ChangeIndicator
              change={comparison.changes.acceptanceRateChange}
              isPercentage
            />
          </div>

          {/* Mood Shift */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Mood Trend</span>
            <span className="text-sm font-medium">{comparison.changes.moodShift}</span>
          </div>

          {/* Artist Changes */}
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-2">Artist Changes</p>
            <ArtistChanges
              newArtists={comparison.changes.newArtists}
              droppedArtists={comparison.changes.droppedArtists}
            />
          </div>

          {/* Genre Changes */}
          {(comparison.changes.newGenres.length > 0 ||
            comparison.changes.droppedGenres.length > 0) && (
            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-2">Genre Changes</p>
              <div className="space-y-2">
                {comparison.changes.newGenres.length > 0 && (
                  <div>
                    <p className="text-xs text-emerald-500">Exploring: </p>
                    <span className="text-xs">
                      {comparison.changes.newGenres.join(', ')}
                    </span>
                  </div>
                )}
                {comparison.changes.droppedGenres.length > 0 && (
                  <div>
                    <p className="text-xs text-red-500">Less of: </p>
                    <span className="text-xs">
                      {comparison.changes.droppedGenres.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default TasteComparison;
