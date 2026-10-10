import { toast } from '@/lib/toast';

/**
 * Gesture-scoped audio unlock (#311).
 *
 * iOS only lets an <audio> element (and the AudioContext) start inside a user
 * gesture until it has played once in this page session. Actions that await
 * the network before playing (radio: ~4s for /api/radio/seeded) lose the
 * gesture, so their play() is rejected with NotAllowedError after a cold
 * launch. Those actions call unlockAudioForGesture() synchronously, before
 * any await, to spend the gesture on the decks while it's still live.
 *
 * The decks live in PlayerBar, so it registers the actual unlock work here.
 * (No store import: the audio store imports this module.)
 */

let unlocker: (() => void) | null = null;

export function registerAudioUnlocker(fn: () => void): () => void {
  unlocker = fn;
  return () => {
    if (unlocker === fn) unlocker = null;
  };
}

/** Call synchronously inside a click/tap handler, before any await. */
export function unlockAudioForGesture(): void {
  try {
    unlocker?.();
  } catch (err) {
    console.warn('[UNLOCK] Audio unlock failed:', err);
  }
}

/** play() was refused by autoplay policy: retrying without a tap can't work. */
export function isAutoplayBlocked(err: unknown): boolean {
  // DOMException; check the name rather than the class (not an Error subclass everywhere).
  return (err as { name?: unknown } | null)?.name === 'NotAllowedError';
}

/**
 * Stop claiming to play and ask for a tap, instead of letting the stall
 * watchdog treat the paused deck as a stall. The song stays in the queue.
 */
export function handleAutoplayBlocked(source: string, setIsPlaying: (playing: boolean) => void): void {
  console.warn(`[UNLOCK] play() blocked by autoplay policy (${source}) — waiting for a tap`);
  setIsPlaying(false);
  toast.info('Tap play to start', { id: 'autoplay-blocked' });
}
