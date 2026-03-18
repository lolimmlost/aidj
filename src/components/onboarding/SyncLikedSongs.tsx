import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Heart, Check, Loader2, SkipForward } from 'lucide-react';

interface SyncLikedSongsProps {
  onComplete: () => void;
}

export function SyncLikedSongs({ onComplete }: SyncLikedSongsProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ count: number } | null>(null);

  // Pre-fetch starred count
  const { data: starredData, isLoading: isLoadingCount } = useQuery<{ count: number }>({
    queryKey: ['onboarding-starred-count'],
    queryFn: async () => {
      const res = await fetch('/api/onboarding/starred-count', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch starred count');
      const json = await res.json();
      return json.data;
    },
    staleTime: 60_000,
  });

  const starredCount = starredData?.count ?? 0;

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/playlists/liked-songs/sync', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Sync failed');
      const json = await res.json();
      const count = json.data?.songCount ?? 0;
      setSyncResult({ count });

      // Update onboarding status
      await fetch('/api/onboarding/update-step', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ likedSongsSynced: true, currentStep: 3 }),
      });
    } catch (err) {
      console.error('Failed to sync liked songs:', err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const handleSkip = useCallback(async () => {
    try {
      await fetch('/api/onboarding/update-step', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentStep: 3 }),
      });
      onComplete();
    } catch (err) {
      console.error('Failed to skip step:', err);
    }
  }, [onComplete]);

  const handleContinue = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return (
    <Card className="space-y-6 p-6">
      <div>
        <h2 className="text-xl font-semibold">Sync Liked Songs</h2>
        <p className="text-sm text-muted-foreground">
          Import your starred songs from Navidrome to improve recommendations.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Heart className="h-8 w-8 text-primary" />
        </div>

        {isLoadingCount ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : syncResult ? (
          <div className="flex items-center gap-2 text-lg font-medium text-primary">
            <Check className="h-5 w-5" />
            Synced {syncResult.count} liked songs
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {starredCount > 0
              ? `You have ${starredCount} starred songs available to sync.`
              : 'No starred songs found in Navidrome.'}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={handleSkip}
          className="text-muted-foreground"
        >
          <SkipForward className="mr-1 h-4 w-4" />
          Skip
        </Button>

        {syncResult ? (
          <Button onClick={handleContinue}>Continue</Button>
        ) : (
          <Button
            onClick={handleSync}
            disabled={isSyncing || starredCount === 0}
          >
            {isSyncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        )}
      </div>
    </Card>
  );
}
