import { useRef, useCallback } from 'react';
import { useAudioStore } from '@/lib/stores/audio';
import { SILENT_AUDIO_DATA_URL, Song } from './useDualDeckAudio';

export interface UseCrossfadeOptions {
  getActiveDeck: () => HTMLAudioElement | null;
  getInactiveDeck: () => HTMLAudioElement | null;
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  crossfadeInProgressRef: React.MutableRefObject<boolean>; // Shared ref from parent
  onCrossfadeComplete: (nextSong: Song) => void;
  onCrossfadeAbort: (nextSong: Song | null) => void;
  canPlayHandlerRef?: React.MutableRefObject<(() => void) | null>;
  errorHandlerRef?: React.MutableRefObject<((e: Event) => void) | null>;
}

export interface UseCrossfadeReturn {
  crossfadeJustCompletedRef: React.MutableRefObject<boolean>;
  targetVolumeRef: React.MutableRefObject<number>;
  startCrossfade: (nextSongData: Song, xfadeDuration: number) => void;
  clearCrossfade: () => void;
  resetCrossfadeState: () => void;
}

/**
 * Manages the dual-deck crossfade system with equal power curves.
 *
 * Key features:
 * - Preloads next song on inactive deck
 * - Fades between decks using equal power curves (cosine/sine)
 * - Handles abort scenarios (user pause, playback failure)
 * - Swaps active deck when crossfade completes
 * - Safety timeouts for iOS throttled intervals
 */
export function useCrossfade({
  getActiveDeck,
  getInactiveDeck,
  activeDeckRef,
  crossfadeInProgressRef, // Shared ref from parent
  onCrossfadeComplete,
  onCrossfadeAbort,
  canPlayHandlerRef,
  errorHandlerRef,
}: UseCrossfadeOptions): UseCrossfadeReturn {
  // Crossfade state refs (crossfadeInProgressRef is provided by parent for sharing with other hooks)
  const crossfadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const crossfadeCanPlayFiredRef = useRef<boolean>(false);
  const crossfadeJustCompletedRef = useRef<boolean>(false);
  const nextSongPreloadedRef = useRef<boolean>(false);
  const targetVolumeRef = useRef<number>(1);

  // Clear the crossfade interval if running
  const clearCrossfade = useCallback(() => {
    if (crossfadeIntervalRef.current) {
      clearInterval(crossfadeIntervalRef.current);
      crossfadeIntervalRef.current = null;
    }
  }, []);

  // Reset crossfade state for a new song
  const resetCrossfadeState = useCallback(() => {
    crossfadeInProgressRef.current = false;
    crossfadeCanPlayFiredRef.current = false;
    nextSongPreloadedRef.current = false;
  }, []);

  // Start true crossfade between decks
  const startCrossfade = useCallback((nextSongData: Song, xfadeDuration: number) => {
    if (crossfadeInProgressRef.current || !nextSongData) return;

    const activeDeck = getActiveDeck();
    const inactiveDeck = getInactiveDeck();
    if (!activeDeck || !inactiveDeck) return;

    // Clear any existing interval (safety check)
    clearCrossfade();

    console.log(`🔀 [XFADE] Starting TRUE crossfade, duration=${xfadeDuration}s, from deck ${activeDeckRef.current}`);
    crossfadeInProgressRef.current = true;
    crossfadeCanPlayFiredRef.current = false;
    targetVolumeRef.current = activeDeck.volume > 0 ? activeDeck.volume : 1;

    // Preload and start the next song on inactive deck
    inactiveDeck.src = nextSongData.url;
    inactiveDeck.load();
    inactiveDeck.volume = 0;

    // Helper to abort crossfade and reset state
    const abortCrossfade = (reason: string) => {
      console.warn(`⚠️ [XFADE] Aborting crossfade: ${reason}`);
      inactiveDeck.removeEventListener('canplaythrough', onCanPlayThrough);
      clearCrossfade();
      crossfadeInProgressRef.current = false;
      crossfadeCanPlayFiredRef.current = false;

      // Restore active deck volume
      activeDeck.volume = targetVolumeRef.current;

      // Reset inactive deck to clean state
      inactiveDeck.pause();
      inactiveDeck.currentTime = 0;
      inactiveDeck.volume = 0;
      inactiveDeck.src = SILENT_AUDIO_DATA_URL;

      console.log(`⚠️ [XFADE] Abort cleanup complete - active deck remains ${activeDeckRef.current}`);

      // Notify callback for fallback transition if needed
      const songHasEnded = activeDeck.duration > 0 &&
        (activeDeck.currentTime >= activeDeck.duration - 0.5 || activeDeck.ended);

      if (songHasEnded) {
        onCrossfadeAbort(nextSongData);
      }
    };

    // Wait for inactive deck to be ready, then start crossfade
    const onCanPlayThrough = () => {
      // Guard: only fire once per crossfade
      if (crossfadeCanPlayFiredRef.current) {
        console.log(`[XFADE] canplaythrough already fired, ignoring duplicate`);
        return;
      }
      crossfadeCanPlayFiredRef.current = true;
      inactiveDeck.removeEventListener('canplaythrough', onCanPlayThrough);
      console.log(`[XFADE] Inactive deck ready, starting playback and crossfade`);

      // Start playing the next song - CRITICAL: handle failure on mobile
      inactiveDeck.play()
        .then(() => {
          console.log(`[XFADE] Inactive deck play() succeeded, starting crossfade interval`);

          const fadeStartTime = Date.now();
          crossfadeIntervalRef.current = setInterval(() => {
            // Check if user paused - abort crossfade and pause both decks
            const storeState = useAudioStore.getState();
            if (!storeState.isPlaying && crossfadeInProgressRef.current) {
              console.log('[XFADE] User paused during crossfade - aborting');
              activeDeck.pause();
              inactiveDeck.pause();
              abortCrossfade('user paused');
              return;
            }

            // Safety check: if inactive deck stopped playing mid-crossfade, abort
            if (inactiveDeck.paused && crossfadeInProgressRef.current) {
              abortCrossfade('inactive deck stopped playing');
              return;
            }

            const elapsed = (Date.now() - fadeStartTime) / 1000;
            const fadeProgress = Math.min(elapsed / xfadeDuration, 1);

            // Equal power crossfade curves
            const fadeOutVolume = Math.cos(fadeProgress * Math.PI / 2) * targetVolumeRef.current;
            const fadeInVolume = Math.sin(fadeProgress * Math.PI / 2) * targetVolumeRef.current;

            activeDeck.volume = Math.max(0, fadeOutVolume);
            inactiveDeck.volume = Math.min(targetVolumeRef.current, fadeInVolume);

            // Debug log every second
            if (Math.floor(elapsed) > Math.floor(elapsed - 0.06)) {
              console.log(`[XFADE] Progress: ${Math.round(fadeProgress * 100)}%, active vol=${activeDeck.volume.toFixed(3)}, incoming vol=${inactiveDeck.volume.toFixed(3)}`);
            }

            if (fadeProgress >= 1) {
              completeCrossfade(activeDeck, inactiveDeck, nextSongData);
            }
          }, 50);
        })
        .catch((err) => {
          console.error(`❌ [XFADE] Inactive deck play() FAILED: ${err.name} - ${err.message}`);
          abortCrossfade('play() failed - likely autoplay blocked');
        });
    };

    // Helper to complete crossfade
    const completeCrossfade = (oldDeck: HTMLAudioElement, newDeck: HTMLAudioElement, song: Song) => {
      clearCrossfade();

      // Stop the old deck completely
      oldDeck.pause();
      oldDeck.currentTime = 0;

      // Swap active deck
      activeDeckRef.current = activeDeckRef.current === 'A' ? 'B' : 'A';
      newDeck.volume = targetVolumeRef.current;

      console.log(`[XFADE] Crossfade complete, active deck is now ${activeDeckRef.current}`);

      // Sync Media Session
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }

      // Remove canplay/error handlers from old deck BEFORE changing its source
      if (canPlayHandlerRef?.current) {
        oldDeck.removeEventListener('canplay', canPlayHandlerRef.current);
      }
      if (errorHandlerRef?.current) {
        oldDeck.removeEventListener('error', errorHandlerRef.current);
      }

      // Clear the old deck's source IMMEDIATELY
      oldDeck.src = SILENT_AUDIO_DATA_URL;
      oldDeck.pause();
      console.log(`[XFADE] Cleared old deck source to prevent accidental playback`);

      // Mark crossfade as just completed
      crossfadeJustCompletedRef.current = true;

      // Update state
      crossfadeInProgressRef.current = false;
      nextSongPreloadedRef.current = false;

      // Notify callback
      onCrossfadeComplete(song);

      // Reset the "just completed" flag after a short delay
      setTimeout(() => {
        crossfadeJustCompletedRef.current = false;
      }, 100);

      // Reinforce Media Session state after cleanup events settle
      if ('mediaSession' in navigator) {
        for (const delay of [500, 1500, 3000]) {
          setTimeout(() => {
            const currentActive = getActiveDeck();
            if (currentActive && !currentActive.paused) {
              navigator.mediaSession.playbackState = 'playing';
            }
          }, delay);
        }
      }
    };

    inactiveDeck.addEventListener('canplaythrough', onCanPlayThrough);

    // Timeout fallback in case canplaythrough doesn't fire
    setTimeout(() => {
      if (!crossfadeInProgressRef.current || crossfadeCanPlayFiredRef.current) return;
      if (inactiveDeck.readyState >= 3) {
        console.log(`[XFADE] Timeout fallback: forcing canplaythrough`);
        onCanPlayThrough();
      } else {
        abortCrossfade('timeout - deck never became ready');
      }
    }, 5000);

    // Safety timeout: if crossfade is still in progress after duration + 5s
    setTimeout(() => {
      if (!crossfadeInProgressRef.current) return;

      // Check if incoming deck is playing and has progressed
      if (!inactiveDeck.paused && inactiveDeck.currentTime > 1) {
        console.log(`[XFADE] Safety timeout: incoming deck playing at ${inactiveDeck.currentTime.toFixed(1)}s - completing crossfade`);
        completeCrossfade(activeDeck, inactiveDeck, nextSongData);
      } else {
        console.warn(`⚠️ [XFADE] Safety timeout: incoming deck not playing - aborting`);
        abortCrossfade('safety timeout exceeded');
      }
    }, (xfadeDuration + 5) * 1000);
  }, [getActiveDeck, getInactiveDeck, activeDeckRef, crossfadeInProgressRef, onCrossfadeComplete, onCrossfadeAbort, clearCrossfade, canPlayHandlerRef, errorHandlerRef]);

  return {
    crossfadeJustCompletedRef,
    targetVolumeRef,
    startCrossfade,
    clearCrossfade,
    resetCrossfadeState,
  };
}
