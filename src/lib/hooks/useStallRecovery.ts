import { useRef, useCallback, useEffect } from 'react';
import { useAudioStore } from '@/lib/stores/audio';
import { hasRealSong } from './useDualDeckAudio';

export interface UseStallRecoveryOptions {
  getActiveDeck: () => HTMLAudioElement | null;
  crossfadeInProgressRef: React.RefObject<boolean>;
  onMaxAttemptsReached: () => void;
  resumeContext: () => Promise<boolean>;
}

export interface UseStallRecoveryReturn {
  recoveryAttemptRef: React.RefObject<number>;
  lastProgressTimeRef: React.RefObject<number>;
  lastProgressValueRef: React.RefObject<number>;
  attemptStallRecovery: (audio: HTMLAudioElement, source: string) => Promise<boolean>;
  resetRecoveryState: () => void;
}

/**
 * Handles stall detection and recovery for audio playback.
 *
 * Features:
 * - Uses shared AudioContext resume from useWebAudioGraph
 * - Escalating recovery strategies: play -> seek back -> reload
 * - Stall watchdog interval monitors playback progress
 * - Visibility change stall detection
 */
export function useStallRecovery({
  getActiveDeck,
  crossfadeInProgressRef,
  onMaxAttemptsReached,
  resumeContext,
}: UseStallRecoveryOptions): UseStallRecoveryReturn {
  // Recovery state refs
  const recoveryAttemptRef = useRef<number>(0);
  // eslint-disable-next-line react-hooks/purity -- initial timestamp for stall detection, safe in ref
  const lastProgressTimeRef = useRef<number>(Date.now());
  const lastProgressValueRef = useRef<number>(0);
  const stallWatchdogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper to play with timeout - iOS play() can hang
  const playWithTimeout = useCallback(async (audio: HTMLAudioElement, timeoutMs: number = 3000): Promise<void> => {
    const playPromise = audio.play();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('play() timeout')), timeoutMs)
    );
    await Promise.race([playPromise, timeoutPromise]);
  }, []);

  // Centralized stall recovery with escalating strategies
  const attemptStallRecovery = useCallback(async (audio: HTMLAudioElement, source: string): Promise<boolean> => {
    const MAX_RECOVERY_ATTEMPTS = 3;
    const attempt = ++recoveryAttemptRef.current;
    // Use lastProgressValueRef as fallback - audio.currentTime might already be 0 if browser reclaimed resources
    const savedTime = audio.currentTime > 0
      ? audio.currentTime
      : lastProgressValueRef.current;

    console.log(`🔧 [RECOVERY] Attempt ${attempt}/${MAX_RECOVERY_ATTEMPTS} from ${source} at ${savedTime.toFixed(1)}s (audio=${audio.currentTime.toFixed(1)}s, saved=${lastProgressValueRef.current.toFixed(1)}s)`);

    // Max attempts reached - skip to next song
    if (attempt > MAX_RECOVERY_ATTEMPTS) {
      console.log('🔧 [RECOVERY] Max attempts reached - skipping to next song');
      recoveryAttemptRef.current = 0;
      onMaxAttemptsReached();

      // Try to play the next song
      setTimeout(() => {
        const deck = getActiveDeck();
        if (deck) {
          deck.play().catch(err => console.error('🔧 [RECOVERY] Next song play failed:', err));
        }
      }, 500);

      return false;
    }

    // Always check AudioContext first (uses shared context from useWebAudioGraph)
    await resumeContext();

    try {
      if (attempt === 1) {
        // Attempt 1: Simple play() to kick the browser into continuing to buffer
        console.log('🔧 [RECOVERY] Strategy 1: play() to kick buffering');
        await playWithTimeout(audio);
        console.log('🔧 [RECOVERY] Attempt 1 succeeded');
      } else if (attempt === 2) {
        // Attempt 2: Seek back a few seconds and play
        const seekTarget = Math.max(0, savedTime - 3);
        console.log(`🔧 [RECOVERY] Strategy 2: seek back to ${seekTarget.toFixed(1)}s`);
        // eslint-disable-next-line react-hooks/immutability -- DOM element property, not React state
        audio.currentTime = seekTarget;
        await playWithTimeout(audio);
        console.log('🔧 [RECOVERY] Attempt 2 succeeded');
      } else {
        // Attempt 3: Full reload - clear src, set it again, seek, play
        const src = audio.src;
        const seekTarget = Math.max(0, savedTime - 5);
        console.log(`🔧 [RECOVERY] Strategy 3: full reload, seek to ${seekTarget.toFixed(1)}s`);

        audio.pause();
        audio.src = '';
        audio.load();

        // Small delay for cleanup
        await new Promise(resolve => setTimeout(resolve, 100));

        audio.src = src;
        audio.load();

        // Wait for enough data to seek
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Reload timeout')), 10000);
          const onCanPlay = () => {
            clearTimeout(timeout);
            audio.removeEventListener('canplay', onCanPlay);
            resolve();
          };
          audio.addEventListener('canplay', onCanPlay);
        });

        audio.currentTime = seekTarget;
        await playWithTimeout(audio, 5000); // Longer timeout for reload
        console.log('🔧 [RECOVERY] Attempt 3 succeeded');
      }

      // Success - reset counter after playback stabilizes
      setTimeout(() => {
        const deck = getActiveDeck();
        if (deck && !deck.paused) {
          recoveryAttemptRef.current = 0;
          console.log('🔧 [RECOVERY] Playback stable - reset recovery counter');
        }
      }, 5000);

      // Update progress tracking refs to prevent immediate re-trigger
      lastProgressTimeRef.current = Date.now();
      lastProgressValueRef.current = audio.currentTime;

      return true;
    } catch (err) {
      console.log(`🔧 [RECOVERY] Attempt ${attempt} failed:`, (err as Error).message);
      return false;
    }
  }, [resumeContext, getActiveDeck, onMaxAttemptsReached, playWithTimeout]);

  // Reset recovery state (called when song changes)
  const resetRecoveryState = useCallback(() => {
    recoveryAttemptRef.current = 0;
    lastProgressValueRef.current = 0;
    lastProgressTimeRef.current = Date.now();
  }, []);

  // Stall watchdog effect - monitors playback progress
  useEffect(() => {
    const isPlaying = useAudioStore.getState().isPlaying;

    const STALL_THRESHOLD_MS = 5000; // 5 seconds no progress = stall
    const CHECK_INTERVAL_MS = 2000;  // Check every 2 seconds
    const MIN_PROGRESS_DELTA = 0.5;  // Minimum progress to consider "advancing"

    // Clear any existing interval
    if (stallWatchdogIntervalRef.current) {
      clearInterval(stallWatchdogIntervalRef.current);
      stallWatchdogIntervalRef.current = null;
    }

    // Only run watchdog when we should be playing
    if (!isPlaying) {
      return;
    }

    console.log('🐕 [WATCHDOG] Starting stall watchdog');

    stallWatchdogIntervalRef.current = setInterval(() => {
      const audio = getActiveDeck();
      if (!audio) return;

      // Skip during crossfade
      if (crossfadeInProgressRef.current) return;

      // Skip when page is hidden
      if (document.visibilityState === 'hidden') return;

      const storeIsPlaying = useAudioStore.getState().isPlaying;

      // DESYNC DETECTION: store says playing but audio is paused
      if (audio.paused) {
        if (audio.duration > 0 && audio.currentTime >= audio.duration - 0.5) return;

        if (storeIsPlaying && hasRealSong(audio)) {
          if (audio.readyState >= 2) {
            const savedPosition = lastProgressValueRef.current;
            console.log(`🚨 [WATCHDOG] Desync: store=playing, audio=paused at ${audio.currentTime.toFixed(1)}s (was ${savedPosition.toFixed(1)}s)`);

            if (audio.currentTime < 1 && savedPosition > 1) {
              audio.currentTime = savedPosition;
            }

            audio.play().catch(err => {
              console.error(`🚨 [WATCHDOG] Desync recovery failed: ${err.message}`);
              attemptStallRecovery(audio, 'watchdog-desync');
            });
          }
        }
        return;
      }

      // Skip if store says we shouldn't be playing
      if (!storeIsPlaying) return;

      // Skip if no real audio loaded
      if (!hasRealSong(audio)) return;

      const now = Date.now();
      const currentProgress = audio.currentTime;

      // Check if time has advanced meaningfully
      if (currentProgress > lastProgressValueRef.current + MIN_PROGRESS_DELTA) {
        lastProgressTimeRef.current = now;
        lastProgressValueRef.current = currentProgress;
        if (recoveryAttemptRef.current > 0) {
          recoveryAttemptRef.current = 0;
        }
        return;
      }

      // No progress - check if we've exceeded the stall threshold
      const timeSinceProgress = now - lastProgressTimeRef.current;

      if (timeSinceProgress > STALL_THRESHOLD_MS) {
        console.log(`🚨 [WATCHDOG] Stall detected! No progress for ${(timeSinceProgress / 1000).toFixed(1)}s at ${currentProgress.toFixed(1)}s`);

        const bufferedEnd = audio.buffered.length > 0
          ? audio.buffered.end(audio.buffered.length - 1)
          : 0;
        console.log(`🚨 [WATCHDOG] Buffer state: currentTime=${currentProgress.toFixed(1)}, buffered=${bufferedEnd.toFixed(1)}, readyState=${audio.readyState}`);

        attemptStallRecovery(audio, 'watchdog');
        lastProgressTimeRef.current = now;
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      if (stallWatchdogIntervalRef.current) {
        clearInterval(stallWatchdogIntervalRef.current);
        stallWatchdogIntervalRef.current = null;
        console.log('🐕 [WATCHDOG] Stopped stall watchdog');
      }
    };
  }, [getActiveDeck, crossfadeInProgressRef, attemptStallRecovery]);

  return {
    recoveryAttemptRef,
    lastProgressTimeRef,
    lastProgressValueRef,
    attemptStallRecovery,
    resetRecoveryState,
  };
}
