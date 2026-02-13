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
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query';

// Import extracted hooks
import { useDualDeckAudio, Song, SILENT_AUDIO_DATA_URL } from '@/lib/hooks/useDualDeckAudio';
import { useCrossfade } from '@/lib/hooks/useCrossfade';
import { useStallRecovery } from '@/lib/hooks/useStallRecovery';
import { useMediaSession } from '@/lib/hooks/useMediaSession';
import { usePlayerKeyboardShortcuts } from '@/lib/hooks/usePlayerKeyboardShortcuts';
import { usePlaybackStateSync } from '@/lib/hooks/usePlaybackStateSync';

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
  // Dual-deck audio system
  const {
    deckARef,
    deckBRef,
    activeDeckRef,
    decksPrimedRef,
    isPrimingRef,
    getActiveDeck,
    getInactiveDeck,
    primeBothDecks,
  } = useDualDeckAudio();

  // Scrobble tracking refs
  const hasScrobbledRef = useRef<boolean>(false);
  const scrobbleThresholdReachedRef = useRef<boolean>(false);
  const currentSongIdRef = useRef<string | null>(null);

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
    crossfadeDuration,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
    nextSong,
    previousSong,
    toggleShuffle,
    setAIUserActionInProgress,
  } = useAudioStore();

  const currentSong = useMemo(() => playlist[currentSongIndex] || null, [playlist, currentSongIndex]) as Song | null;
  const queryClient = useQueryClient();

  // Shared crossfade state ref - created here so it can be passed to both hooks
  const crossfadeInProgressRef = useRef<boolean>(false);

  // Crossfade hook (initialized first since stall recovery needs crossfadeInProgressRef)
  const {
    crossfadeJustCompletedRef,
    targetVolumeRef,
    startCrossfade,
    clearCrossfade,
    resetCrossfadeState,
  } = useCrossfade({
    getActiveDeck,
    getInactiveDeck,
    activeDeckRef,
    crossfadeInProgressRef, // Pass the shared ref
    onCrossfadeComplete: (song) => {
      currentSongIdRef.current = song.id;
      hasScrobbledRef.current = false;
      scrobbleThresholdReachedRef.current = false;
      nextSong();
    },
    onCrossfadeAbort: (song) => {
      if (song) {
        const activeDeck = getActiveDeck();
        if (activeDeck) {
          hasScrobbledRef.current = false;
          scrobbleThresholdReachedRef.current = false;
          currentSongIdRef.current = song.id;
          activeDeck.src = song.url;
          activeDeck.play().catch(err => {
            console.error('⚠️ [XFADE] Fallback transition play failed:', err);
          });
          nextSong();
        }
      }
    },
    canPlayHandlerRef,
    errorHandlerRef,
  });

  // Stall recovery hook (uses shared crossfadeInProgressRef)
  const {
    lastProgressTimeRef,
    lastProgressValueRef,
    checkAndResumeAudioContext,
    attemptStallRecovery,
    resetRecoveryState,
  } = useStallRecovery({
    getActiveDeck,
    crossfadeInProgressRef, // Now properly shared
    onMaxAttemptsReached: nextSong,
  });

  // Fetch feedback for current song
  const { data: feedbackData } = useSongFeedback(currentSong ? [currentSong.id] : []);

  // Determine if song is liked based on server state
  const isLiked = useMemo(() => {
    if (!currentSong?.id) return false;
    return feedbackData?.feedback?.[currentSong.id] === 'thumbs_up';
  }, [feedbackData?.feedback, currentSong?.id]);

  // Like/unlike mutation
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
    onSuccess: (liked) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() });
      toast.success(liked ? '❤️ Liked' : '💔 Unliked', { duration: 1500 });
    },
    onError: (error: Error) => {
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
      setDuration(0);
      hasScrobbledRef.current = false;
      scrobbleThresholdReachedRef.current = false;
      currentSongIdRef.current = song.id;
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
      } else {
        setIsLoading(true);

        // MOBILE FIX: Prime both decks on first user interaction
        if (!decksPrimedRef.current) {
          primeBothDecks();
        }

        audio.play().catch((e) => {
          setIsLoading(false);
          console.error('Play failed:', e);
        }).finally(() => setIsLoading(false));
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying, setIsPlaying, getActiveDeck, decksPrimedRef, primeBothDecks]);

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
    const activeDeck = getActiveDeck();
    if (activeDeck && !crossfadeInProgressRef.current) {
      activeDeck.volume = clampedVolume;
    }
    targetVolumeRef.current = clampedVolume;
  }, [setVolume, getActiveDeck, crossfadeInProgressRef, targetVolumeRef]);

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

      // CRITICAL: Always update lastProgressValueRef for recovery purposes
      // This ensures we have the correct position even if watchdog isn't running
      if (deck.currentTime > 0 && !deck.paused) {
        lastProgressTimeRef.current = Date.now();
        lastProgressValueRef.current = deck.currentTime;
      }

      if (deck.duration > 0 && currentSong) {
        const playedPercentage = (deck.currentTime / deck.duration) * 100;
        if (playedPercentage >= 50 && !scrobbleThresholdReachedRef.current) {
          scrobbleThresholdReachedRef.current = true;
        }

        // CROSSFADE: Check if we should start crossfade
        const timeRemaining = deck.duration - deck.currentTime;
        const xfadeDuration = useAudioStore.getState().crossfadeDuration;

        if (!isFinite(deck.duration)) return;

        if (xfadeDuration > 0 && timeRemaining <= xfadeDuration && timeRemaining > 0.5 && !crossfadeInProgressRef.current) {
          const nextIndex = (currentSongIndex + 1) % playlist.length;
          const nextSongData = playlist[nextIndex] as Song;

          if (nextSongData && playlist.length > 1) {
            startCrossfade(nextSongData, xfadeDuration);
          }
        }
      }
    };

    const createUpdateDuration = (deck: HTMLAudioElement, deckName: 'A' | 'B') => () => {
      if (activeDeckRef.current !== deckName) return;
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

      if (currentSongIdRef.current && !hasScrobbledRef.current && currentSong) {
        hasScrobbledRef.current = true;
        scrobbleSong(currentSongIdRef.current, true)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['most-played-songs'] });
            queryClient.invalidateQueries({ queryKey: ['top-artists'] });
          })
          .catch(console.error);

        // Record in listening history
        fetch('/api/listening-history/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId: currentSongIdRef.current,
            artist: currentSong.artist || 'Unknown',
            title: currentSong.name || currentSong.title || 'Unknown',
            album: currentSong.album,
            genre: currentSong.genre,
            duration: deck.duration,
            playDuration: deck.currentTime,
          }),
        }).catch(err => console.warn('Failed to record listening history:', err));
      }

      // MOBILE FIX: Load and play next song directly
      const nextIndex = (currentSongIndex + 1) % playlist.length;
      const nextSongData = playlist[nextIndex] as Song;

      if (nextSongData && playlist.length > 0) {
        console.log(`[MOBILE] Direct transition to next song: ${nextSongData.name || nextSongData.title}`);

        hasScrobbledRef.current = false;
        scrobbleThresholdReachedRef.current = false;
        currentSongIdRef.current = nextSongData.id;

        deck.src = nextSongData.url;
        deck.play().catch(err => {
          console.error('[MOBILE] Direct play failed:', err);
        });

        nextSong();
      } else {
        nextSong();
      }
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
    deckA.addEventListener('canplay', onCanPlayA);
    deckA.addEventListener('waiting', onWaitingA);
    deckA.addEventListener('stalled', onStalledA);
    deckA.addEventListener('ended', onEndedA);

    deckB.addEventListener('timeupdate', updateTimeB);
    deckB.addEventListener('loadedmetadata', updateDurationB);
    deckB.addEventListener('canplay', onCanPlayB);
    deckB.addEventListener('waiting', onWaitingB);
    deckB.addEventListener('stalled', onStalledB);
    deckB.addEventListener('ended', onEndedB);

    // Set initial volume on active deck if not crossfading
    const activeDeck = getActiveDeck();
    if (activeDeck && !crossfadeInProgressRef.current) {
      activeDeck.volume = volume;
    }

    return () => {
      deckA.removeEventListener('timeupdate', updateTimeA);
      deckA.removeEventListener('loadedmetadata', updateDurationA);
      deckA.removeEventListener('canplay', onCanPlayA);
      deckA.removeEventListener('waiting', onWaitingA);
      deckA.removeEventListener('stalled', onStalledA);
      deckA.removeEventListener('ended', onEndedA);

      deckB.removeEventListener('timeupdate', updateTimeB);
      deckB.removeEventListener('loadedmetadata', updateDurationB);
      deckB.removeEventListener('canplay', onCanPlayB);
      deckB.removeEventListener('waiting', onWaitingB);
      deckB.removeEventListener('stalled', onStalledB);
      deckB.removeEventListener('ended', onEndedB);
    };
  }, [volume, currentSongIndex, setCurrentTime, setDuration, nextSong, currentSong, queryClient, startCrossfade, getActiveDeck, playlist, attemptStallRecovery, deckARef, deckBRef, activeDeckRef, crossfadeInProgressRef]);

  // Load song when it changes
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
              audio.play()
                .then(() => {
                  console.log(`[NETWORK] Recovery successful - resumed at ${savedProgress.toFixed(1)}s`);
                  setIsPlaying(true);
                })
                .catch(() => setIsPlaying(false));
            }
          };

          canPlayHandlerRef.current = recoveryCanPlay;
          audio.addEventListener('canplay', recoveryCanPlay);
          setIsLoading(true);
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

        const handleCanPlay = () => {
          setIsLoading(false);
          if (useAudioStore.getState().isPlaying) {
            audio.play().catch(console.error);
          }
        };

        const handleError = (e: Event) => {
          const errorDeck = e.target as HTMLAudioElement;
          const activeDeck = getActiveDeck();
          if (errorDeck !== activeDeck) return;
          console.error('Audio load error:', errorDeck?.error);
          setIsLoading(false);
        };

        canPlayHandlerRef.current = handleCanPlay;
        errorHandlerRef.current = handleError;

        audio.addEventListener('canplay', handleCanPlay);
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
  }, [currentSongIndex, playlist, loadSong, getActiveDeck, setIsPlaying, crossfadeInProgressRef, crossfadeJustCompletedRef, deckARef, deckBRef, activeDeckRef]);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      [deckARef.current, deckBRef.current].forEach(audio => {
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
    isPrimingRef,
    onPreviousTrack: previousSong,
    onNextTrack: nextSong,
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
    checkAndResumeAudioContext,
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
        inactive.volume = 0;
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

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* Mobile Layout */}
      <div className="md:hidden px-3 py-2 space-y-2">
        {/* Progress bar at top */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">
            {formatTime(currentTime)}
          </span>
          <Slider
            value={[isFinite(currentTime) ? currentTime : 0]}
            max={isFinite(duration) && duration > 0 ? duration : 100}
            step={0.1}
            onValueChange={([newValue]) => seek(newValue)}
            className="flex-1 h-1"
          />
          <span className="text-[10px] font-mono text-muted-foreground w-8">
            -{formatTime(Math.max(0, duration - currentTime))}
          </span>
        </div>

        {/* Main row: Album art, song info, controls */}
        <div className="flex items-center gap-3">
          {/* Small Album Artwork */}
          <AlbumArt
            albumId={currentSong.albumId}
            songId={currentSong.id}
            artist={currentSong.artist}
            size="sm"
            isPlaying={isPlaying}
          />

          {/* Song Info */}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{currentSong.name || currentSong.title}</p>
            <p className="text-xs text-muted-foreground truncate">{currentSong.artist || 'Unknown'}</p>
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
              onClick={nextSong}
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
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Left: Song Info */}
        <div className="flex items-center gap-3 w-72 min-w-0">
          {/* Mini Album Art */}
          <AlbumArt
            albumId={currentSong.albumId}
            songId={currentSong.id}
            artist={currentSong.artist}
            size="md"
            isPlaying={isPlaying}
            className="rounded-md"
          />
          <div className="min-w-0">
            <p className="font-medium truncate text-sm">{currentSong.name || currentSong.title}</p>
            <p className="text-xs text-muted-foreground truncate">{currentSong.artist || 'Unknown'}</p>
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
              onClick={nextSong}
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
            <span className="text-xs text-muted-foreground w-10 text-right font-mono">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[isFinite(currentTime) ? currentTime : 0]}
              max={isFinite(duration) && duration > 0 ? duration : 100}
              step={0.1}
              onValueChange={([newValue]) => seek(newValue)}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-10 font-mono">
              -{formatTime(Math.max(0, duration - currentTime))}
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

      {/* Dual-Deck Audio Elements for crossfade */}
      <audio ref={deckARef} preload="metadata" crossOrigin="anonymous" className="hidden" />
      <audio ref={deckBRef} preload="metadata" crossOrigin="anonymous" className="hidden" />

      {/* Lyrics Modal */}
      <LyricsModal isOpen={showLyrics} onClose={() => setShowLyrics(false)} />

      {/* Visualizer Modal */}
      <VisualizerModal
        isOpen={showVisualizer}
        onClose={() => setShowVisualizer(false)}
        audioElement={getActiveDeck()}
      />
    </>
  );
}
