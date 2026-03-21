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
} from 'lucide-react';
import { LyricsModal } from '@/components/lyrics';
import { VisualizerModal } from '@/components/visualizer';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AlbumArt } from '@/components/ui/album-art';
import { useAudioStore } from '@/lib/stores/audio';
import { AIDJToggle } from '@/components/ai-dj-toggle';
import { scrobbleSong } from '@/lib/services/navidrome';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query';
import { usePlaybackSync, sendPlaybackMessage } from '@/lib/hooks/usePlaybackSync';
import { ResumePlaybackPrompt } from './ResumePlaybackPrompt';

// Import extracted hooks
import { useDualDeckAudio, Song, SILENT_AUDIO_DATA_URL } from '@/lib/hooks/useDualDeckAudio';
import { useCrossfade } from '@/lib/hooks/useCrossfade';
import { useStallRecovery } from '@/lib/hooks/useStallRecovery';
import { useMediaSession } from '@/lib/hooks/useMediaSession';
import { usePlayerKeyboardShortcuts } from '@/lib/hooks/usePlayerKeyboardShortcuts';
import { usePlaybackStateSync } from '@/lib/hooks/usePlaybackStateSync';
import { useWebAudioGraph } from '@/lib/hooks/useWebAudioGraph';

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
    nextSong();
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
        console.log(`[XFADE] Crossfade aborted — falling back to standard transition for: ${song.name || song.title}`);
        hasScrobbledRef.current = false;
        scrobbleThresholdReachedRef.current = false;
        // Set cooldown to prevent timeupdate from re-triggering crossfade
        // on the still-ending current song before nextSong() takes effect
        crossfadeAbortedAtRef.current = Date.now();
        // Just advance the queue — the useEffect watching currentSongIndex
        // will handle loading and playing the next song on the active deck.
        // Do NOT manually set activeDeck.src here: that races with the effect
        // and causes "The operation was aborted" errors + song skips.
        nextSong();
      }
    },
    canPlayHandlerRef,
    errorHandlerRef,
  });

  // Stall recovery hook (uses shared crossfadeInProgressRef)
  const {
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

  // Audio event listeners for BOTH decks
  useEffect(() => {
    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB) return;

    // Helper to check if a deck has a real song (not silent data URL)
    const hasRealSong = (d: HTMLAudioElement) =>
      d.src && d.src.indexOf('data:audio') === -1;

    // Create handlers that check if the event came from the active deck
    const createUpdateTime = (deck: HTMLAudioElement, deckName: 'A' | 'B') => () => {
      // CRITICAL FIX: If this deck is playing with progress but isn't marked as active,
      // auto-correct activeDeckRef. This can happen after crossfade or component remount.
      if (activeDeckRef.current !== deckName) {
        if (!deck.paused && deck.currentTime > 1 && hasRealSong(deck) && !crossfadeInProgressRef.current) {
          console.log(`⚠️ [DESYNC] Deck ${deckName} is playing at ${deck.currentTime.toFixed(1)}s but activeDeckRef=${activeDeckRef.current} - auto-correcting`);
          activeDeckRef.current = deckName;
        } else {
          return; // Not the active deck and not a desync situation
        }
      }

      setCurrentTime(deck.currentTime);

      // Keep the playback snapshot up-to-date so handleNextSong can read the
      // real position even after the deck has been reassigned on a rapid skip.
      playbackSnapshotRef.current = { currentTime: deck.currentTime, duration: deck.duration || 0, songId: currentSongIdRef.current };

      // CRITICAL: Always update lastProgressValueRef for recovery purposes
      // This ensures we have the correct position even if watchdog isn't running
      if (deck.currentTime > 0 && !deck.paused) {
        lastProgressTimeRef.current = Date.now();
        lastProgressValueRef.current = deck.currentTime;
      }

      // Use the audio element's duration when finite, otherwise fall back
      // to the store's metadata duration (set from song metadata at load time).
      // Transcoded/chunked streams report Infinity because there's no Content-Length.
      const storeDuration = useAudioStore.getState().duration;
      const effectiveDuration = (isFinite(deck.duration) && deck.duration > 0)
        ? deck.duration
        : (storeDuration > 0 ? storeDuration : 0);

      if (effectiveDuration > 0 && currentSong) {
        const playedPercentage = (deck.currentTime / effectiveDuration) * 100;
        if (playedPercentage >= 50 && !scrobbleThresholdReachedRef.current) {
          scrobbleThresholdReachedRef.current = true;
        }

        // CROSSFADE: Check if we should start crossfade
        const timeRemaining = effectiveDuration - deck.currentTime;
        const xfadeDuration = useAudioStore.getState().crossfadeDuration;

        // Cooldown: don't re-trigger crossfade within 10s of an abort
        // (the abort already called nextSong — the old deck is finishing its last moments)
        const crossfadeCooldownActive = Date.now() - crossfadeAbortedAtRef.current < 10000;

        if (xfadeDuration > 0 && timeRemaining <= xfadeDuration && timeRemaining > 0.5 && !crossfadeInProgressRef.current && !crossfadeCooldownActive) {
          const nextIndex = (currentSongIndex + 1) % playlist.length;
          const nextSongData = playlist[nextIndex] as Song;

          if (nextSongData && playlist.length > 1) {
            startCrossfade(nextSongData, xfadeDuration);
          }
        }

        // SAFETY NET: When audio duration is Infinity (chunked/transcoded stream)
        // but we have metadata duration, detect end-of-song and advance manually.
        // The browser won't fire 'ended' when duration is Infinity.
        if (!isFinite(deck.duration) && timeRemaining <= 0.5 && !crossfadeInProgressRef.current) {
          console.log(`⏭️ [INFINITY] Song reached metadata duration (${effectiveDuration.toFixed(1)}s) with Infinity audio duration — triggering end-of-song`);
          deck.pause();
          nextSong();
        }
      }
    };

    const createUpdateDuration = (deck: HTMLAudioElement, deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;
      // Guard against Infinity duration from streaming audio where content-length
      // is unknown. Keep the metadata duration from loadSong instead.
      if (!isFinite(deck.duration) || deck.duration <= 0) return;
      setDuration(deck.duration);
    };

    const createOnCanPlay = (deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;
      setIsLoading(false);
    };

    const createOnWaiting = (deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;
      setIsLoading(true);
    };

    // Stalled event handler
    const lastStalledTimeRef = { current: 0 };
    const createOnStalled = (deck: HTMLAudioElement, deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;
      if (deck.paused) return;
      if (deck.currentTime < 2) return;
      if (crossfadeInProgressRef.current) return;

      const now = Date.now();
      if (now - lastStalledTimeRef.current < 10000) return;
      lastStalledTimeRef.current = now;

      const bufferedEnd = deck.buffered.length > 0
        ? deck.buffered.end(deck.buffered.length - 1)
        : 0;

      if (deck.currentTime >= bufferedEnd - 1) {
        console.log(`🔴 [STALLED EVENT] Deck ${deckName} genuinely stalled at ${deck.currentTime.toFixed(1)}s`);
        attemptStallRecovery(deck, 'stalled-event');
      }
    };

    const createOnEnded = (deck: HTMLAudioElement, deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;

      // Ignore ENDED events for very short audio (e.g., silent data URL)
      if (deck.duration && deck.duration < 5) {
        console.log(`[MOBILE] Ignoring ended event for short audio`);
        deck.pause();
        deck.currentTime = 0;
        return;
      }

      // If crossfade already handled the transition, skip
      if (crossfadeInProgressRef.current) {
        console.log(`[XFADE] onEnded fired but crossfade in progress, skipping`);
        return;
      }

      // If a crossfade abort just handled the transition, skip
      // (the abort already called nextSong — this ended event is for the old deck)
      if (Date.now() - crossfadeAbortedAtRef.current < 3000) {
        console.log(`[XFADE] onEnded fired but crossfade abort recently handled transition, skipping`);
        return;
      }

      if (currentSongIdRef.current && !hasScrobbledRef.current && currentSong) {
        hasScrobbledRef.current = true;
        scrobbleSong(currentSongIdRef.current, true)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['most-played-songs'] });
            queryClient.invalidateQueries({ queryKey: ['top-artists'] });
          })
          .catch(console.error);

        // Record in listening history
        recordListeningHistory(currentSong, currentSongIdRef.current, deck.currentTime, deck.duration);
      }

      // Let the useEffect watching currentSongIndex handle loading the next song.
      // Don't manually set deck.src here — it races with the effect and causes
      // "The operation was aborted" errors.
      nextSong();
    };

    // Create handlers for each deck
    const updateTimeA = createUpdateTime(deckA, 'A');
    const updateTimeB = createUpdateTime(deckB, 'B');
    const updateDurationA = createUpdateDuration(deckA, 'A');
    const updateDurationB = createUpdateDuration(deckB, 'B');
    const onCanPlayA = createOnCanPlay('A');
    const onCanPlayB = createOnCanPlay('B');
    const onWaitingA = createOnWaiting('A');
    const onWaitingB = createOnWaiting('B');
    const onStalledA = createOnStalled(deckA, 'A');
    const onStalledB = createOnStalled(deckB, 'B');
    const onEndedA = createOnEnded(deckA, 'A');
    const onEndedB = createOnEnded(deckB, 'B');

    // Register listeners on both decks
    deckA.addEventListener('timeupdate', updateTimeA);
    deckA.addEventListener('loadedmetadata', updateDurationA);
    deckA.addEventListener('durationchange', updateDurationA);
    deckA.addEventListener('canplay', onCanPlayA);
    deckA.addEventListener('waiting', onWaitingA);
    deckA.addEventListener('stalled', onStalledA);
    deckA.addEventListener('ended', onEndedA);

    deckB.addEventListener('timeupdate', updateTimeB);
    deckB.addEventListener('loadedmetadata', updateDurationB);
    deckB.addEventListener('durationchange', updateDurationB);
    deckB.addEventListener('canplay', onCanPlayB);
    deckB.addEventListener('waiting', onWaitingB);
    deckB.addEventListener('stalled', onStalledB);
    deckB.addEventListener('ended', onEndedB);

    // Set initial volume — use masterGain when Web Audio is initialized, else element.volume
    if (webAudioInitialized) {
      setMasterVolume(volume);
    } else {
      const activeDeck = getActiveDeck();
      if (activeDeck && !crossfadeInProgressRef.current) {
        activeDeck.volume = volume;
      }
    }

    return () => {
      deckA.removeEventListener('timeupdate', updateTimeA);
      deckA.removeEventListener('loadedmetadata', updateDurationA);
      deckA.removeEventListener('durationchange', updateDurationA);
      deckA.removeEventListener('canplay', onCanPlayA);
      deckA.removeEventListener('waiting', onWaitingA);
      deckA.removeEventListener('stalled', onStalledA);
      deckA.removeEventListener('ended', onEndedA);

      deckB.removeEventListener('timeupdate', updateTimeB);
      deckB.removeEventListener('loadedmetadata', updateDurationB);
      deckB.removeEventListener('durationchange', updateDurationB);
      deckB.removeEventListener('canplay', onCanPlayB);
      deckB.removeEventListener('waiting', onWaitingB);
      deckB.removeEventListener('stalled', onStalledB);
      deckB.removeEventListener('ended', onEndedB);
    };
  }, [volume, currentSongIndex, setCurrentTime, setDuration, nextSong, currentSong, queryClient, startCrossfade, getActiveDeck, playlist, attemptStallRecovery, deckARef, deckBRef, activeDeckRef, crossfadeInProgressRef, lastProgressTimeRef, lastProgressValueRef, webAudioInitialized, setMasterVolume, setGainImmediate]);

  // Load song when it changes
  /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect -- loading state is set during async song load/recovery */
  useEffect(() => {
    if (playlist.length > 0 && currentSongIndex >= 0 && currentSongIndex < playlist.length) {
      const song = playlist[currentSongIndex] as Song;
      const audio = getActiveDeck();

      // Skip if crossfade is in progress
      if (crossfadeInProgressRef.current) {
        console.log(`[XFADE] Skipping loadSong - crossfade in progress`);
        return;
      }

      // Skip if crossfade just completed
      if (crossfadeJustCompletedRef.current) {
        console.log(`[XFADE] Skipping loadSong - crossfade just completed`);
        return;
      }

      // Skip if song ID already matches AND audio actually has data loaded
      if (audio && song && currentSongIdRef.current === song.id) {
        if (audio.readyState > 0) {
          console.log(`[MOBILE] Skipping loadSong - already loaded`);
          return;
        }

        // Check if we have saved progress to recover to
        const storeState = useAudioStore.getState();
        const savedProgress = lastProgressValueRef.current > 0
          ? lastProgressValueRef.current
          : storeState.currentTime;

        // If no saved progress, this is a new song load (not recovery) - let loadSong handle it
        if (savedProgress <= 0) {
          console.log(`[NETWORK] Song ID matches but no saved progress - this is a new song load, skipping recovery`);
          // Fall through to normal loadSong path below
        } else {
          // RECOVERY: Browser reclaimed audio resources while tab was backgrounded
          const wasPlaying = storeState.isPlaying;
          console.log(`[NETWORK] Song ID matches but audio empty (readyState=${audio.readyState}) - recovering to ${savedProgress.toFixed(1)}s (wasPlaying=${wasPlaying})`);

          if (canPlayHandlerRef.current) {
            audio.removeEventListener('canplay', canPlayHandlerRef.current);
          }
          if (errorHandlerRef.current) {
            audio.removeEventListener('error', errorHandlerRef.current);
          }

          const recoveryCanPlay = () => {
            audio.removeEventListener('canplay', recoveryCanPlay);
            setIsLoading(false);
            if (savedProgress > 0) {
              audio.currentTime = savedProgress;
              // Update lastProgressValueRef so it has the correct position after recovery
              lastProgressValueRef.current = savedProgress;
              lastProgressTimeRef.current = Date.now();
            }
            if (wasPlaying) {
              ensureGraphInitializedRef.current();
              audio.play()
                .then(() => {
                  console.log(`[NETWORK] Recovery successful - resumed at ${savedProgress.toFixed(1)}s`);
                  setIsPlaying(true);
                })
                .catch(() => setIsPlaying(false));
            }
          };

          canPlayHandlerRef.current = recoveryCanPlay;
          // Listener is cleaned up via canPlayHandlerRef in the unmount effect
          // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
          audio.addEventListener('canplay', recoveryCanPlay);
          setIsLoading(true);
          // eslint-disable-next-line react-hooks/immutability -- DOM element property, not React state
          audio.src = song.url;
          audio.load();
          return;
        }
      }

      // REMOUNT RECOVERY: Check if either deck already has this song loaded
      const deckA = deckARef.current;
      const deckB = deckBRef.current;
      const deckAHasSong = deckA && deckA.currentTime > 0 && deckA.src?.includes(song.id);
      const deckBHasSong = deckB && deckB.currentTime > 0 && deckB.src?.includes(song.id);

      if (deckAHasSong || deckBHasSong) {
        const correctDeck = deckAHasSong ? 'A' : 'B';
        console.log(`[REMOUNT] Skipping loadSong - Deck ${correctDeck} already has this song`);
        currentSongIdRef.current = song.id;
        if (activeDeckRef.current !== correctDeck) {
          activeDeckRef.current = correctDeck;
        }
        return;
      }

      if (audio && song && currentSongIdRef.current !== song.id) {
        // Remove old handlers
        if (canPlayHandlerRef.current) {
          audio.removeEventListener('canplay', canPlayHandlerRef.current);
        }
        if (errorHandlerRef.current) {
          audio.removeEventListener('error', errorHandlerRef.current);
        }

        // REHYDRATION RECOVERY: On full page reload, _rehydratedCurrentTime holds
        // the persisted position before any effect overwrites it. If > 0, this is
        // a reload (not a user song change) — skip loadSong (which would setCurrentTime(0))
        // and instead set up the audio element directly with a canplay seek.
        const rehydratedTime = useAudioStore.getState()._rehydratedCurrentTime;
        if (rehydratedTime > 0) {
          // Clear immediately so this only fires once (not on subsequent song changes)
          useAudioStore.setState({ _rehydratedCurrentTime: 0 });

          const shouldResume = useAudioStore.getState().pendingPlaybackResume;
          console.log(`🔄 [REHYDRATION] Recovery path: seeking to ${rehydratedTime.toFixed(1)}s, resume=${shouldResume}`);

          const rehydrationCanPlay = () => {
            audio.removeEventListener('canplay', rehydrationCanPlay);
            setIsLoading(false);

            // Seek to the rehydrated position, clamped to actual duration
            if (rehydratedTime > 0 && isFinite(rehydratedTime)) {
              const seekTo = isFinite(audio.duration) && audio.duration > 0
                ? Math.min(rehydratedTime, audio.duration - 0.5)
                : rehydratedTime;
              audio.currentTime = seekTo;
              setCurrentTime(seekTo);
            }

            // Auto-resume if playback was active before unload
            if (shouldResume) {
              ensureGraphInitializedRef.current();
              audio.play()
                .then(() => {
                  setIsPlaying(true);
                  useAudioStore.setState({ pendingPlaybackResume: false });
                  console.log(`🔄 [REHYDRATION] Resumed playback at ${rehydratedTime.toFixed(1)}s`);
                })
                .catch(() => {
                  setIsPlaying(false);
                  useAudioStore.setState({ pendingPlaybackResume: false });
                });
            } else {
              useAudioStore.setState({ pendingPlaybackResume: false });
            }
          };

          const rehydrationError = (e: Event) => {
            const errorDeck = e.target as HTMLAudioElement;
            console.error('🔄 [REHYDRATION] Audio load error:', errorDeck?.error);
            audio.removeEventListener('canplay', rehydrationCanPlay);
            setIsLoading(false);
            useAudioStore.setState({ pendingPlaybackResume: false });
          };

          canPlayHandlerRef.current = rehydrationCanPlay;
          errorHandlerRef.current = rehydrationError;
          // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
          audio.addEventListener('canplay', rehydrationCanPlay);
          // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
          audio.addEventListener('error', rehydrationError);

          // Initialize refs with the recovered position
          currentSongIdRef.current = song.id;
          playbackSnapshotRef.current = { currentTime: rehydratedTime, duration: 0, songId: song.id };
          lastProgressValueRef.current = rehydratedTime;
          hasScrobbledRef.current = false;
          scrobbleThresholdReachedRef.current = false;

          // Load audio directly (skip loadSong which would setCurrentTime(0))
          setIsLoading(true);
          clearCrossfade();
          // eslint-disable-next-line -- audio.src is a DOM property assignment, not hook state mutation
          audio.src = song.url;
          audio.load();
          return;
        }

        const handleCanPlay = () => {
          setIsLoading(false);
          consecutiveFailuresRef.current = 0;
          if (useAudioStore.getState().isPlaying) {
            ensureGraphInitializedRef.current();
            audio.play().catch(console.error);
          }
        };

        const handleError = (e: Event) => {
          const errorDeck = e.target as HTMLAudioElement;
          const activeDeck = getActiveDeck();
          if (errorDeck !== activeDeck) return;
          console.error('Audio load error:', errorDeck?.error);
          setIsLoading(false);

          consecutiveFailuresRef.current++;
          const state = useAudioStore.getState();
          const failedSong = state.playlist[state.currentSongIndex];
          const songName = failedSong?.title || failedSong?.name || 'Unknown';
          const artistName = failedSong?.artist || '';

          if (consecutiveFailuresRef.current > 5) {
            toast.error('Multiple songs unavailable — stopping playback');
            console.error('[PLAYER] Too many consecutive failures, stopping');
            setIsPlaying(false);
            consecutiveFailuresRef.current = 0;
            return;
          }

          toast.warning(`Skipped "${songName}"${artistName ? ` by ${artistName}` : ''} — unavailable`);
          if (state.playlist.length > 1) {
            console.warn(`[PLAYER] Stream failed for "${songName}", removing from queue`);
            state.removeFromQueue(state.currentSongIndex);
          }
        };

        canPlayHandlerRef.current = handleCanPlay;
        errorHandlerRef.current = handleError;

        // Listeners are cleaned up via refs in the unmount effect below
        // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
        audio.addEventListener('canplay', handleCanPlay);
        // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
        audio.addEventListener('error', handleError);
        setIsLoading(true);
        loadSong(song);

        return () => {
          if (scrobbleThresholdReachedRef.current && !hasScrobbledRef.current && currentSongIdRef.current) {
            hasScrobbledRef.current = true;
            scrobbleSong(currentSongIdRef.current, true).catch(console.error);
          }
        };
      }
    }
  }, [currentSongIndex, playlist, loadSong, getActiveDeck, setIsPlaying, setCurrentTime, clearCrossfade, crossfadeInProgressRef, crossfadeJustCompletedRef, deckARef, deckBRef, activeDeckRef, lastProgressTimeRef, lastProgressValueRef]);
  /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */

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
    onPreviousTrack: previousSong,
    onNextTrack: handleNextSong,
  });

  usePlayerKeyboardShortcuts({
    togglePlayPause,
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
  });

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

      // SAFETY CHECK: If inactive deck is playing unexpectedly, stop it
      if (inactive && !inactive.paused && !crossfadeInProgressRef.current) {
        console.warn(`⚠️ [SAFETY] Deck ${inactiveDeckLabel} playing unexpectedly - stopping it`);
        inactive.pause();
        inactive.currentTime = 0;
        setGainImmediate(inactiveDeckLabel, 0);
        inactive.src = SILENT_AUDIO_DATA_URL;
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
            <AlbumArt
              albumId={currentSong.albumId}
              songId={currentSong.id}
              artist={currentSong.artist}
              size="sm"
              isPlaying={isPlaying || isRemotePlaying}
            />

            {/* Song Info */}
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium text-sm truncate", showRemoteTime && "text-green-500")}>{currentSong.name || currentSong.title}</p>
              <p className={cn("text-xs truncate", showRemoteTime ? "text-green-500/70" : "text-muted-foreground")}>{currentSong.artist || 'Unknown'}</p>
              {showRemoteTime && (
                <p className="flex items-center gap-1 text-[10px] text-green-500/60 mt-0.5">
                  <Smartphone className="h-2.5 w-2.5" />
                  <span className="truncate">{remoteDevice?.deviceName || 'Another device'}</span>
                </p>
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
              onClick={previousSong}
            >
              <SkipBack className="h-4 w-4" />
            </Button>

            <Button
              variant="default"
              size="sm"
              className="h-10 w-10 p-0 rounded-full"
              onClick={togglePlayPause}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleNextSong}
            >
              <SkipForward className="h-4 w-4" />
            </Button>

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

            <AIDJToggle compact />
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
          {/* Mini Album Art */}
          <AlbumArt
            albumId={currentSong.albumId}
            songId={currentSong.id}
            artist={currentSong.artist}
            size="md"
            isPlaying={isPlaying || isRemotePlaying}
            className="rounded-md"
          />
          <div className="min-w-0">
            <p className={cn("font-medium truncate text-sm", showRemoteTime && "text-green-500")}>{currentSong.name || currentSong.title}</p>
            <p className={cn("text-xs truncate", showRemoteTime ? "text-green-500/70" : "text-muted-foreground")}>{currentSong.artist || 'Unknown'}</p>
            {showRemoteTime && (
              <p className="flex items-center gap-1 text-[10px] text-green-500/60 mt-0.5">
                <Smartphone className="h-2.5 w-2.5" />
                <span className="truncate">{remoteDevice?.deviceName || 'Another device'}</span>
              </p>
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
              onClick={previousSong}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-10 w-10 p-0 rounded-full"
              onClick={togglePlayPause}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleNextSong}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground"
            >
              <Repeat className="h-4 w-4" />
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
    </>
  );
}
