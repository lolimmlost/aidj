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

export interface UseDualDeckAudioReturn {
  deckARef: React.RefObject<HTMLAudioElement | null>;
  deckBRef: React.RefObject<HTMLAudioElement | null>;
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  getActiveDeck: () => HTMLAudioElement | null;
  getInactiveDeck: () => HTMLAudioElement | null;
  loadSong: (song: Song | null) => void;
  preloadNextSong: (song: Song | null) => void;
  swapDecks: () => void;
}

/**
 * Manages dual audio elements (deckA, deckB) for seamless crossfade playback.
 *
 * Key features:
 * - Tracks which deck is currently active
 * - Provides helpers to get active/inactive deck
 * - Load song on active deck, preload on inactive for crossfade
 *
 * Note: Deck priming is no longer needed — Web Audio API handles
 * both decks through a single AudioContext, avoiding the iOS
 * single-channel restriction on HTMLAudioElement.
 */
export function useDualDeckAudio(): UseDualDeckAudioReturn {
  // Audio element refs
  const deckARef = useRef<HTMLAudioElement>(null);
  const deckBRef = useRef<HTMLAudioElement>(null);

  // Which deck is currently playing
  const activeDeckRef = useRef<'A' | 'B'>('A');

  // Get the currently active deck element
  const getActiveDeck = useCallback(() => {
    return activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
  }, []);

  // Get the inactive deck element (for preloading/crossfade)
  const getInactiveDeck = useCallback(() => {
    return activeDeckRef.current === 'A' ? deckBRef.current : deckARef.current;
  }, []);

  // Load a song on the active deck
  const loadSong = useCallback((song: Song | null) => {
    const audio = getActiveDeck();
    if (audio && song) {
      audio.src = song.url;
      audio.load();
      console.log(`[AUDIO] Loaded song on deck ${activeDeckRef.current}: ${song.name || song.title}`);
    }
  }, [getActiveDeck]);

  // Preload a song on the inactive deck (for crossfade)
  const preloadNextSong = useCallback((song: Song | null) => {
    const inactiveDeck = getInactiveDeck();
    if (inactiveDeck && song) {
      console.log(`[XFADE] Preloading next song on inactive deck`);
      inactiveDeck.src = song.url;
      inactiveDeck.load();
      // Gain is controlled via GainNode — element.volume stays at 1.0
    }
  }, [getInactiveDeck]);

  // Swap which deck is active
  const swapDecks = useCallback(() => {
    activeDeckRef.current = activeDeckRef.current === 'A' ? 'B' : 'A';
    console.log(`[AUDIO] Swapped active deck to ${activeDeckRef.current}`);
  }, []);

  return {
    deckARef,
    deckBRef,
    activeDeckRef,
    getActiveDeck,
    getInactiveDeck,
    loadSong,
    preloadNextSong,
    swapDecks,
  };
}
