/**
 * Seasonal Insights Widget
 * Story 3.11: Task 4 - Display seasonal listening patterns
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { getSeasonDisplay, getMonthName, type Season } from '../../lib/utils/temporal';
import { Calendar, Music, TrendingUp, Sparkles } from 'lucide-react';

interface SeasonalPattern {
  season: Season;
  month?: number;
  preferredArtists: string[];
  thumbsUpCount: number;
  totalFeedback: number;
  confidence: number;
  averageRating: number;
}

interface SeasonalInsightsData {
  userId: string;
  patterns: SeasonalPattern[];
  lastUpdated: Date;
}

export function SeasonalInsights() {
  const [insights, setInsights] = useState<SeasonalInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInsights();
  }, []);

  async function loadInsights() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/recommendations/seasonal-insights');
      if (!response.ok) {
        if (response.status === 404) {
          // No seasonal patterns yet
          setInsights(null);
          return;
        }
        throw new Error('Failed to load seasonal insights');
      }

      const data = await response.json();
      setInsights(data);
    } catch (err) {
      console.error('Failed to load seasonal insights:', err);
      setError(err instanceof Error ? err.message : 'Failed to load seasonal insights');
    } finally {
      setLoading(false);
    }
  }

  async function handleReliveLastYear(season: Season, month?: number) {
    try {
      const response = await fetch('/api/recommendations/seasonal-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season, month }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate seasonal playlist');
      }

      const data = await response.json();
      alert(`🎵 Generated "${data.playlistName}" with ${data.songCount} songs!`);
    } catch (err) {
      console.error('Failed to generate seasonal playlist:', err);
      alert('Failed to generate seasonal playlist. Please try again.');
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Seasonal Insights
          </CardTitle>
          <CardDescription>Your listening patterns throughout the year</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Seasonal Insights
          </CardTitle>
          <CardDescription>Your listening patterns throughout the year</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!insights || insights.patterns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Seasonal Insights
          </CardTitle>
          <CardDescription>Your listening patterns throughout the year</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Not enough data yet. Keep rating songs to discover your seasonal listening patterns!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Seasonal Insights
        </CardTitle>
        <CardDescription>
          Your listening patterns throughout the year
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {insights.patterns.map((pattern) => (
          <div
            key={pattern.month || pattern.season}
            className="border rounded-lg p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  {pattern.month ? getMonthName(pattern.month) : getSeasonDisplay(pattern.season)}
                  {pattern.confidence >= 0.8 && (
                    <Sparkles className="w-4 h-4 text-yellow-500" />
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {pattern.totalFeedback} songs rated • {(pattern.averageRating * 100).toFixed(0)}% liked
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Confidence</div>
                <div className="text-sm font-medium">
                  {(pattern.confidence * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {pattern.preferredArtists.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-sm font-medium mb-1">
                  <Music className="w-4 h-4" />
                  Top Artists
                </div>
                <div className="flex flex-wrap gap-2">
                  {pattern.preferredArtists.slice(0, 5).map((artist) => (
                    <span
                      key={artist}
                      className="inline-flex items-center px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs"
                    >
                      {artist}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => handleReliveLastYear(pattern.season, pattern.month)}
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Relive {pattern.month ? `Last ${getMonthName(pattern.month)}` : `Last ${pattern.season}`}
            </Button>
          </div>
        ))}

        <div className="text-xs text-muted-foreground text-center">
          Last updated: {new Date(insights.lastUpdated).toLocaleDateString()}
        </div>
      </CardContent>
    </Card>
  );
}
