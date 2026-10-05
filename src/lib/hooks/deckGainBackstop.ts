import type { SetActiveDeckOptions } from './useDualDeckAudio';

type SetActiveDeck = (deck: 'A' | 'B', reason: string, opts?: SetActiveDeckOptions) => boolean;
type SetGainImmediate = (deck: 'A' | 'B', value: number) => void;

/**
 * Wrap setActiveDeck so a deck promoted OUTSIDE a crossfade is always audible.
 *
 * Per-deck gains only exist for crossfades (volume/pause fades use the master
 * gain), so outside one the active deck must sit at 1 and the other at 0. The
 * desync/recovery paths can promote a deck a cancelled crossfade left at gain 0;
 * without this every later song loaded on it plays silently (#296). During a
 * crossfade the ramps own the gains (completeCrossfade sets them itself), so
 * this leaves them alone.
 */
export function withActiveDeckGain(
  setActiveDeck: SetActiveDeck,
  setGainImmediate: SetGainImmediate,
  crossfadeInProgressRef: { readonly current: boolean },
): SetActiveDeck {
  return (deck, reason, opts) => {
    const switched = setActiveDeck(deck, reason, opts);
    if (switched && !crossfadeInProgressRef.current) {
      setGainImmediate(deck, 1);
      setGainImmediate(deck === 'A' ? 'B' : 'A', 0);
    }
    return switched;
  };
}
