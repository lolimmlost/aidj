import { useRef, useCallback, useEffect } from 'react';
import { useAudioStore } from '@/lib/stores/audio';
import { Song, type SetActiveDeckOptions } from './useDualDeckAudio';

export interface UseCrossfadeOptions {
  getActiveDeck: () => HTMLAudioElement | null;
  getInactiveDeck: () => HTMLAudioElement | null;
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  crossfadeInProgressRef: React.MutableRefObject<boolean>; // Shared ref from parent
  crossfadeAbortedAtRef: React.MutableRefObject<number>; // Stamped on every abort; drives retry cooldown
  scheduleGainRamp: (deck: 'A' | 'B', target: number, durationSec: number, curve?: 'linear' | 'equalpower') => void;
  cancelGainRamp: (deck: 'A' | 'B') => void;
  setGainImmediate: (deck: 'A' | 'B', value: number) => void;
  getGainValue: (deck: 'A' | 'B') => number;
  resumeContext: () => Promise<boolean>;
  onCrossfadeComplete: (nextSong: Song) => void;
  onCrossfadeAbort: (nextSong: Song | null, isLoadFailure: boolean) => void;
  canPlayHandlerRef?: React.MutableRefObject<(() => void) | null>;
  errorHandlerRef?: React.MutableRefObject<((e: Event) => void) | null>;
  setActiveDeck: (deck: 'A' | 'B', reason: string, opts?: SetActiveDeckOptions) => boolean;
}

export interface UseCrossfadeReturn {
  crossfadeJustCompletedRef: React.MutableRefObject<boolean>;
  startCrossfade: (nextSongData: Song, xfadeDuration: number) => void;
  clearCrossfade: () => void;
  resetCrossfadeState: () => void;
}

/**
 * Manages the dual-deck crossfade system using Web Audio API GainNodes.
 *
 * Key features:
 * - Preloads next song on inactive deck
 * - Fades between decks using GainNode scheduling (runs on audio thread, immune to JS throttling)
 * - Uses equal power curves (sin²/cos²) for perceptual crossfade
 * - Handles abort scenarios (user pause, playback failure)
 * - Swaps active deck when crossfade completes
 * - Safety timeouts for edge cases
 */
export function useCrossfade({
  getActiveDeck,
  getInactiveDeck,
  activeDeckRef,
  crossfadeInProgressRef, // Shared ref from parent
  crossfadeAbortedAtRef,
  scheduleGainRamp,
  cancelGainRamp,
  setGainImmediate,
  getGainValue: _getGainValue,
  resumeContext,
  onCrossfadeComplete,
  onCrossfadeAbort,
  canPlayHandlerRef,
  errorHandlerRef,
  setActiveDeck,
}: UseCrossfadeOptions): UseCrossfadeReturn {
  // Stable refs for callbacks to avoid startCrossfade recreating on every render
  const onCrossfadeCompleteRef = useRef(onCrossfadeComplete);
  const onCrossfadeAbortRef = useRef(onCrossfadeAbort);
  useEffect(() => { onCrossfadeCompleteRef.current = onCrossfadeComplete; }, [onCrossfadeComplete]);
  useEffect(() => { onCrossfadeAbortRef.current = onCrossfadeAbort; }, [onCrossfadeAbort]);

  // Crossfade state refs
  const crossfadeCanPlayFiredRef = useRef<boolean>(false);
  const crossfadeJustCompletedRef = useRef<boolean>(false);
  const nextSongPreloadedRef = useRef<boolean>(false);
  const crossfadeCompletionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Store unsubscribe for pause detection during crossfade
  const pauseUnsubscribeRef = useRef<(() => void) | null>(null);

  // Clear the crossfade completion timeout if running
  const clearCrossfade = useCallback(() => {
    if (crossfadeCompletionTimeoutRef.current) {
      clearTimeout(crossfadeCompletionTimeoutRef.current);
      crossfadeCompletionTimeoutRef.current = null;
    }
    if (pauseUnsubscribeRef.current) {
      pauseUnsubscribeRef.current();
      pauseUnsubscribeRef.current = null;
    }
  }, []);

  // Reset crossfade state for a new song
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
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

    const activeDeckLabel = activeDeckRef.current;
    const inactiveDeckLabel = activeDeckLabel === 'A' ? 'B' : 'A';

    // Clear any existing timeout (safety check)
    clearCrossfade();

    // Ensure AudioContext is running before crossfade — it may have been
    // silently suspended by the browser (tab backgrounding, policy).
    // Without this, gain ramps schedule on a suspended context and produce silence.
    resumeContext();

    console.log(`🔀 [XFADE] Starting crossfade, duration=${xfadeDuration}s, from deck ${activeDeckLabel}`);
    crossfadeInProgressRef.current = true;
    crossfadeCanPlayFiredRef.current = false;

    // Preload and start the next song on inactive deck
    inactiveDeck.src = nextSongData.url;
    inactiveDeck.load();
    // Ensure inactive deck gain is at 0 before crossfade starts
    setGainImmediate(inactiveDeckLabel, 0);

    // Helper to abort crossfade and reset state
    const abortCrossfade = (reason: string) => {
      console.warn(`⚠️ [XFADE] Aborting crossfade: ${reason}`);
      // Stamp cooldown unconditionally so timeupdate doesn't immediately
      // re-enter startCrossfade on the next tick. Without this, autoplay-
      // blocked aborts thrash the inactive deck dozens of times per second.
      crossfadeAbortedAtRef.current = Date.now();
      inactiveDeck.removeEventListener('canplaythrough', onCanPlayThrough);
      clearCrossfade();
      crossfadeInProgressRef.current = false;
      crossfadeCanPlayFiredRef.current = false;

      // Cancel any gain ramps and restore gains
      cancelGainRamp(activeDeckLabel);
      cancelGainRamp(inactiveDeckLabel);
      setGainImmediate(activeDeckLabel, 1.0);
      setGainImmediate(inactiveDeckLabel, 0);

      // Reset inactive deck to clean state
      inactiveDeck.pause();
      inactiveDeck.currentTime = 0;
      inactiveDeck.removeAttribute('src');
      inactiveDeck.load();

      console.log(`⚠️ [XFADE] Abort cleanup complete - active deck remains ${activeDeckLabel}`);

      // Notify callback so it can remove the failed song from queue.
      // Always fire for load failures (timeout, never ready) so the unavailable
      // song gets removed regardless of whether the current song has ended yet.
      // For non-load aborts (user pause), only fire when the song has ended.
      const isLoadFailure = reason.includes('timeout') || reason.includes('never became ready');
      const songHasEnded = activeDeck.duration > 0 &&
        (activeDeck.currentTime >= activeDeck.duration - 0.5 || activeDeck.ended);

      if (isLoadFailure || songHasEnded) {
        onCrossfadeAbortRef.current(nextSongData, isLoadFailure);
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
          // Pre-warm window. The inactive deck's HTMLAudioElement decoder
          // advances currentTime ~10% slower than wall clock for the first
          // several seconds after a fresh src load (decode-buffer warm-up
          // observed at -0.5s drift consistently across 7/7 crossfades on
          // iOS PWA + Bluetooth). If ramps start immediately, that slow
          // window sits underneath the audible crossfade and produces
          // chorusing / perceived pitch shift against the outgoing deck.
          // Letting the deck play inaudibly at gain=0 for WARMUP_MS hands
          // off to a fully-warmed decoder for the audible portion of the
          // fade. The crossfade overlap duration is unchanged — only the
          // start is delayed.
          const WARMUP_MS = 500;
          console.log(`[XFADE] Inactive deck play() succeeded — pre-warming decoder for ${WARMUP_MS}ms before ramps`);

          setTimeout(() => {
            if (!crossfadeInProgressRef.current) {
              console.log('[XFADE] Crossfade aborted during warmup, skipping ramps');
              return;
            }

            console.log(`[XFADE] Warmup complete (inactive at t=${inactiveDeck.currentTime.toFixed(2)}), scheduling GainNode ramps`);

            // Schedule gain ramps on the audio thread (immune to JS throttling)
            scheduleGainRamp(activeDeckLabel, 0, xfadeDuration, 'equalpower');
            scheduleGainRamp(inactiveDeckLabel, 1.0, xfadeDuration, 'equalpower');

            // Diagnostic — capture both decks' state at the start, midpoint, and
            // end of the crossfade. The drift baseline is captured AFTER warmup
            // so the midpoint drift value reflects the audible portion only.
            const xfadeStartWall = Date.now();
            const xfadeStartInactiveT = inactiveDeck.currentTime;
            const snapshotDecks = (label: string, drift?: number) => {
              const a = activeDeck, i = inactiveDeck;
              const driftStr = drift !== undefined ? ` drift=${drift.toFixed(3)}s` : '';
              console.log(
                `[XFADE] decks @ ${label} — ` +
                `${activeDeckLabel}{t=${a.currentTime.toFixed(2)} rate=${a.playbackRate} paused=${a.paused} ready=${a.readyState} net=${a.networkState}} ` +
                `${inactiveDeckLabel}{t=${i.currentTime.toFixed(2)} rate=${i.playbackRate} paused=${i.paused} ready=${i.readyState} net=${i.networkState}}` +
                driftStr,
              );
              if (a.playbackRate !== 1 || i.playbackRate !== 1) {
                console.warn(`[XFADE] ⚠️ playbackRate drift @ ${label}: ${activeDeckLabel}=${a.playbackRate} ${inactiveDeckLabel}=${i.playbackRate}`);
              }
            };
            snapshotDecks('start');
            setTimeout(() => {
              if (!crossfadeInProgressRef.current) return;
              const wallElapsed = (Date.now() - xfadeStartWall) / 1000;
              const inactiveElapsed = inactiveDeck.currentTime - xfadeStartInactiveT;
              const drift = inactiveElapsed - wallElapsed;
              snapshotDecks('midpoint', drift);
              if (Math.abs(drift) > 0.1) {
                console.warn(`[XFADE] ⚠️ inactive deck drift exceeds 100ms at midpoint: ${drift.toFixed(3)}s (likely pitch-shift root cause)`);
              }
            }, (xfadeDuration * 1000) / 2);

            // Subscribe to store for pause detection during crossfade
            pauseUnsubscribeRef.current = useAudioStore.subscribe((state, prevState) => {
              if (prevState.isPlaying && !state.isPlaying && crossfadeInProgressRef.current) {
                console.log('[XFADE] User paused during crossfade - aborting');
                activeDeck.pause();
                inactiveDeck.pause();
                abortCrossfade('user paused');
              }
            });

            // Completion via setTimeout matching ramp duration (+150ms buffer)
            crossfadeCompletionTimeoutRef.current = setTimeout(() => {
              // Verify inactive deck is still playing before completing
              if (!crossfadeInProgressRef.current) return;

              if (!inactiveDeck.paused && inactiveDeck.currentTime > 0) {
                completeCrossfade(activeDeck, inactiveDeck, activeDeckLabel, inactiveDeckLabel, nextSongData);
              } else {
                console.warn(`⚠️ [XFADE] Completion timeout: inactive deck not playing - aborting`);
                abortCrossfade('inactive deck stopped during ramp');
              }
            }, xfadeDuration * 1000 + 150);
          }, WARMUP_MS);
        })
        .catch((err) => {
          console.error(`❌ [XFADE] Inactive deck play() FAILED: ${err.name} - ${err.message}`);
          abortCrossfade('play() failed - likely autoplay blocked');
        });
    };

    // Helper to complete crossfade
    const completeCrossfade = (
      oldDeck: HTMLAudioElement,
      newDeck: HTMLAudioElement,
      oldDeckLabel: 'A' | 'B',
      newDeckLabel: 'A' | 'B',
      song: Song,
    ) => {
      clearCrossfade();

      // Cancel any remaining ramp automation and set final gain values
      cancelGainRamp(oldDeckLabel);
      cancelGainRamp(newDeckLabel);
      setGainImmediate(newDeckLabel, 1.0);
      setGainImmediate(oldDeckLabel, 0);

      // Stop the old deck completely
      oldDeck.pause();
      oldDeck.currentTime = 0;

      // Diagnostic — final snapshot before swap. Compare to start/midpoint
      // to see whether the new (now-active) deck's currentTime advanced
      // smoothly through the crossfade window, or stalled at any point.
      console.log(
        `[XFADE] decks @ complete — ` +
        `${oldDeckLabel}{t=${oldDeck.currentTime.toFixed(2)} rate=${oldDeck.playbackRate} paused=${oldDeck.paused} ready=${oldDeck.readyState} net=${oldDeck.networkState}} ` +
        `${newDeckLabel}{t=${newDeck.currentTime.toFixed(2)} rate=${newDeck.playbackRate} paused=${newDeck.paused} ready=${newDeck.readyState} net=${newDeck.networkState}}`,
      );

      // Swap active deck
      setActiveDeck(newDeckLabel, 'crossfade-complete', { bypassCooldown: true });

      console.log(`[XFADE] Crossfade complete, active deck is now ${newDeckLabel}`);

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
      // Don't use SILENT_AUDIO_DATA_URL — loading any audio through
      // createMediaElementSource can cause a brief pop/click in the graph.
      // Instead, just remove the src and reset the element.
      oldDeck.removeAttribute('src');
      oldDeck.load(); // resets the element to HAVE_NOTHING state
      console.log(`[XFADE] Cleared old deck source to prevent accidental playback`);

      // Mark crossfade as just completed
      crossfadeJustCompletedRef.current = true;

      // Update state
      crossfadeInProgressRef.current = false;
      nextSongPreloadedRef.current = false;

      // Notify callback
      onCrossfadeCompleteRef.current(song);

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

    // Timeout fallback in case canplaythrough doesn't fire.
    // 10s gives cold-cache / first-byte-slow Navidrome streams room to reach
    // a playable state after a shuffle. At the deadline, accept readyState >= 2
    // (HAVE_CURRENT_DATA) — enough to start, with any remaining data buffering
    // mid-ramp. A brief stutter is preferable to evicting a playable song.
    setTimeout(() => {
      if (!crossfadeInProgressRef.current || crossfadeCanPlayFiredRef.current) return;
      if (inactiveDeck.readyState >= 3) {
        console.log(`[XFADE] Timeout fallback (readyState=${inactiveDeck.readyState}): forcing canplaythrough`);
        onCanPlayThrough();
      } else if (inactiveDeck.readyState >= 2) {
        console.warn(`[XFADE] Timeout fallback (readyState=${inactiveDeck.readyState}, HAVE_CURRENT_DATA): starting playback anyway — may stutter`);
        onCanPlayThrough();
      } else {
        abortCrossfade('timeout - deck never became ready');
      }
    }, 10000);

    // Safety timeout: if crossfade is still in progress after duration + 10s.
    // Must exceed the 10s canplaythrough window above so they don't race —
    // a short xfadeDuration (e.g. 3s) would otherwise fire safety first and
    // misclassify a still-loading deck as a hard failure.
    setTimeout(() => {
      if (!crossfadeInProgressRef.current) return;

      // Check if incoming deck is playing and has progressed
      if (!inactiveDeck.paused && inactiveDeck.currentTime > 1) {
        console.log(`[XFADE] Safety timeout: incoming deck playing at ${inactiveDeck.currentTime.toFixed(1)}s - completing crossfade`);
        completeCrossfade(activeDeck, inactiveDeck, activeDeckLabel, inactiveDeckLabel, nextSongData);
      } else {
        console.warn(`⚠️ [XFADE] Safety timeout: incoming deck not playing - aborting`);
        abortCrossfade('safety timeout exceeded');
      }
    }, (xfadeDuration + 10) * 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onCrossfadeComplete/onCrossfadeAbort accessed via stable refs
  }, [getActiveDeck, getInactiveDeck, activeDeckRef, crossfadeInProgressRef, clearCrossfade, canPlayHandlerRef, errorHandlerRef, scheduleGainRamp, cancelGainRamp, setGainImmediate, setActiveDeck, resumeContext]);

  return {
    crossfadeJustCompletedRef,
    startCrossfade,
    clearCrossfade,
    resetCrossfadeState,
  };
}
