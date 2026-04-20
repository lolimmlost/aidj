import { useRef, useCallback } from 'react';

// Silent MP3 data URL for deck clearing
export const SILENT_AUDIO_DATA_URL = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAgAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAbD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+M4xAANCAJYAUAAAP/jOMQADQW+XgFJAAD/4zjEAA5QGneBSRgA/+M4xAAOAAJYAUEAAA==';

export interface Song {
  id: string;
  url: string;
  name?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumId?: string;
  genre?: string;
  duration?: number;
}

/**
 * Returns true if an audio element has a real song loaded (not a silent data URL or empty).
 */
export function hasRealSong(el: HTMLAudioElement | null): boolean {
  return !!el?.src && !el.src.startsWith('data:');
}

export interface SetActiveDeckOptions {
  /** Skip cooldown (for legitimate transitions like crossfade completion) */
  bypassCooldown?: boolean;
  /** Custom cooldown in ms (default: 500) */
  cooldownMs?: number;
}

export interface UseDualDeckAudioReturn {
  deckARef: React.RefObject<HTMLAudioElement | null>;
  deckBRef: React.RefObject<HTMLAudioElement | null>;
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  getActiveDeck: () => HTMLAudioElement | null;
  getInactiveDeck: () => HTMLAudioElement | null;
  setActiveDeck: (deck: 'A' | 'B', reason: string, opts?: SetActiveDeckOptions) => boolean;
}

/**
 * Manages dual audio elements (deckA, deckB) for seamless crossfade playback.
 *
 * Key features:
 * - Tracks which deck is currently active
 * - Provides helpers to get active/inactive deck
 * - Centralized setActiveDeck with cooldown to prevent DESYNC ping-pong
 *
 * Note: The Web Audio API avoids iOS's single-channel HTMLAudioElement
 * restriction by routing both decks through a single AudioContext — but
 * the autoplay gesture policy is separate and still applies per element.
 * The inactive deck must be primed via a user-gesture-initiated play()
 * (see PlayerBar.togglePlayPause) or its later crossfade play() call
 * will be rejected with NotAllowedError.
 */
export function useDualDeckAudio(): UseDualDeckAudioReturn {
  // Audio element refs
  const deckARef = useRef<HTMLAudioElement>(null);
  const deckBRef = useRef<HTMLAudioElement>(null);

  // Which deck is currently playing
  const activeDeckRef = useRef<'A' | 'B'>('A');

  // Cooldown tracking for deck switches
  const lastDeckSwitchRef = useRef<number>(0);
  const DECK_SWITCH_COOLDOWN_MS = 500;

  // Get the currently active deck element
  const getActiveDeck = useCallback(() => {
    return activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
  }, []);

  // Get the inactive deck element (for preloading/crossfade)
  const getInactiveDeck = useCallback(() => {
    return activeDeckRef.current === 'A' ? deckBRef.current : deckARef.current;
  }, []);

  // Centralized deck switching with cooldown to prevent DESYNC ping-pong
  const setActiveDeck = useCallback((
    deck: 'A' | 'B',
    reason: string,
    opts?: SetActiveDeckOptions,
  ): boolean => {
    if (activeDeckRef.current === deck) return false; // already correct

    const now = Date.now();
    const cooldown = opts?.cooldownMs ?? DECK_SWITCH_COOLDOWN_MS;

    if (!opts?.bypassCooldown && now - lastDeckSwitchRef.current < cooldown) {
      console.log(`[DECK] Ignoring switch to ${deck} (${reason}) — cooldown active`);
      return false;
    }

    const prev = activeDeckRef.current;
    activeDeckRef.current = deck;
    lastDeckSwitchRef.current = now;
    console.log(`[DECK] ${prev} → ${deck} (${reason})`);
    return true;
  }, []);

  return {
    deckARef,
    deckBRef,
    activeDeckRef,
    getActiveDeck,
    getInactiveDeck,
    setActiveDeck,
  };
}
