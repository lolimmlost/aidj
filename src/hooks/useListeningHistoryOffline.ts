/**
 * Offline-First Listening History Hook
 *
 * Records song plays with offline support.
 * When offline:
 * - Stores plays in IndexedDB
 * - Queues for background sync
 *
 * @see docs/architecture/offline-first.md
 */

import { useCallback, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { recordSongPlayOffline, getLocalListeningHistory } from '@/lib/services/offline';
import authClient from '@/lib/auth/auth-client';

interface RecordPlayParams {
  songId: string;
  artist: string;
  title: string;
  album?: string;
  genre?: string;
  duration?: number;
  playDuration?: number;
}

/**
 * Hook to record song plays with offline support
 */
export function useRecordPlayOffline() {
  // Track last recorded play to prevent duplicates
  const lastRecordedRef = useRef<{ songId: string; timestamp: number } | null>(null);

  return useMutation({
    mutationFn: async (params: RecordPlayParams) => {
      // Prevent duplicate records within 5 seconds
      const now = Date.now();
      if (
        lastRecordedRef.current &&
        lastRecordedRef.current.songId === params.songId &&
        now - lastRecordedRef.current.timestamp < 5000
      ) {
        console.log('[useRecordPlayOffline] Skipping duplicate record');
        return { success: true, skipped: true };
      }

      // Record the play using offline adapter
      await recordSongPlayOffline({
        songId: params.songId,
        artist: params.artist,
        title: params.title,
        album: params.album,
        genre: params.genre,
        duration: params.duration,
        playDuration: params.playDuration,
      });

      // Update last recorded
      lastRecordedRef.current = { songId: params.songId, timestamp: now };

      return { success: true, skipped: false };
    },
    onSuccess: (data, params) => {
      if (!data.skipped) {
        console.log(`[useRecordPlayOffline] Recorded: ${params.artist} - ${params.title}`);
      }
    },
    onError: (error) => {
      console.error('[useRecordPlayOffline] Failed to record play:', error);
    },
  });
}

/**
 * Hook to get local listening history
 */
export function useLocalListeningHistory(limit: number = 50) {
  const { data: session } = authClient.useSession();

  return useQuery({
    queryKey: ['listening-history', 'local', limit],
    queryFn: async () => {
      const history = await getLocalListeningHistory();
      return history.slice(0, limit);
    },
    enabled: !!session?.user?.id,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook for tracking playback with auto-record
 *
 * Usage:
 * ```tsx
 * const { startTracking, stopTracking, updatePlayback } = usePlaybackTracking();
 *
 * // When a song starts playing
 * startTracking(song);
 *
 * // Update playback time periodically
 * updatePlayback(currentTime);
 *
 * // When song ends or changes
 * stopTracking();
 * ```
 */
export function usePlaybackTracking() {
  const recordMutation = useRecordPlayOffline();
  const trackingRef = useRef<{
    song: RecordPlayParams | null;
    startTime: number;
    lastUpdateTime: number;
    playedDuration: number;
  }>({
    song: null,
    startTime: 0,
    lastUpdateTime: 0,
    playedDuration: 0,
  });

  const startTracking = useCallback((song: RecordPlayParams) => {
    const now = Date.now();
    trackingRef.current = {
      song,
      startTime: now,
      lastUpdateTime: now,
      playedDuration: 0,
    };
    console.log(`[usePlaybackTracking] Started tracking: ${song.artist} - ${song.title}`);
  }, []);

  const updatePlayback = useCallback((_currentTime: number) => {
    const tracking = trackingRef.current;
    if (!tracking.song) return;

    const now = Date.now();
    const timeSinceLastUpdate = (now - tracking.lastUpdateTime) / 1000;

    // Only count time if it's reasonable (< 5 seconds since last update)
    // This handles pauses and seeks
    if (timeSinceLastUpdate < 5) {
      tracking.playedDuration += timeSinceLastUpdate;
    }

    tracking.lastUpdateTime = now;
  }, []);

  const stopTracking = useCallback(async () => {
    const tracking = trackingRef.current;
    if (!tracking.song) return;

    // Record the play if we have meaningful playtime (> 5 seconds)
    if (tracking.playedDuration >= 5) {
      await recordMutation.mutateAsync({
        ...tracking.song,
        playDuration: Math.floor(tracking.playedDuration),
      });
    } else {
      console.log(`[usePlaybackTracking] Skipping record (only ${tracking.playedDuration.toFixed(1)}s played)`);
    }

    // Reset tracking
    trackingRef.current = {
      song: null,
      startTime: 0,
      lastUpdateTime: 0,
      playedDuration: 0,
    };
  }, [recordMutation]);

  const getCurrentPlayDuration = useCallback(() => {
    return trackingRef.current.playedDuration;
  }, []);

  return {
    startTracking,
    stopTracking,
    updatePlayback,
    getCurrentPlayDuration,
    isRecording: recordMutation.isPending,
  };
}

/**
 * Scrobble threshold checker
 * A song should be scrobbled when:
 * - It's played for at least 30 seconds AND
 * - It's played for at least 50% of its duration
 */
export function shouldScrobble(playDuration: number, totalDuration: number): boolean {
  const MIN_PLAY_SECONDS = 30;
  const MIN_PLAY_PERCENTAGE = 0.5;

  if (playDuration < MIN_PLAY_SECONDS) {
    return false;
  }

  if (totalDuration > 0 && playDuration / totalDuration < MIN_PLAY_PERCENTAGE) {
    return false;
  }

  return true;
}
