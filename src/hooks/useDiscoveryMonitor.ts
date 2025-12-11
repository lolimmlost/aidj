// Story 7.3: Discovery Monitor Hook
// Monitors discovery queue items and checks if they've appeared in Navidrome

import { useEffect, useCallback } from 'react';
import { useDiscoveryQueueStore } from '@/lib/stores/discovery-queue';
import { useAudioStore } from '@/lib/stores/audio';
import { search } from '@/lib/services/navidrome';

const CHECK_INTERVAL = 60000; // Check every 60 seconds

export function useDiscoveryMonitor() {
  const { items, updateStatus, getPendingItems } = useDiscoveryQueueStore();
  const { playNow, setAIUserActionInProgress } = useAudioStore();

  // Check if pending discoveries have appeared in Navidrome
  const checkPendingDiscoveries = useCallback(async () => {
    const pending = getPendingItems();
    if (pending.length === 0) return;

    console.log(`🔍 Checking ${pending.length} pending discoveries...`);

    for (const item of pending) {
      try {
        // Search Navidrome for this song
        const results = await search(`${item.artist} ${item.title}`, 0, 5);

        // Look for a match
        const match = results.find(s => {
          const artistMatch = s.artist?.toLowerCase().includes(item.artist.toLowerCase()) ||
                             item.artist.toLowerCase().includes(s.artist?.toLowerCase() || '');
          const titleMatch = (s.title?.toLowerCase() || s.name?.toLowerCase() || '')
                            .includes(item.title.toLowerCase());
          return artistMatch && titleMatch;
        });

        if (match) {
          console.log(`✅ Discovery found in library: ${item.song}`);
          updateStatus(item.id, 'ready', match.id);
        }
      } catch (error) {
        console.error(`Error checking discovery ${item.song}:`, error);
      }
    }
  }, [getPendingItems, updateStatus]);

  // Listen for play events from toast notifications
  useEffect(() => {
    const handlePlayReady = (event: CustomEvent<{ songId: string; item: { artist: string; title: string } }>) => {
      const { songId, item } = event.detail;
      if (songId) {
        setAIUserActionInProgress(true);

        // Create a song object for the player
        const songForPlayer = {
          id: songId,
          name: item.title,
          title: item.title,
          artist: item.artist,
          albumId: '',
          duration: 0,
          track: 1,
          url: '', // Will be resolved by the player
        };

        playNow(songId, songForPlayer);

        setTimeout(() => setAIUserActionInProgress(false), 2000);
      }
    };

    window.addEventListener('discovery-ready-play', handlePlayReady as EventListener);
    return () => {
      window.removeEventListener('discovery-ready-play', handlePlayReady as EventListener);
    };
  }, [playNow, setAIUserActionInProgress]);

  // Set up periodic checking
  useEffect(() => {
    // Initial check
    checkPendingDiscoveries();

    // Set up interval
    const interval = setInterval(checkPendingDiscoveries, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [checkPendingDiscoveries]);

  return {
    pendingCount: items.filter(i => i.status === 'pending' || i.status === 'downloading').length,
    readyCount: items.filter(i => i.status === 'ready').length,
    items,
    checkNow: checkPendingDiscoveries,
  };
}
