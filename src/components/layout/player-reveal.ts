/**
 * When a minimized player bar comes back on its own (#438).
 *
 * It used to reappear on every isPlaying false → true. Automatic restarts flip that too:
 * stall / interruption recovery, or the Transition Lab and the app player handing iOS's
 * audio back and forth (every ~1.5 s on an old iPhone), so the bar kept popping up.
 * Now only playback starting on a different song than the one last playing counts: that's
 * the user picking something. A restart of the same song is the player recovering. The
 * pill still brings the bar back on a tap.
 */

interface PlayerState {
  isPlaying: boolean;
  playlist: ReadonlyArray<{ id: string }>;
  currentSongIndex: number;
}

/** Returns a store listener that calls `reveal` when the user starts a new song. */
export function createPlayerRevealWatcher(reveal: () => void) {
  let lastPlayingSongId: string | null = null;
  return (state: PlayerState, prev: PlayerState) => {
    const songId = state.playlist[state.currentSongIndex]?.id ?? null;
    if (state.isPlaying && !prev.isPlaying && songId !== lastPlayingSongId) reveal();
    if (state.isPlaying) lastPlayingSongId = songId;
  };
}
