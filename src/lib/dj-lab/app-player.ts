/**
 * The Lab and the app's player never play over each other (#438).
 *
 * The Lab taking the audio must be a pause the app player respects. A bare
 * setIsPlaying(false) isn't one: the player's recovery reads an unmarked pause as an
 * interruption (iOS, a stall) and restarts itself, which paused the Lab, which took the
 * audio back, which read as the next interruption, an endless play/pause loop on iOS.
 */
import { useAudioStore } from '@/lib/stores/audio';
import { claimAudio, externalAudioOwner, releaseAudio } from '@/lib/utils/audio-owner';
import { labLog } from './log';
import type { LabEngine } from './engine';

/** The Lab is about to play: stop the app player and keep it stopped until the user plays it. */
export function takeAudioFromAppPlayer(): void {
  claimAudio('lab');
  const app = useAudioStore.getState();
  // deliberate, so the player's recovery leaves it alone
  app.markUserPause();
  if (app.isPlaying) app.setIsPlaying(false);
  // an element still sounding while the store already said paused would keep holding iOS's audio session
  if (typeof document !== 'undefined') {
    document.querySelectorAll('audio').forEach((el) => {
      if (!el.paused) el.pause();
    });
  }
}

type WatchedEngine = Pick<LabEngine, 'setOnBeforePlay' | 'getSnapshot' | 'pause' | 'subscribe'>;

let unwatch: (() => void) | null = null;

export function watchAppPlayer(engine: WatchedEngine): void {
  engine.setOnBeforePlay(takeAudioFromAppPlayer);
  if (unwatch) return;
  const offStore = useAudioStore.subscribe((s, prev) => {
    if (!s.isPlaying || prev.isPlaying) return;
    // While the Lab owns the audio nothing restarts the player on its own (audio-owner.ts),
    // so this start is the user's: hand the audio back and stop the set's sound.
    if (externalAudioOwner() === 'lab') {
      releaseAudio('lab');
      labLog('app player took the audio back');
    }
    if (engine.getSnapshot().status === 'playing') engine.pause();
  });
  // a set that ended hands the audio back
  const offEngine = engine.subscribe(() => {
    if (engine.getSnapshot().status === 'idle') releaseAudio('lab');
  });
  unwatch = () => {
    offStore();
    offEngine();
  };
}

/** Tests only. */
export function __resetAppPlayerWatchForTests(): void {
  unwatch?.();
  unwatch = null;
}
