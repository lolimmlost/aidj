/**
 * Music Identity Share Page
 *
 * Public page for viewing shared music identity summaries
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Music,
  Sparkles,
  TrendingUp,
  Users,
  Clock,
  Calendar,
  Home,
  Heart,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface SharedSummary {
  id: string;
  periodType: 'month' | 'year';
  year: number;
  month: number | null;
  title: string;
  aiInsights: {
    narrative: string;
    highlights: string[];
    musicPersonality: {
      type: string;
      description: string;
      traits: string[];
    };
    funFacts: string[];
  };
  moodProfile: {
    dominantMoods: Array<{
      mood: string;
      percentage: number;
    }>;
    emotionalRange: string;
  };
  topArtists: Array<{ name: string; count: number; percentage: number }>;
  topTracks: Array<{ name: string; count: number; percentage: number }>;
  stats: {
    totalListens: number;
    totalMinutesListened: number;
    uniqueArtists: number;
    uniqueTracks: number;
  };
  cardTheme: string;
  generatedAt: string;
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchSharedSummary(token: string): Promise<SharedSummary> {
  const response = await fetch(`/api/music-identity/share/${token}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to load shared summary');
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
// Route
// ============================================================================

export const Route = createFileRoute("/music-identity/share/$token")({
  component: SharePage,
});

function SharePage() {
  const { token } = Route.useParams();

  const { data: summary, isLoading, error } = useQuery({
    queryKey: queryKeys.musicIdentity.shared(token),
    queryFn: () => fetchSharedSummary(token),
    staleTime: 60 * 1000, // 1 minute
    retry: 1,
  });

  if (isLoading) {
    return <SharePageSkeleton />;
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error
                ? error.message
                : 'This music identity is not available or has been made private.'}
            </p>
            <Link to="/">
              <Button>
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const periodLabel = summary.month
    ? `${getMonthName(summary.month)} ${summary.year}`
    : `${summary.year}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500/5 to-pink-500/5">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Music Identity
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
            {summary.title}
          </h1>
          <p className="text-muted-foreground flex items-center justify-center gap-2">
            <Calendar className="h-4 w-4" />
            {periodLabel}
          </p>
        </div>

        {/* Personality Card */}
        <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20 mb-8">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="inline-flex p-4 bg-purple-500/20 rounded-2xl mb-4">
                <Sparkles className="h-8 w-8 text-purple-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">
                {summary.aiInsights.musicPersonality.type}
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto mb-4">
                {summary.aiInsights.musicPersonality.description}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {summary.aiInsights.musicPersonality.traits.map((trait) => (
                  <span
                    key={trait}
                    className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 text-sm font-medium"
                  >
                    {trait}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6 text-center">
              <Music className="h-6 w-6 mx-auto mb-2 text-purple-600" />
              <div className="text-2xl font-bold">{summary.stats.totalListens.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Total Plays</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Clock className="h-6 w-6 mx-auto mb-2 text-pink-600" />
              <div className="text-2xl font-bold">{Math.round(summary.stats.totalMinutesListened / 60)}h</div>
              <div className="text-sm text-muted-foreground">Listened</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Users className="h-6 w-6 mx-auto mb-2 text-blue-600" />
              <div className="text-2xl font-bold">{summary.stats.uniqueArtists}</div>
              <div className="text-sm text-muted-foreground">Artists</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <TrendingUp className="h-6 w-6 mx-auto mb-2 text-green-600" />
              <div className="text-2xl font-bold">{summary.stats.uniqueTracks}</div>
              <div className="text-sm text-muted-foreground">Tracks</div>
            </CardContent>
          </Card>
        </div>

        {/* Narrative */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <p className="text-lg leading-relaxed">{summary.aiInsights.narrative}</p>
          </CardContent>
        </Card>

        {/* Top Artists & Tracks */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-pink-600" />
                Top Artists
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {summary.topArtists.slice(0, 5).map((artist, i) => (
                  <div key={artist.name} className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      i === 0 ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300' :
                      i === 1 ? 'bg-gray-400/20 text-gray-700 dark:text-gray-300' :
                      i === 2 ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300' :
                      'bg-muted'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium">{artist.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {artist.count} plays
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5 text-purple-600" />
                Top Tracks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {summary.topTracks.slice(0, 5).map((track, i) => (
                  <div key={track.name} className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      i === 0 ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300' :
                      i === 1 ? 'bg-gray-400/20 text-gray-700 dark:text-gray-300' :
                      i === 2 ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300' :
                      'bg-muted'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
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

        {/* Highlights */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Highlights</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {summary.aiInsights.highlights.map((highlight, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600 mt-1 shrink-0" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Fun Facts */}
        <Card className="mb-8">
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

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p className="mb-4">
            Generated with AI DJ on {new Date(summary.generatedAt).toLocaleDateString()}
          </p>
          <Link to="/">
            <Button variant="outline">
              <Sparkles className="mr-2 h-4 w-4" />
              Create Your Own Music Identity
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function SharePageSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500/5 to-pink-500/5">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <Skeleton className="h-8 w-32 mx-auto mb-4" />
          <Skeleton className="h-12 w-64 mx-auto mb-2" />
          <Skeleton className="h-5 w-40 mx-auto" />
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6 text-center">
            <Skeleton className="h-16 w-16 rounded-2xl mx-auto mb-4" />
            <Skeleton className="h-8 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-full max-w-md mx-auto mb-4" />
            <div className="flex justify-center gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6 text-center">
                <Skeleton className="h-6 w-6 mx-auto mb-2" />
                <Skeleton className="h-8 w-16 mx-auto mb-1" />
                <Skeleton className="h-4 w-20 mx-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SharePage;
