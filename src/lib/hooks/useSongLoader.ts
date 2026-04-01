import { useEffect } from 'react';
import { useAudioStore } from '@/lib/stores/audio';
import { scrobbleSong } from '@/lib/services/navidrome';
import { toast } from '@/lib/toast';
import { Song, type SetActiveDeckOptions } from './useDualDeckAudio';

export interface UseSongLoaderOptions {
  playlist: Song[];
  currentSongIndex: number;
  getActiveDeck: () => HTMLAudioElement | null;
  loadSong: (song: Song | null) => void;
  setActiveDeck: (deck: 'A' | 'B', reason: string, opts?: SetActiveDeckOptions) => boolean;
  crossfadeInProgressRef: React.MutableRefObject<boolean>;
  crossfadeJustCompletedRef: React.MutableRefObject<boolean>;
  deckARef: React.RefObject<HTMLAudioElement | null>;
  deckBRef: React.RefObject<HTMLAudioElement | null>;
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  lastProgressTimeRef: React.MutableRefObject<number>;
  lastProgressValueRef: React.MutableRefObject<number>;
  currentSongIdRef: React.MutableRefObject<string | null>;
  playbackSnapshotRef: React.MutableRefObject<{ currentTime: number; duration: number; songId: string | null }>;
  hasScrobbledRef: React.MutableRefObject<boolean>;
  scrobbleThresholdReachedRef: React.MutableRefObject<boolean>;
  canPlayHandlerRef: React.MutableRefObject<(() => void) | null>;
  errorHandlerRef: React.MutableRefObject<((e: Event) => void) | null>;
  ensureGraphInitializedRef: React.MutableRefObject<() => void>;
  consecutiveFailuresRef: React.MutableRefObject<number>;
  setIsPlaying: (v: boolean) => void;
  setIsLoading: (v: boolean) => void;
  setCurrentTime: (t: number) => void;
  clearCrossfade: () => void;
}

/**
 * Handles loading songs onto the active deck when currentSongIndex changes.
 *
 * Extracted from PlayerBar to reduce component size. Handles:
 * - Normal song loading via loadSong
 * - Network recovery (browser reclaimed audio resources)
 * - Remount recovery (deck already has the song loaded)
 * - Rehydration recovery (page reload with saved position)
 * - Error handling with consecutive failure tracking
 * - Scrobble cleanup on song change
 */
export function useSongLoader({
  playlist,
  currentSongIndex,
  getActiveDeck,
  loadSong,
  setActiveDeck,
  crossfadeInProgressRef,
  crossfadeJustCompletedRef,
  deckARef,
  deckBRef,
  activeDeckRef,
  lastProgressTimeRef,
  lastProgressValueRef,
  currentSongIdRef,
  playbackSnapshotRef,
  hasScrobbledRef,
  scrobbleThresholdReachedRef,
  canPlayHandlerRef,
  errorHandlerRef,
  ensureGraphInitializedRef,
  consecutiveFailuresRef,
  setIsPlaying,
  setIsLoading,
  setCurrentTime,
  clearCrossfade,
}: UseSongLoaderOptions): void {
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

          const recoveryError = (e: Event) => {
            const errorDeck = e.target as HTMLAudioElement;
            console.error('[NETWORK] Recovery audio load error:', errorDeck?.error);
            audio.removeEventListener('canplay', recoveryCanPlay);
            setIsLoading(false);
          };

          canPlayHandlerRef.current = recoveryCanPlay;
          errorHandlerRef.current = recoveryError;
          // Listeners are cleaned up via refs in the unmount effect
          // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
          audio.addEventListener('canplay', recoveryCanPlay);
          // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
          audio.addEventListener('error', recoveryError);
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
        setActiveDeck(correctDeck, `remount-recovery: deck ${correctDeck} has song`, { bypassCooldown: true });
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

        // Shared skip logic for error + load timeout
        const skipUnavailableSong = (reason: string) => {
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

          toast.warning(`Skipped "${songName}"${artistName ? ` by ${artistName}` : ''} — ${reason}`);
          if (state.playlist.length > 1) {
            console.warn(`[PLAYER] "${songName}" ${reason}, removing from queue`);
            state.removeFromQueue(state.currentSongIndex);
          }
        };

        let loadTimeoutId: ReturnType<typeof setTimeout> | null = null;

        const handleCanPlay = () => {
          if (loadTimeoutId) clearTimeout(loadTimeoutId);
          setIsLoading(false);
          consecutiveFailuresRef.current = 0;
          if (useAudioStore.getState().isPlaying) {
            ensureGraphInitializedRef.current();
            audio.play().catch(console.error);
          }
        };

        const handleError = (e: Event) => {
          if (loadTimeoutId) clearTimeout(loadTimeoutId);
          const errorDeck = e.target as HTMLAudioElement;
          const activeDeck = getActiveDeck();
          if (errorDeck !== activeDeck) return;
          console.error('Audio load error:', errorDeck?.error);
          skipUnavailableSong('unavailable');
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

        // Safety timeout: skip song if it doesn't load within 10 seconds.
        // Browser native error events can take 30+ seconds; this prevents
        // long silences that cause AudioContext suspension on mobile.
        loadTimeoutId = setTimeout(() => {
          if (audio.readyState < 2) {
            console.warn(`[PLAYER] Song load timeout (10s) — readyState=${audio.readyState}`);
            audio.removeEventListener('canplay', handleCanPlay);
            audio.removeEventListener('error', handleError);
            skipUnavailableSong('timed out');
          }
        }, 10000);

        return () => {
          if (loadTimeoutId) clearTimeout(loadTimeoutId);
          if (scrobbleThresholdReachedRef.current && !hasScrobbledRef.current && currentSongIdRef.current) {
            hasScrobbledRef.current = true;
            scrobbleSong(currentSongIdRef.current, true).catch(console.error);
          }
        };
      }
    }
  }, [currentSongIndex, playlist, loadSong, getActiveDeck, setIsPlaying, setCurrentTime, clearCrossfade, crossfadeInProgressRef, crossfadeJustCompletedRef, deckARef, deckBRef, activeDeckRef, lastProgressTimeRef, lastProgressValueRef, setActiveDeck, currentSongIdRef, playbackSnapshotRef, hasScrobbledRef, scrobbleThresholdReachedRef, canPlayHandlerRef, errorHandlerRef, ensureGraphInitializedRef, consecutiveFailuresRef, setIsLoading]);
  /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
}
