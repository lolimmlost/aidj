/**
 * PreferenceInsights Component
 * Displays user preference analytics and listening patterns
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';

interface AnalyticsData {
  // Enhanced response structure
  profile: {
    likedArtists: Array<{ artist: string; count: number }>;
    dislikedArtists: Array<{ artist: string; count: number }>;
    feedbackCount: {
      total: number;
      thumbsUp: number;
      thumbsDown: number;
    };
  };
  activity?: {
    listeningPatternInsights: string[];
  };
}

async function fetchAnalytics(): Promise<AnalyticsData> {
  const response = await fetch('/api/recommendations/analytics?metrics=quality,activity');
  if (!response.ok) {
    throw new Error('Failed to fetch analytics');
  }
  return response.json();
}

export function PreferenceInsights() {
  const [expanded, setExpanded] = useState(false);

  const { data: analytics, isLoading, error } = useQuery({
    queryKey: ['preference-analytics'],
    queryFn: fetchAnalytics,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Taste Profile</CardTitle>
          <CardDescription>Understanding your music preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Taste Profile</CardTitle>
          <CardDescription>Unable to load analytics</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Failed to load preference data'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return null;
  }

  const { profile, activity } = analytics;
  const { feedbackCount, likedArtists, dislikedArtists } = profile;
  const hasData = feedbackCount.total > 0;
  const hasEnoughData = hasData && feedbackCount.total >= 5;
  const insights = activity?.listeningPatternInsights || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Your Taste Profile</CardTitle>
            <CardDescription>
              {hasData
                ? `Based on ${feedbackCount.total} ${feedbackCount.total === 1 ? 'song' : 'songs'} you've rated`
                : 'Start rating songs to see your preferences'}
            </CardDescription>
          </div>
          {hasData && hasEnoughData && (
            <Link to="/dashboard/analytics">
              <Button variant="outline" size="sm" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Full Analytics
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Feedback Summary */}
        {hasData && (
          <div className="flex items-center justify-between p-4 bg-secondary/20 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {feedbackCount.thumbsUp}
                </div>
                <div className="text-xs text-muted-foreground">Liked</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {feedbackCount.thumbsDown}
                </div>
                <div className="text-xs text-muted-foreground">Disliked</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">
                {Math.round((feedbackCount.thumbsUp / feedbackCount.total) * 100)}% positive
              </div>
              <div className="text-xs text-muted-foreground">
                {feedbackCount.total} total
              </div>
            </div>
          </div>
        )}

        {/* Insights */}
        {insights.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Insights</h4>
            <ul className="space-y-1">
              {insights.map((insight: string) => (
                <li key={insight} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Expandable Artist Lists */}
        {hasData && hasEnoughData && (
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="w-full justify-between"
            >
              <span className="text-sm font-medium">
                {expanded ? 'Hide' : 'View'} Artist Preferences
              </span>
              <span className="text-xs text-muted-foreground">
                {expanded ? '▲' : '▼'}
              </span>
            </Button>

            {expanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Liked Artists */}
                {likedArtists.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-green-600 dark:text-green-400">
                      Top Liked Artists
                    </h4>
                    <ul className="space-y-1">
                      {likedArtists.slice(0, 5).map((item: { artist: string; count: number }) => (
                        <li
                          key={item.artist}
                          className="text-sm text-muted-foreground flex items-center justify-between"
                        >
                          <span className="truncate">{item.artist}</span>
                          <span className="text-xs bg-secondary px-2 py-0.5 rounded-full ml-2">
                            {item.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Disliked Artists */}
                {dislikedArtists.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-red-600 dark:text-red-400">
                      Artists to Avoid
                    </h4>
                    <ul className="space-y-1">
                      {dislikedArtists.slice(0, 5).map((item: { artist: string; count: number }) => (
                        <li
                          key={item.artist}
                          className="text-sm text-muted-foreground flex items-center justify-between"
                        >
                          <span className="truncate">{item.artist}</span>
                          <span className="text-xs bg-secondary px-2 py-0.5 rounded-full ml-2">
                            {item.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!hasData && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">
              Rate some songs to build your taste profile and get personalized recommendations!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
