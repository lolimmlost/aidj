/**
 * Listening History Page
 *
 * Shows full (non-deduplicated) listening history so users can see
 * what's been playing and spot repeats in shuffle.
 */

import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@/components/ui/page-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Clock, Music, SkipForward, CheckCircle2, Repeat, Loader2 } from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

export const Route = createFileRoute('/dashboard/history')({
  component: HistoryPage,
});

type TimePeriod = 'today' | '7days' | '30days';

interface HistoryEntry {
  id: string;
  songId: string;
  artist: string;
  title: string;
  album: string | null;
  genre: string | null;
  playedAt: string;
  playDuration: number | null;
  songDuration: number | null;
  completed: boolean;
  skipDetected: boolean;
}

interface FirstPageResponse {
  history: HistoryEntry[];
  summary: {
    totalPlays: number;
    uniqueSongs: number;
    repeatCount: number;
  };
  songPlayCounts: Record<string, number>;
  hasMore: boolean;
  nextCursor: string | null;
}

interface NextPageResponse {
  history: HistoryEntry[];
  hasMore: boolean;
  nextCursor: string | null;
}

const PERIOD_DAYS: Record<TimePeriod, number> = {
  today: 1,
  '7days': 7,
  '30days': 30,
};

const PERIOD_LABELS: Record<TimePeriod, string> = {
  today: 'Today',
  '7days': '7 Days',
  '30days': '30 Days',
};

const PAGE_SIZE = 50;

function HistoryPage() {
  const [period, setPeriod] = useState<TimePeriod>('7days');
  // Accumulated history entries and pagination state
  const [extraHistory, setExtraHistory] = useState<HistoryEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Reset accumulated pages when period changes
  const handlePeriodChange = (newPeriod: TimePeriod) => {
    setPeriod(newPeriod);
    setExtraHistory([]);
    nextCursorRef.current = null;
    setHasMore(false);
  };

  // First page query (includes summary + songPlayCounts)
  const { data, isLoading } = useQuery<FirstPageResponse>({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps -- nextCursorRef is a ref, not reactive state
    queryKey: ['listening-history', 'full', period],
    queryFn: async () => {
      const res = await fetch(
        `/api/listening-history/full?limit=${PAGE_SIZE}&days=${PERIOD_DAYS[period]}`
      );
      if (!res.ok) throw new Error('Failed to fetch history');
      const json = await res.json();
      // Initialize cursor state from first page
      nextCursorRef.current = json.nextCursor;
      setHasMore(json.hasMore);
      setExtraHistory([]);
      return json;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const loadMore = useCallback(async () => {
    if (!nextCursorRef.current || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(
        `/api/listening-history/full?limit=${PAGE_SIZE}&days=${PERIOD_DAYS[period]}&before=${encodeURIComponent(nextCursorRef.current)}`
      );
      if (!res.ok) throw new Error('Failed to fetch more history');
      const json: NextPageResponse = await res.json();
      setExtraHistory(prev => [...prev, ...json.history]);
      nextCursorRef.current = json.nextCursor;
      setHasMore(json.hasMore);
    } finally {
      setIsLoadingMore(false);
    }
  }, [period, isLoadingMore]);

  const songPlayCounts = data?.songPlayCounts ?? {};
  const summary = data?.summary;
  const history = [...(data?.history ?? []), ...extraHistory];
  const showLoadMore = hasMore;

  return (
    <PageLayout
      title="Listening History"
      description="See everything you've played"
      icon={<Clock className="h-5 w-5" />}
      backLink="/dashboard"
      backLabel="Dashboard"
      actions={
        <div className="flex gap-1 rounded-lg border p-1 bg-muted/30">
          {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md transition-colors font-medium',
                period === p
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      }
    >
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl sm:text-3xl font-bold">{summary.totalPlays}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Total Plays</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl sm:text-3xl font-bold">{summary.uniqueSongs}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Unique Songs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl sm:text-3xl font-bold">{summary.repeatCount}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Repeated Songs</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
              <div className="w-8 h-8 rounded bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3.5 bg-muted rounded w-2/3" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </div>
              <div className="h-3 bg-muted rounded w-16" />
            </div>
          ))}
        </div>
      ) : history.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Music className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No plays recorded in this period</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {history.map((entry) => {
              const songRepeatCount = songPlayCounts[entry.songId] || 0;
              const isRepeated = songRepeatCount >= 2;

              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
                >
                  {/* Album art thumbnail */}
                  <CoverArtThumb songId={entry.songId} />

                  {/* Song info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{entry.title}</p>
                      {isRepeated && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          <Repeat className="h-3 w-3" />
                          {songRepeatCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{entry.artist}</p>
                  </div>

                  {/* Status badge */}
                  <div className="flex-shrink-0">
                    {entry.skipDetected ? (
                      <span className="flex items-center gap-1 text-xs text-orange-500 bg-orange-500/10 px-2 py-1 rounded-full">
                        <SkipForward className="h-3 w-3" />
                        Skip
                      </span>
                    ) : entry.completed ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                        <CheckCircle2 className="h-3 w-3" />
                        Done
                      </span>
                    ) : null}
                  </div>

                  {/* Relative time */}
                  <span className="text-xs text-muted-foreground flex-shrink-0 w-20 text-right">
                    {formatRelativeTime(entry.playedAt)}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Load more */}
      {showLoadMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      )}
    </PageLayout>
  );
}

/** Small cover art thumbnail using getCoverArt with songId */
function CoverArtThumb({ songId }: { songId: string }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="w-8 h-8 rounded bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
        <Music className="h-3.5 w-3.5 text-primary/50" />
      </div>
    );
  }

  return (
    <img
      src={`/api/navidrome/rest/getCoverArt?id=${songId}&size=64`}
      alt=""
      className="w-8 h-8 rounded object-cover flex-shrink-0"
      onError={() => setError(true)}
      loading="lazy"
    />
  );
}

/** Format a date string as relative time (e.g. "3m ago", "2h ago", "1d ago") */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString();
}
