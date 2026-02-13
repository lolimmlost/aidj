/**
 * useMediaFlow Hook
 *
 * Unified hook for managing the discover-to-playlist media flow.
 * Integrates with:
 * - Discovery queue store (for discovery tracking)
 * - Audio store (for playback queue)
 * - Media flow manager (for state machine and coordination)
 *
 * Features:
 * - Duplicate detection before adding to queue
 * - Progress tracking for downloads
 * - Error handling with retry support
 * - Cancellation on navigation
 * - Loading states per operation
 *
 * @see Feature: Review and Refactor Discover-to-Playlist Media Flow
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useDiscoveryQueueStore } from '@/lib/stores/discovery-queue';
import { useAudioStore } from '@/lib/stores/audio';
import {
  mediaFlowManager,
  checkDuplicates,
  MediaFlowErrorCodes,
  type MediaFlowItem,
  type DuplicateCheckResult,
} from '@/lib/services/media-flow-manager';

// ============================================================================
// Types
// ============================================================================

export interface MediaFlowOperationState {
  isLoading: boolean;
  isChecking: boolean;
  error: string | null;
  progress: number | null;
  stage: string | null;
}

export interface AddToQueueOptions {
  position?: 'next' | 'end';
  skipDuplicateCheck?: boolean;
  source?: MediaFlowItem['source'];
  showToast?: boolean;
}

export interface AddToPlaylistOptions {
  skipDuplicateCheck?: boolean;
  showToast?: boolean;
}

export interface UseMediaFlowResult {
  // Operation states
  operationState: MediaFlowOperationState;

  // Actions
  addToDiscoveryQueue: (
    artist: string,
    title: string,
    source: 'lastfm' | 'ollama'
  ) => Promise<{ success: boolean; id?: string; error?: string }>;

  addToAudioQueue: (
    songId: string,
    artist: string,
    title: string,
    options?: AddToQueueOptions
  ) => Promise<{ success: boolean; error?: string }>;

  addToPlaylist: (
    playlistId: string,
    songId: string,
    artist: string,
    title: string,
    options?: AddToPlaylistOptions
  ) => Promise<{ success: boolean; error?: string }>;

  playNow: (
    songId: string,
    artist: string,
    title: string,
    options?: { skipDuplicateCheck?: boolean }
  ) => Promise<{ success: boolean; error?: string }>;

  // Checks
  checkForDuplicates: (
    artist: string,
    title: string,
    targetPlaylistId?: string
  ) => Promise<DuplicateCheckResult>;

  // Retry and cancel
  retry: (itemId: string) => Promise<boolean>;
  cancel: (itemId: string) => Promise<boolean>;

  // Stats and status
  pendingCount: number;
  failedCount: number;
  getItemStatus: (id: string) => MediaFlowItem | undefined;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useMediaFlow(): UseMediaFlowResult {
  // Stores
  const discoveryStore = useDiscoveryQueueStore();
  const audioStore = useAudioStore();

  // Local state for operation tracking
  const [operationState, setOperationState] = useState<MediaFlowOperationState>({
    isLoading: false,
    isChecking: false,
    error: null,
    progress: null,
    stage: null,
  });

  // Track pending items
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  // Abort controller ref for cancellation
  const _abortControllerRef = useRef<AbortController | null>(null);

  // Update counts when manager state changes
  useEffect(() => {
    const updateCounts = () => {
      const stats = mediaFlowManager.getStats();
      setPendingCount(stats.byState.queued + stats.byState.downloading + stats.byState.processing);
      setFailedCount(stats.failedRetryable);
    };

    // Listen for transitions
    mediaFlowManager.on('transition', updateCounts);
    mediaFlowManager.on('item:created', updateCounts);
    mediaFlowManager.on('item:removed', updateCounts);

    // Initial count
    updateCounts();

    return () => {
      mediaFlowManager.off('transition', updateCounts);
      mediaFlowManager.off('item:created', updateCounts);
      mediaFlowManager.off('item:removed', updateCounts);
    };
  }, []);

  // Handle navigation cleanup
  useEffect(() => {
    const handleBeforeUnload = () => {
      mediaFlowManager.handleUserNavigation();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Check for duplicates
  const checkForDuplicates = useCallback(async (
    artist: string,
    title: string,
    targetPlaylistId?: string
  ): Promise<DuplicateCheckResult> => {
    setOperationState(prev => ({ ...prev, isChecking: true }));
    try {
      const result = await checkDuplicates(artist, title, {
        checkDiscoveryQueue: true,
        checkAudioQueue: true,
        checkPlaylists: !!targetPlaylistId,
        targetPlaylistId,
      });
      return result;
    } finally {
      setOperationState(prev => ({ ...prev, isChecking: false }));
    }
  }, []);

  // Add to discovery queue
  const addToDiscoveryQueue = useCallback(async (
    artist: string,
    title: string,
    source: 'lastfm' | 'ollama'
  ): Promise<{ success: boolean; id?: string; error?: string }> => {
    setOperationState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      stage: 'Checking for duplicates...',
    }));

    try {
      // Check for duplicates first
      const duplicateResult = await checkDuplicates(artist, title);
      if (duplicateResult.isDuplicate) {
        const locationName = duplicateResult.location === 'discovery_queue'
          ? 'discovery queue'
          : duplicateResult.location === 'audio_queue'
          ? 'playback queue'
          : 'playlist';

        setOperationState(prev => ({
          ...prev,
          isLoading: false,
          error: `Already in ${locationName}`,
        }));

        toast.info(`"${title}" is already in your ${locationName}`, {
          description: 'Skipping duplicate',
        });

        return {
          success: false,
          error: MediaFlowErrorCodes.DUPLICATE_IN_QUEUE,
        };
      }

      setOperationState(prev => ({ ...prev, stage: 'Adding to queue...' }));

      // Add to discovery queue store
      const id = discoveryStore.addDiscovery({
        song: `${artist} - ${title}`,
        artist,
        title,
        source,
      });

      // Create flow item for tracking
      mediaFlowManager.createItem({
        artist,
        title,
        source: 'discovery',
      });

      setOperationState(prev => ({
        ...prev,
        isLoading: false,
        stage: null,
      }));

      toast.success(`Added "${title}" to discovery queue`, {
        description: `by ${artist}`,
      });

      return { success: true, id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add to queue';
      setOperationState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        stage: null,
      }));
      toast.error('Failed to add to discovery queue', { description: errorMessage });
      return { success: false, error: errorMessage };
    }
  }, [discoveryStore, checkDuplicates]);

  // Add to audio queue
  const addToAudioQueue = useCallback(async (
    songId: string,
    artist: string,
    title: string,
    options: AddToQueueOptions = {}
  ): Promise<{ success: boolean; error?: string }> => {
    const {
      position = 'end',
      skipDuplicateCheck = false,
      source: _source = 'recommendation',
      showToast = true,
    } = options;

    setOperationState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      stage: skipDuplicateCheck ? 'Adding to queue...' : 'Checking for duplicates...',
    }));

    try {
      // Check for duplicates unless skipped
      if (!skipDuplicateCheck) {
        const duplicateResult = await checkDuplicates(artist, title, undefined);
        if (duplicateResult.isDuplicate && duplicateResult.location === 'audio_queue') {
          setOperationState(prev => ({
            ...prev,
            isLoading: false,
            error: 'Already in queue',
          }));

          if (showToast) {
            toast.info(`"${title}" is already in your queue`, {
              description: 'Skipping duplicate',
            });
          }

          return { success: false, error: MediaFlowErrorCodes.DUPLICATE_IN_QUEUE };
        }
      }

      setOperationState(prev => ({ ...prev, stage: 'Adding to queue...' }));

      // Build song object
      const audioSong = {
        id: songId,
        name: title,
        title,
        artist,
        albumId: '',
        duration: 0,
        track: 1,
        url: `/api/navidrome/stream/${songId}`,
      };

      // Set user action flag to prevent AI DJ auto-refresh
      audioStore.setAIUserActionInProgress(true);

      // Add to queue based on position
      if (position === 'next') {
        audioStore.addToQueueNext([audioSong]);
      } else {
        audioStore.addToQueueEnd([audioSong]);
      }

      // Clear flag after delay
      setTimeout(() => {
        audioStore.setAIUserActionInProgress(false);
      }, 2000);

      setOperationState(prev => ({
        ...prev,
        isLoading: false,
        stage: null,
      }));

      if (showToast) {
        toast.success(
          position === 'next'
            ? `Added "${title}" to play next`
            : `Added "${title}" to end of queue`,
          { description: `by ${artist}` }
        );
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add to queue';
      setOperationState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        stage: null,
      }));
      if (showToast) {
        toast.error('Failed to add to queue', { description: errorMessage });
      }
      return { success: false, error: errorMessage };
    }
  }, [audioStore, checkDuplicates]);

  // Add to playlist
  const addToPlaylist = useCallback(async (
    playlistId: string,
    songId: string,
    artist: string,
    title: string,
    options: AddToPlaylistOptions = {}
  ): Promise<{ success: boolean; error?: string }> => {
    const { skipDuplicateCheck = false, showToast = true } = options;

    setOperationState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      stage: skipDuplicateCheck ? 'Adding to playlist...' : 'Checking for duplicates...',
    }));

    try {
      // Check for duplicates unless skipped
      if (!skipDuplicateCheck) {
        const duplicateResult = await checkDuplicates(artist, title, playlistId);
        if (duplicateResult.isDuplicate && duplicateResult.location === 'playlist') {
          setOperationState(prev => ({
            ...prev,
            isLoading: false,
            error: 'Already in playlist',
          }));

          if (showToast) {
            toast.info(`"${title}" is already in this playlist`, {
              description: duplicateResult.playlistName || 'Skipping duplicate',
            });
          }

          return { success: false, error: MediaFlowErrorCodes.DUPLICATE_IN_PLAYLIST };
        }
      }

      setOperationState(prev => ({ ...prev, stage: 'Adding to playlist...' }));

      // Call API to add song
      const response = await fetch(`/api/playlists/${playlistId}/songs/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId,
          artistName: artist,
          songTitle: title,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Handle duplicate error from server
        if (response.status === 409 || errorData.code === 'DUPLICATE_SONG') {
          setOperationState(prev => ({
            ...prev,
            isLoading: false,
            error: 'Already in playlist',
          }));

          if (showToast) {
            toast.info(`"${title}" is already in this playlist`);
          }

          return { success: false, error: MediaFlowErrorCodes.DUPLICATE_IN_PLAYLIST };
        }

        throw new Error(errorData.message || errorData.error || 'Failed to add to playlist');
      }

      setOperationState(prev => ({
        ...prev,
        isLoading: false,
        stage: null,
      }));

      if (showToast) {
        toast.success(`Added "${title}" to playlist`, {
          description: `by ${artist}`,
        });
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add to playlist';
      setOperationState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        stage: null,
      }));
      if (showToast) {
        toast.error('Failed to add to playlist', { description: errorMessage });
      }
      return { success: false, error: errorMessage };
    }
  }, [checkDuplicates]);

  // Play now
  const playNow = useCallback(async (
    songId: string,
    artist: string,
    title: string,
    options: { skipDuplicateCheck?: boolean } = {}
  ): Promise<{ success: boolean; error?: string }> => {
    const { skipDuplicateCheck: _skipDuplicateCheck = true } = options; // Skip by default for play now

    setOperationState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      stage: 'Starting playback...',
    }));

    try {
      // Build song object
      const audioSong = {
        id: songId,
        name: title,
        title,
        artist,
        albumId: '',
        duration: 0,
        track: 1,
        url: `/api/navidrome/stream/${songId}`,
      };

      // Set user action flag
      audioStore.setAIUserActionInProgress(true);

      // Play now
      audioStore.playNow(songId, audioSong);

      // Clear flag after delay
      setTimeout(() => {
        audioStore.setAIUserActionInProgress(false);
      }, 2000);

      setOperationState(prev => ({
        ...prev,
        isLoading: false,
        stage: null,
      }));

      toast.success(`Now playing "${title}"`);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start playback';
      setOperationState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        stage: null,
      }));
      toast.error('Failed to play', { description: errorMessage });
      return { success: false, error: errorMessage };
    }
  }, [audioStore]);

  // Retry failed item
  const retry = useCallback(async (itemId: string): Promise<boolean> => {
    return mediaFlowManager.retryItem(itemId);
  }, []);

  // Cancel item
  const cancel = useCallback(async (itemId: string): Promise<boolean> => {
    return mediaFlowManager.cancelItem(itemId);
  }, []);

  // Get item status
  const getItemStatus = useCallback((id: string): MediaFlowItem | undefined => {
    return mediaFlowManager.getItem(id);
  }, []);

  return {
    operationState,
    addToDiscoveryQueue,
    addToAudioQueue,
    addToPlaylist,
    playNow,
    checkForDuplicates,
    retry,
    cancel,
    pendingCount,
    failedCount,
    getItemStatus,
  };
}

// ============================================================================
// Progress Tracking Hook
// ============================================================================

export interface UseMediaFlowProgressResult {
  items: MediaFlowItem[];
  hasActiveItems: boolean;
  getProgress: (id: string) => { percentage: number; stage: string } | null;
}

/**
 * Hook for tracking media flow progress across all items
 */
export function useMediaFlowProgress(): UseMediaFlowProgressResult {
  const [items, setItems] = useState<MediaFlowItem[]>([]);

  useEffect(() => {
    const updateItems = () => {
      setItems(mediaFlowManager.getActiveItems());
    };

    mediaFlowManager.on('transition', updateItems);
    mediaFlowManager.on('progress', updateItems);
    mediaFlowManager.on('item:created', updateItems);
    mediaFlowManager.on('item:removed', updateItems);

    updateItems();

    return () => {
      mediaFlowManager.off('transition', updateItems);
      mediaFlowManager.off('progress', updateItems);
      mediaFlowManager.off('item:created', updateItems);
      mediaFlowManager.off('item:removed', updateItems);
    };
  }, []);

  const getProgress = useCallback((id: string): { percentage: number; stage: string } | null => {
    const item = mediaFlowManager.getItem(id);
    if (!item?.progress) return null;
    return {
      percentage: item.progress.percentage,
      stage: item.progress.stage,
    };
  }, []);

  return {
    items,
    hasActiveItems: items.length > 0,
    getProgress,
  };
}
