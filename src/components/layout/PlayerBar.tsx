import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Heart,
  Loader2,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Maximize2,
  MicVocal,
  AudioWaveform,
  Smartphone,
  Repeat1,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { LyricsModal } from '@/components/lyrics';
import { VisualizerModal } from '@/components/visualizer';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AlbumArt } from '@/components/ui/album-art';
import { DevicePicker } from '@/components/layout/DevicePicker';
import { useAudioStore } from '@/lib/stores/audio';
import { AIDJToggle } from '@/components/ai-dj-toggle';
import { scrobbleSong } from '@/lib/services/navidrome';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query';
import { usePlaybackSync, sendPlaybackMessage, sendRemoteCommand } from '@/lib/hooks/usePlaybackSync';
import { ResumePlaybackPrompt } from './ResumePlaybackPrompt';
import { FullscreenPlayer } from './FullscreenPlayer';

// Import extracted hooks
import { useDualDeckAudio, hasRealSong, Song } from '@/lib/hooks/useDualDeckAudio';
import { useCrossfade } from '@/lib/hooks/useCrossfade';
import { useStallRecovery } from '@/lib/hooks/useStallRecovery';
import { useMediaSession } from '@/lib/hooks/useMediaSession';
import { usePlayerKeyboardShortcuts } from '@/lib/hooks/usePlayerKeyboardShortcuts';
import { usePlaybackStateSync } from '@/lib/hooks/usePlaybackStateSync';
import { useWebAudioGraph } from '@/lib/hooks/useWebAudioGraph';
import { useDeckEventHandlers } from '@/lib/hooks/useDeckEventHandlers';
import { useSongLoader } from '@/lib/hooks/useSongLoader';

// Helper function for time formatting
const formatTime = (time: number) => {
  if (!isFinite(time) || time < 0) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Compact Player Bar for the new three-column layout
 * Fixed at the bottom of the screen
 *
 * Refactored to use extracted hooks for better maintainability:
 * - useDualDeckAudio: Dual-deck audio element management
 * - useCrossfade: Equal power crossfade between decks
 * - useStallRecovery: Stall detection and recovery
 * - useMediaSession: iOS lock screen controls
 * - usePlayerKeyboardShortcuts: Keyboard shortcuts
 * - usePlaybackStateSync: Store/audio state synchronization
 */
export function PlayerBar() {
  // Cross-device playback sync (WebSocket + REST)
  usePlaybackSync();

  // Dual-deck audio system
  const {
    deckARef,
    deckBRef,
    activeDeckRef,
    getActiveDeck,
    getInactiveDeck,
    setActiveDeck,
  } = useDualDeckAudio();

  // Web Audio API graph for crossfade via GainNodes
  const {
    analyserRef: webAudioAnalyserRef,
    isInitialized: webAudioInitialized,
    initializeGraph,
    scheduleGainRamp,
    cancelGainRamp,
    setGainImmediate,
    getGainValue,
    setMasterVolume,
    resumeContext,
  } = useWebAudioGraph();

  // Track consecutive stream failures to prevent infinite skip loops
  const consecutiveFailuresRef = useRef(0);

  // Stable helper: ensures Web Audio graph is initialized before play().
  // Uses a ref so it can be called from effects without adding deps that cause re-runs.
  const ensureGraphInitializedRef = useRef<() => void>(() => {});
  ensureGraphInitializedRef.current = () => {
    if (!webAudioInitialized && deckARef.current && deckBRef.current) {
      initializeGraph(deckARef.current, deckBRef.current);
      setMasterVolume(volume);
    }
    resumeContext();
  };

  // Scrobble tracking refs
  const hasScrobbledRef = useRef<boolean>(false);
  const scrobbleThresholdReachedRef = useRef<boolean>(false);
  const currentSongIdRef = useRef<string | null>(null);

  // Snapshot of playback position — updated continuously via timeupdate,
  // read by handleNextSong so it gets the real position even when the deck
  // has already been reassigned to the next song on a rapid skip.
  const playbackSnapshotRef = useRef<{ currentTime: number; duration: number; songId: string | null }>({ currentTime: 0, duration: 0, songId: null });

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);

  // Track canplay/error handlers for cleanup
  const canPlayHandlerRef = useRef<(() => void) | null>(null);
  const errorHandlerRef = useRef<((e: Event) => void) | null>(null);

  // Store hooks
  const {
    playlist,
    currentSongIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    isShuffled,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
    nextSong,
    previousSong,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    setAIUserActionInProgress,
    markUserPause,
  } = useAudioStore();

  const currentSong = useMemo(() => playlist[currentSongIndex] || null, [playlist, currentSongIndex]) as Song | null;
  const queryClient = useQueryClient();

  // Remote device state for cross-device sync indicator
  const remoteDevice = useAudioStore((s) => s.remoteDevice);
  const isRemotePlaying = !!remoteDevice?.isPlaying;
  const [remoteEstimatedPositionMs, setRemoteEstimatedPositionMs] = useState(0);

  // Interpolate remote playback position every second
  useEffect(() => {
    if (!isRemotePlaying || !remoteDevice?.updatedAt || remoteDevice.currentPositionMs == null) {
      setRemoteEstimatedPositionMs(remoteDevice?.currentPositionMs ?? 0);
      return;
    }
    setRemoteEstimatedPositionMs(remoteDevice.currentPositionMs);
    const interval = setInterval(() => {
      const elapsed = Date.now() - (remoteDevice.updatedAt ?? Date.now());
      const pos = (remoteDevice.currentPositionMs ?? 0) + elapsed;
      const clamped = remoteDevice.durationMs ? Math.min(pos, remoteDevice.durationMs) : pos;
      setRemoteEstimatedPositionMs(clamped);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRemotePlaying, remoteDevice?.currentPositionMs, remoteDevice?.updatedAt, remoteDevice?.durationMs]);

  // Derived values for display: use remote time when remote is playing and local isn't
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const devicePickerTriggerRef = useRef<HTMLButtonElement>(null);
  const showRemoteTime = isRemotePlaying && !isPlaying;
  const displayCurrentTime = showRemoteTime ? remoteEstimatedPositionMs / 1000 : currentTime;
  const displayDuration = showRemoteTime && remoteDevice?.durationMs ? remoteDevice.durationMs / 1000 : duration;

  // Record a song play in listening history.
  // Called on: natural end, crossfade complete, manual skip/next.
  const recordListeningHistory = useCallback((
    song: Song | null,
    songId: string | null,
    playDuration?: number,
    songDuration?: number,
    userInitiatedSkip?: boolean,
  ) => {
    if (!songId || !song) return;
    fetch('/api/listening-history/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId,
        artist: song.artist || 'Unknown',
        title: song.name || song.title || 'Unknown',
        album: song.album,
        genre: song.genre,
        duration: songDuration,
        playDuration,
        userInitiatedSkip,
      }),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['listening-history'] });
    }).catch(err => console.warn('Failed to record listening history:', err));
  }, [queryClient]);

  // Wrap nextSong to record the outgoing song (for manual skip/next button)
  const handleNextSong = useCallback(() => {
    const outgoingSong = currentSong;
    const outgoingSongId = currentSongIdRef.current;
    const activeDeck = getActiveDeck();
    // Use the snapshot for playback position — activeDeck may already be
    // reassigned to the new song on rapid skips, giving stale 0 values.
    const snapshot = playbackSnapshotRef.current;
    const outgoingPlayDuration = snapshot.songId === outgoingSongId ? snapshot.currentTime : activeDeck?.currentTime;
    const outgoingSongDuration = snapshot.songId === outgoingSongId ? snapshot.duration : activeDeck?.duration;
    if (outgoingSong && outgoingSongId && !hasScrobbledRef.current) {
      recordListeningHistory(
        outgoingSong,
        outgoingSongId,
        outgoingPlayDuration,
        outgoingSongDuration,
        true, // userInitiatedSkip — user pressed Next
      );
    }
    hasScrobbledRef.current = false;
    scrobbleThresholdReachedRef.current = false;
    nextSong(true); // userSkip — bypass repeat-one lock
  }, [currentSong, getActiveDeck, nextSong, recordListeningHistory]);

  // Shared crossfade state ref - created here so it can be passed to both hooks
  const crossfadeInProgressRef = useRef<boolean>(false);
  // Cooldown after crossfade abort — prevents immediate re-trigger from timeupdate
  const crossfadeAbortedAtRef = useRef<number>(0);

  // Crossfade hook (initialized first since stall recovery needs crossfadeInProgressRef)
  const {
    crossfadeJustCompletedRef,
    startCrossfade,
    clearCrossfade,
    resetCrossfadeState,
  } = useCrossfade({
    getActiveDeck,
    getInactiveDeck,
    activeDeckRef,
    crossfadeInProgressRef, // Pass the shared ref
    scheduleGainRamp,
    cancelGainRamp,
    setGainImmediate,
    getGainValue,
    resumeContext,
    onCrossfadeComplete: (song) => {
      // Record the outgoing (just-finished) song before advancing
      const outgoingSong = currentSong;
      const outgoingSongId = currentSongIdRef.current;
      const activeDeck = getActiveDeck();
      // Use the snapshot for playback position — the deck may already be
      // loaded with the next song's audio during crossfade.
      const snapshot = playbackSnapshotRef.current;
      const outgoingPlayDuration = snapshot.songId === outgoingSongId ? snapshot.currentTime : activeDeck?.currentTime;
      const outgoingSongDuration = snapshot.songId === outgoingSongId ? snapshot.duration : activeDeck?.duration;
      if (outgoingSong && outgoingSongId) {
        scrobbleSong(outgoingSongId, true)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['most-played-songs'] });
            queryClient.invalidateQueries({ queryKey: ['top-artists'] });
          })
          .catch(console.error);
        recordListeningHistory(
          outgoingSong,
          outgoingSongId,
          outgoingPlayDuration,
          outgoingSongDuration,
          // Not user-initiated — this is a natural crossfade transition
        );
      }
      currentSongIdRef.current = song.id;
      hasScrobbledRef.current = false;
      scrobbleThresholdReachedRef.current = false;
      nextSong();
    },
    onCrossfadeAbort: (song) => {
      if (song) {
        const activeDeck = getActiveDeck();
        const songHasEnded = activeDeck && activeDeck.duration > 0 &&
          (activeDeck.currentTime >= activeDeck.duration - 0.5 || activeDeck.ended);

        // Don't remove the song from queue — crossfade abort just means the
        // song didn't buffer fast enough for a smooth crossfade, not that it's
        // unavailable. The song loader's own timeout (15s) handles truly
        // unavailable songs when they get loaded normally.
        if (songHasEnded) {
          console.log(`[XFADE] Crossfade aborted & song ended — advancing to next`);
          hasScrobbledRef.current = false;
          scrobbleThresholdReachedRef.current = false;
          crossfadeAbortedAtRef.current = Date.now();
          nextSong();
        } else {
          console.log(`[XFADE] Crossfade aborted but song still playing — will advance naturally when it ends`);
        }
      }
    },
    canPlayHandlerRef,
    errorHandlerRef,
    setActiveDeck,
  });

  // Stall recovery hook (uses shared crossfadeInProgressRef)
  const {
    recoveryAttemptRef,
    lastProgressTimeRef,
    lastProgressValueRef,
    attemptStallRecovery,
    resetRecoveryState,
  } = useStallRecovery({
    getActiveDeck,
    crossfadeInProgressRef, // Now properly shared
    onMaxAttemptsReached: nextSong,
    resumeContext,
  });

  // Fetch feedback for current song
  const { data: feedbackData } = useSongFeedback(currentSong ? [currentSong.id] : []);

  // Determine if song is liked based on server state
  const isLiked = useMemo(() => {
    if (!currentSong?.id) return false;
    return feedbackData?.feedback?.[currentSong.id] === 'thumbs_up';
  }, [feedbackData?.feedback, currentSong?.id]);

  // Like/unlike mutation with optimistic cache update
  const { mutate: likeMutate, isPending: isLikePending } = useMutation({
    mutationFn: async (liked: boolean) => {
      if (!currentSong) {
        throw new Error('No song selected');
      }

      setAIUserActionInProgress(true);

      const payload = {
        songId: currentSong.id,
        songArtistTitle: `${currentSong.artist || 'Unknown'} - ${currentSong.title || currentSong.name}`,
        feedbackType: liked ? 'thumbs_up' : 'thumbs_down',
        source: 'library',
      };

      const response = await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok && response.status !== 409) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update feedback');
      }

      return liked;
    },
    onMutate: async (liked) => {
      if (!currentSong) return;
      // Optimistically update the feedback cache so the heart icon fills immediately
      const feedbackQueryKey = queryKeys.feedback.songs([currentSong.id]);
      await queryClient.cancelQueries({ queryKey: feedbackQueryKey });
      const previous = queryClient.getQueryData(feedbackQueryKey);
      queryClient.setQueryData(feedbackQueryKey, {
        feedback: { [currentSong.id]: liked ? 'thumbs_up' : 'thumbs_down' },
      });
      return { previous, feedbackQueryKey };
    },
    onSuccess: (liked) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
      toast.success(liked ? '❤️ Liked' : '💔 Unliked', { duration: 1500 });
      // Notify other devices so their like state updates
      sendPlaybackMessage('feedback_update', {
        songId: currentSong?.id,
        feedbackType: liked ? 'thumbs_up' : 'thumbs_down',
      });
    },
    onError: (error: Error, _liked, context) => {
      // Revert optimistic update on error
      if (context?.feedbackQueryKey) {
        queryClient.setQueryData(context.feedbackQueryKey, context.previous);
      }
      console.error('Like/unlike error:', error);
      toast.error('Failed', { description: error.message });
    },
    onSettled: () => {
      setTimeout(() => setAIUserActionInProgress(false), 1000);
    },
  });

  const handleToggleLike = useCallback(() => {
    if (!currentSong || isLikePending) return;
    likeMutate(!isLiked);
  }, [currentSong, isLikePending, isLiked, likeMutate]);

  // Listen for cross-device feedback updates (likes from other devices)
  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
    };
    window.addEventListener('playback-feedback-update', handler);
    return () => window.removeEventListener('playback-feedback-update', handler);
  }, [queryClient]);

  // Reset recovery attempts when song changes
  useEffect(() => {
    resetRecoveryState();
    resetCrossfadeState();
  }, [currentSongIndex, resetRecoveryState, resetCrossfadeState]);

  // Load song on the active deck
  const loadSong = useCallback((song: Song | null) => {
    const audio = getActiveDeck();
    if (audio && song) {
      clearCrossfade();
      audio.src = song.url;
      audio.load();
      setCurrentTime(0);
      // Use the song's metadata duration immediately so the UI doesn't flash
      // the old song's duration. The durationchange event will correct it
      // once the audio element has loaded the new file's actual duration.
      setDuration(song.duration || 0);
      hasScrobbledRef.current = false;
      scrobbleThresholdReachedRef.current = false;
      currentSongIdRef.current = song.id;
      // Reset snapshot for the new song so stale data isn't carried over
      playbackSnapshotRef.current = { currentTime: 0, duration: song.duration || 0, songId: song.id };
      resetCrossfadeState();
      console.log(`[XFADE] loadSong called on deck ${activeDeckRef.current}`);
    }
  }, [setCurrentTime, setDuration, getActiveDeck, clearCrossfade, resetCrossfadeState, activeDeckRef]);

  // Player controls
  const togglePlayPause = useCallback(() => {
    const audio = getActiveDeck();
    if (audio) {
      if (isPlaying) {
        audio.pause();
        markUserPause();
      } else {
        setIsLoading(true);

        // Initialize Web Audio graph on first user gesture
        if (!webAudioInitialized && deckARef.current && deckBRef.current) {
          initializeGraph(deckARef.current, deckBRef.current);
          // Set master volume to match current store volume
          setMasterVolume(volume);
        }
        resumeContext();

        audio.play().catch((e) => {
          setIsLoading(false);
          console.error('Play failed:', e);
        }).finally(() => setIsLoading(false));
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying, setIsPlaying, getActiveDeck, webAudioInitialized, deckARef, deckBRef, initializeGraph, setMasterVolume, volume, resumeContext]);

  const seek = useCallback((time: number) => {
    const audio = getActiveDeck();
    if (audio && !isNaN(time) && isFinite(time)) {
      audio.currentTime = time;
      setCurrentTime(time);
    }
  }, [setCurrentTime, getActiveDeck]);

  // --- Remote control wrappers ---
  // When this device is NOT the active player (another device is playing),
  // transport controls (play/pause/skip) should send a remote command via WS
  // to the active player instead of modifying local state. The active player
  // receives the command in handleIncomingMessage → 'remote_command' case and
  // executes the action (e.g., store.nextSong()), then broadcasts its updated
  // state back to all devices. Without this, skip/prev on a non-playing device
  // only updates local state — the playing device ignores the state sync
  // because it considers itself authoritative (applyServerState guard).
  const isRemoteControlMode = isRemotePlaying && !isPlaying;

  const remoteAwareNext = useCallback(() => {
    if (isRemoteControlMode) {
      sendRemoteCommand('next');
    } else {
      handleNextSong();
    }
  }, [isRemoteControlMode, handleNextSong]);

  const remoteAwarePrevious = useCallback(() => {
    if (isRemoteControlMode) {
      sendRemoteCommand('previous');
    } else {
      previousSong();
    }
  }, [isRemoteControlMode, previousSong]);

  const remoteAwareTogglePlayPause = useCallback(() => {
    if (isRemoteControlMode) {
      // Remote device is playing and we want to pause it
      sendRemoteCommand('pause');
    } else if (!isPlaying && remoteDevice?.isPlaying) {
      // Remote device is playing, local wants to take over — use normal
      // togglePlayPause which triggers playback takeover via timestamp logic
      togglePlayPause();
    } else {
      togglePlayPause();
    }
  }, [isRemoteControlMode, isPlaying, remoteDevice?.isPlaying, togglePlayPause]);

  const changeVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolume(clampedVolume);
    // Use Web Audio masterGain when available, fall back to element.volume
    if (webAudioInitialized) {
      setMasterVolume(clampedVolume);
    } else {
      const activeDeck = getActiveDeck();
      if (activeDeck) {
        activeDeck.volume = clampedVolume;
      }
    }
  }, [setVolume, getActiveDeck, webAudioInitialized, setMasterVolume]);

  // Audio event listeners for BOTH decks (extracted hook)
  useDeckEventHandlers({
    deckARef, deckBRef, activeDeckRef, setActiveDeck,
    crossfadeInProgressRef, crossfadeAbortedAtRef,
    currentSongIdRef, playbackSnapshotRef,
    scrobbleThresholdReachedRef, hasScrobbledRef,
    lastProgressTimeRef, lastProgressValueRef,
    setCurrentTime, setDuration, setIsLoading,
    nextSong, currentSong, currentSongIndex, playlist, volume,
    startCrossfade, attemptStallRecovery,
    webAudioInitialized, setMasterVolume, getActiveDeck,
    queryClient, recordListeningHistory,
  });


  // Load song when it changes (extracted hook)
  useSongLoader({
    playlist: playlist as Song[],
    currentSongIndex, getActiveDeck, loadSong, setActiveDeck,
    crossfadeInProgressRef, crossfadeJustCompletedRef,
    deckARef, deckBRef, activeDeckRef,
    lastProgressTimeRef, lastProgressValueRef,
    currentSongIdRef, playbackSnapshotRef,
    hasScrobbledRef, scrobbleThresholdReachedRef,
    canPlayHandlerRef, errorHandlerRef,
    ensureGraphInitializedRef, consecutiveFailuresRef,
    setIsPlaying, setIsLoading,
    setCurrentTime, clearCrossfade,
  });


  // Cleanup listeners on unmount
  useEffect(() => {
    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    return () => {
      [deckA, deckB].forEach(audio => {
        if (audio) {
          if (canPlayHandlerRef.current) {
            audio.removeEventListener('canplay', canPlayHandlerRef.current);
          }
          if (errorHandlerRef.current) {
            audio.removeEventListener('error', errorHandlerRef.current);
          }
        }
      });
      clearCrossfade();
    };
  }, [deckARef, deckBRef, clearCrossfade]);

  // Use extracted hooks
  useMediaSession({
    currentSong,
    getActiveDeck,
    deckARef,
    deckBRef,
    activeDeckRef,
    crossfadeInProgressRef,
    setGainImmediate,
    resumeContext,
    onPreviousTrack: remoteAwarePrevious,
    onNextTrack: remoteAwareNext,
  });

  usePlayerKeyboardShortcuts({
    togglePlayPause: remoteAwareTogglePlayPause,
    seek,
    changeVolume,
    toggleLike: handleToggleLike,
    toggleShuffle,
    currentTime,
    duration,
    volume,
  });

  usePlaybackStateSync({
    deckARef,
    deckBRef,
    activeDeckRef,
    isPlaying,
    getActiveDeck,
    checkAndResumeAudioContext: resumeContext,
    attemptStallRecovery,
    lastProgressTimeRef,
    lastProgressValueRef,
    setActiveDeck,
  });

  // SAFETY: Periodic check that the inactive deck isn't playing unexpectedly.
  // Catches edge cases where crossfade abort or desync correction fails
  // to properly stop the outgoing deck.
  useEffect(() => {
    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB) return;

    const safetyInterval = setInterval(() => {
      const activeDeckLabel = activeDeckRef.current;
      const inactive = activeDeckLabel === 'A' ? deckB : deckA;
      const inactiveDeckLabel: 'A' | 'B' = activeDeckLabel === 'A' ? 'B' : 'A';

      // Skip during crossfade or active stall recovery (recovery may have
      // just swapped activeDeckRef, leaving the old deck mid-operation)
      if (crossfadeInProgressRef.current) return;
      if (recoveryAttemptRef.current > 0) return;

      if (!inactive.paused && hasRealSong(inactive)) {
        console.warn(`[SAFETY] Deck ${inactiveDeckLabel} playing unexpectedly — stopping`);
        inactive.pause();
        inactive.currentTime = 0;
        setGainImmediate(inactiveDeckLabel, 0);
      }
    }, 10000);

    return () => clearInterval(safetyInterval);
  }, [deckARef, deckBRef, activeDeckRef, crossfadeInProgressRef, setGainImmediate, recoveryAttemptRef]);

  // Debug logging effect (only active when localStorage.debug=true)
  useEffect(() => {
    if (typeof window === 'undefined' || localStorage.getItem('debug') !== 'true') {
      return;
    }

    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB) return;

    const networkStateMap: Record<number, string> = {
      0: 'EMPTY', 1: 'IDLE', 2: 'LOADING', 3: 'NO_SOURCE'
    };
    const readyStateMap: Record<number, string> = {
      0: 'NOTHING', 1: 'METADATA', 2: 'CURRENT', 3: 'FUTURE', 4: 'ENOUGH'
    };

    const logAudioState = (event: string, deck: 'A' | 'B', audio: HTMLAudioElement) => {
      console.log(`🔊 [${event}] Deck ${deck} | paused=${audio.paused} network=${networkStateMap[audio.networkState]} ready=${readyStateMap[audio.readyState]} time=${audio.currentTime.toFixed(1)} src=${audio.src ? 'SET' : 'NONE'}`);
    };

    const events = ['play', 'pause', 'playing', 'waiting', 'stalled', 'suspend', 'abort', 'emptied', 'error', 'ended', 'canplay', 'canplaythrough', 'loadstart', 'loadeddata', 'loadedmetadata'];

    const createHandler = (deck: 'A' | 'B', audio: HTMLAudioElement) => (e: Event) => {
      logAudioState(e.type.toUpperCase(), deck, audio);
      if (e.type === 'error' && audio.error) {
        console.error(`❌ [ERROR] Deck ${deck} code=${audio.error.code} msg=${audio.error.message}`);
      }
    };

    const handlerA = createHandler('A', deckA);
    const handlerB = createHandler('B', deckB);

    events.forEach(evt => {
      deckA.addEventListener(evt, handlerA);
      deckB.addEventListener(evt, handlerB);
    });

    const handleOnline = () => {
      console.log('🌐 [NETWORK] Online');
      const active = getActiveDeck();
      if (!active) return;

      if (isPlaying && active.paused) {
        if (active.readyState >= 2) {
          console.log('🌐 [NETWORK] Resuming playback after reconnect');
          ensureGraphInitializedRef.current();
          active.play().catch(console.error);
        } else if (active.src && !active.src.startsWith('data:')) {
          const savedTime = active.currentTime;
          console.log(`🌐 [NETWORK] Reloading audio from ${savedTime.toFixed(1)}s`);
          active.load();
          active.currentTime = savedTime;
        }
      }
    };
    const handleOffline = () => console.log('🌐 [NETWORK] Offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    console.log('🔧 [DEBUG] Audio debug logging enabled');
    logAudioState('INIT', 'A', deckA);
    logAudioState('INIT', 'B', deckB);

    // Periodic state logging + inactive deck safety check
    const stateInterval = setInterval(() => {
      const active = getActiveDeck();
      const activeDeckLabel = activeDeckRef.current;
      const inactive = activeDeckLabel === 'A' ? deckB : deckA;
      const inactiveDeckLabel = activeDeckLabel === 'A' ? 'B' : 'A';

      if (active) {
        console.log(`📊 [STATE] Deck ${activeDeckLabel} | playing=${!active.paused} time=${active.currentTime.toFixed(1)}/${active.duration?.toFixed(1) || '?'}`);
      }
    }, 10000);

    return () => {
      clearInterval(stateInterval);
      events.forEach(evt => {
        deckA.removeEventListener(evt, handlerA);
        deckB.removeEventListener(evt, handlerB);
      });
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [getActiveDeck, isPlaying, deckARef, deckBRef, activeDeckRef, crossfadeInProgressRef]);

  if (!currentSong) return null;

  const progressPercent = displayDuration > 0 ? (displayCurrentTime / displayDuration) * 100 : 0;

  return (
    <>
      {/* Mobile Layout */}
      <div className="md:hidden px-3 py-2 space-y-2">
        {/* Progress bar at top */}
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-mono w-8 text-right", showRemoteTime ? "text-green-500" : "text-muted-foreground")}>
            {formatTime(displayCurrentTime)}
          </span>
          <Slider
            value={[isFinite(displayCurrentTime) ? displayCurrentTime : 0]}
            max={isFinite(displayDuration) && displayDuration > 0 ? displayDuration : 100}
            step={0.1}
            onValueChange={([newValue]) => seek(newValue)}
            className={cn("flex-1 h-1", showRemoteTime && "[&_[data-slot=slider-range]]:bg-green-500 [&_[data-slot=slider-thumb]]:border-green-500")}
            disabled={showRemoteTime}
          />
          <span className={cn("text-[10px] font-mono w-8", showRemoteTime ? "text-green-500" : "text-muted-foreground")}>
            -{formatTime(Math.max(0, displayDuration - displayCurrentTime))}
          </span>
        </div>

        {/* Main row: Album art, song info, controls */}
        <div className="flex items-center gap-3">
          {/* Small Album Artwork */}
          <div className={cn(
            "flex items-center gap-3 min-w-0 flex-1 rounded-lg transition-all",
            showRemoteTime && "ring-1 ring-green-500/60 bg-green-500/5 px-2 py-1"
          )}>
            <div onClick={() => setShowFullscreen(true)} className="cursor-pointer relative group/art">
              <AlbumArt
                albumId={currentSong.albumId}
                songId={currentSong.id}
                artist={currentSong.artist}
                size="sm"
                isPlaying={isPlaying || isRemotePlaying}
              />
              {/* Tap indicator — subtle expand icon */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-active/art:bg-black/30 transition-colors rounded-md">
                <Maximize2 className="h-3 w-3 text-white/0 group-active/art:text-white/80 transition-colors" />
              </div>
            </div>

            {/* Song Info */}
            <div className="min-w-0 flex-1">
              <p
                className={cn("font-medium text-sm truncate active:text-primary transition-colors", showRemoteTime && "text-green-500")}
                onClick={() => setShowFullscreen(true)}
              >
                {currentSong.name || currentSong.title}
              </p>
              {(currentSong as { artistId?: string }).artistId ? (
                <Link
                  to="/library/artists/$id"
                  params={{ id: (currentSong as { artistId?: string }).artistId! }}
                  className={cn("text-xs truncate block active:text-primary transition-colors", showRemoteTime ? "text-green-500/70" : "text-muted-foreground")}
                  onClick={(e) => e.stopPropagation()}
                >
                  {currentSong.artist || 'Unknown'}
                </Link>
              ) : (
                <p className={cn("text-xs truncate", showRemoteTime ? "text-green-500/70" : "text-muted-foreground")}>{currentSong.artist || 'Unknown'}</p>
              )}
              {showRemoteTime && (
                <button
                  ref={devicePickerTriggerRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDevicePicker(prev => !prev);
                  }}
                  className="flex items-center gap-1 text-[10px] text-green-500/60 mt-0.5 hover:text-green-500 transition-colors"
                  aria-label="Switch playback device"
                >
                  <Smartphone className="h-2.5 w-2.5" />
                  <span className="truncate">{remoteDevice?.deviceName || 'Another device'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Compact Controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleToggleLike}
              disabled={isLikePending}
            >
              <Heart className={cn("h-4 w-4", isLiked && "fill-current text-red-500")} />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={remoteAwarePrevious}
            >
              <SkipBack className="h-4 w-4" />
            </Button>

            <Button
              variant="default"
              size="sm"
              className="h-10 w-10 p-0 rounded-full"
              onClick={remoteAwareTogglePlayPause}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying || isRemoteControlMode ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={remoteAwareNext}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:flex h-20 px-4 items-center gap-4 relative">
        {/* Progress bar - thin line at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
          <div
            className={cn("h-full transition-all duration-100", showRemoteTime ? "bg-green-500" : "bg-primary")}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Left: Song Info */}
        <div className={cn(
          "flex items-center gap-3 w-72 min-w-0 rounded-lg transition-all",
          showRemoteTime && "ring-1 ring-green-500/60 bg-green-500/5 px-2 py-1 -ml-2"
        )}>
          {/* Mini Album Art — click to open fullscreen */}
          <div onClick={() => setShowFullscreen(true)} className="cursor-pointer">
            <AlbumArt
              albumId={currentSong.albumId}
              songId={currentSong.id}
              artist={currentSong.artist}
              size="md"
              isPlaying={isPlaying || isRemotePlaying}
              className="rounded-md"
            />
          </div>
          <div className="min-w-0">
            <p className={cn("font-medium truncate text-sm", showRemoteTime && "text-green-500")}>{currentSong.name || currentSong.title}</p>
            {(currentSong as { artistId?: string }).artistId ? (
              <Link
                to="/library/artists/$id"
                params={{ id: (currentSong as { artistId?: string }).artistId! }}
                className={cn("text-xs truncate block hover:underline", showRemoteTime ? "text-green-500/70" : "text-muted-foreground hover:text-foreground")}
              >
                {currentSong.artist || 'Unknown'}
              </Link>
            ) : (
              <p className={cn("text-xs truncate", showRemoteTime ? "text-green-500/70" : "text-muted-foreground")}>{currentSong.artist || 'Unknown'}</p>
            )}
            {showRemoteTime && (
              <button
                ref={devicePickerTriggerRef}
                onClick={(e) => { e.stopPropagation(); setShowDevicePicker(prev => !prev); }}
                className="flex items-center gap-1 text-[10px] text-green-500/60 mt-0.5 hover:text-green-500 transition-colors"
                aria-label="Switch playback device"
              >
                <Smartphone className="h-2.5 w-2.5" />
                <span className="truncate">{remoteDevice?.deviceName || 'Another device'}</span>
              </button>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 flex-shrink-0"
            onClick={handleToggleLike}
            disabled={isLikePending}
          >
            <Heart className={cn("h-4 w-4", isLiked && "fill-current text-red-500")} />
          </Button>
        </div>

        {/* Center: Controls + Progress */}
        <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto gap-1">
          {/* Playback Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 w-8 p-0",
                isShuffled && "text-primary"
              )}
              onClick={toggleShuffle}
            >
              <Shuffle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={remoteAwarePrevious}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-10 w-10 p-0 rounded-full"
              onClick={remoteAwareTogglePlayPause}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying || isRemoteControlMode ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={remoteAwareNext}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-8 w-8 p-0", repeatMode !== 'off' ? "text-primary" : "text-muted-foreground")}
              onClick={toggleRepeat}
              title={`Repeat: ${repeatMode}`}
            >
              {repeatMode === 'one' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-2 w-full">
            <span className={cn("text-xs w-10 text-right font-mono", showRemoteTime ? "text-green-500" : "text-muted-foreground")}>
              {formatTime(displayCurrentTime)}
            </span>
            <Slider
              value={[isFinite(displayCurrentTime) ? displayCurrentTime : 0]}
              max={isFinite(displayDuration) && displayDuration > 0 ? displayDuration : 100}
              step={0.1}
              onValueChange={([newValue]) => seek(newValue)}
              className={cn("flex-1", showRemoteTime && "[&_[data-slot=slider-range]]:bg-green-500 [&_[data-slot=slider-thumb]]:border-green-500")}
              disabled={showRemoteTime}
            />
            <span className={cn("text-xs w-10 font-mono", showRemoteTime ? "text-green-500" : "text-muted-foreground")}>
              -{formatTime(Math.max(0, displayDuration - displayCurrentTime))}
            </span>
          </div>
        </div>

        {/* Right: Volume + Queue + AI DJ */}
        <div className="flex items-center gap-2 w-72 justify-end">
          <AIDJToggle compact />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setShowLyrics(true)}
            title="Show lyrics"
          >
            <MicVocal className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setShowVisualizer(true)}
            title="Show visualizer"
          >
            <AudioWaveform className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => changeVolume(volume > 0 ? 0 : 0.5)}
            >
              {volume > 0 ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Slider
              value={[volume * 100]}
              max={100}
              step={1}
              onValueChange={([newValue]) => changeVolume(newValue / 100)}
              className="w-24"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setShowFullscreen(true)}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Resume Playback Prompt (shown when another device is playing) */}
      <ResumePlaybackPrompt />

      {/* Dual-Deck Audio Elements for crossfade */}
      <audio ref={deckARef} preload="metadata" crossOrigin="anonymous" className="hidden" />
      <audio ref={deckBRef} preload="metadata" crossOrigin="anonymous" className="hidden" />

      {/* Lyrics Modal */}
      <LyricsModal isOpen={showLyrics} onClose={() => setShowLyrics(false)} />

      {/* Visualizer Modal */}
      <VisualizerModal
        isOpen={showVisualizer}
        onClose={() => setShowVisualizer(false)}
        analyserNode={webAudioAnalyserRef.current}
      />

      {/* Fullscreen Now Playing */}
      <FullscreenPlayer
        isOpen={showFullscreen}
        onClose={() => setShowFullscreen(false)}
        currentSong={currentSong}
        isPlaying={isPlaying}
        isLoading={isLoading}
        currentTime={displayCurrentTime}
        duration={displayDuration}
        isLiked={isLiked}
        isLikePending={isLikePending}
        isShuffled={isShuffled}
        repeatMode={repeatMode}
        onTogglePlayPause={remoteAwareTogglePlayPause}
        onPrevious={remoteAwarePrevious}
        onNext={remoteAwareNext}
        onSeek={seek}
        onToggleLike={handleToggleLike}
        onToggleShuffle={toggleShuffle}
        onShowLyrics={() => {
          setShowFullscreen(false);
          setShowLyrics(true);
        }}
        onToggleRepeat={toggleRepeat}
      />

      {/* Device Picker — rendered via portal */}
      {showDevicePicker && (
        <DevicePicker onClose={() => setShowDevicePicker(false)} triggerRef={devicePickerTriggerRef} />
      )}
    </>
  );
}
