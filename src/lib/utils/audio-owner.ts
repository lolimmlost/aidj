/**
 * Who owns the page's audio when it isn't the app player (#438).
 *
 * The Transition Lab plays through its own AudioContext. While it owns the audio,
 * the app player's automatic recovery must stand down: no re-sync to a deck that's
 * still sounding, no stall / interruption auto-resume, no AudioContext resume retries.
 * On iOS each automatic restart of the app player paused the Lab, and the Lab taking
 * the audio back read to the player as one more interruption to recover from. On an
 * old iPhone that loop flipped isPlaying every ~1.5 s for minutes.
 *
 * Only the user starts the app player again. A play while the Lab owns the audio
 * hands it back (see dj-lab/app-player.ts).
 *
 * Module state, not the audio store: it's read at event time, never rendered, and
 * must not persist (a reload drops the Lab's engine with it).
 */

export type AudioOwner = 'lab';

let owner: AudioOwner | null = null;

export function claimAudio(who: AudioOwner): void {
  owner = who;
}

/** Give the audio back. With `who`, only if that owner still holds it. */
export function releaseAudio(who?: AudioOwner): void {
  if (who === undefined || owner === who) owner = null;
}

/** Who holds the audio instead of the app player, if anyone. */
export function externalAudioOwner(): AudioOwner | null {
  return owner;
}
