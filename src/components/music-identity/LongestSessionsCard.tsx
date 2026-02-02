/**
 * Longest Listening Sessions Card
 *
 * Shows the user's longest continuous listening sessions.
 * Inspired by Your Spotify's session detection.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 1.5
 */

import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Timer, Music } from 'lucide-react';

interface LongestSessionsCardProps {
  preset?: 'week' | 'month' | 'year';
  from?: string;
  to?: string;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const LongestSessionsCard = memo(function LongestSessionsCard({
  preset = 'month',
  from,
  to,
}: LongestSessionsCardProps) {
  const { data, isLoading, error } = useQuery<{
    success: boolean;
    sessions: Array<{
      startTime: string;
      endTime: string;
      durationMinutes: number;
      songCount: number;
    }>;
  }>({
    queryKey: ['longest-sessions', from || preset, to],
    queryFn: async () => {
      const params = from && to
        ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=5`
        : `preset=${preset}&limit=5`;
      const res = await fetch(`/api/listening-history/sessions?${params}`);
      if (!res.ok) throw new Error('Failed to fetch sessions');
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.sessions?.length) {
    return null;
  }

  const sessions = data.sessions;
  const longest = sessions[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          Longest Sessions
        </CardTitle>
        <CardDescription>
          Your record: <strong>{formatDuration(longest.durationMinutes)}</strong> with {longest.songCount} songs
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sessions.map((session, i) => (
            <div
              key={session.startTime}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatDuration(session.durationMinutes)}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Music className="h-3 w-3" />
                    {session.songCount} songs
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {formatDate(session.startTime)} &middot; {formatTime(session.startTime)} - {formatTime(session.endTime)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

export default LongestSessionsCard;
