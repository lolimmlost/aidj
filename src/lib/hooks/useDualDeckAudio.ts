import { useRef, useCallback } from 'react';

// Silent MP3 data URL for deck priming and clearing
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
}

export interface UseDualDeckAudioReturn {
  deckARef: React.RefObject<HTMLAudioElement | null>;
  deckBRef: React.RefObject<HTMLAudioElement | null>;
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  decksPrimedRef: React.MutableRefObject<boolean>;
  isPrimingRef: React.MutableRefObject<boolean>;
  getActiveDeck: () => HTMLAudioElement | null;
  getInactiveDeck: () => HTMLAudioElement | null;
  loadSong: (song: Song | null) => void;
  preloadNextSong: (song: Song | null) => void;
  swapDecks: () => void;
  primeBothDecks: () => Promise<void>;
}

/**
 * Manages dual audio elements (deckA, deckB) for seamless crossfade playback.
 *
 * Key features:
 * - Tracks which deck is currently active
 * - Provides helpers to get active/inactive deck
 * - Handles deck priming for mobile (gives both decks "user activated" flag)
 * - Load song on active deck, preload on inactive for crossfade
 */
export function useDualDeckAudio(): UseDualDeckAudioReturn {
  // Audio element refs
  const deckARef = useRef<HTMLAudioElement>(null);
  const deckBRef = useRef<HTMLAudioElement>(null);

  // Which deck is currently playing
  const activeDeckRef = useRef<'A' | 'B'>('A');

  // Mobile priming state
  const decksPrimedRef = useRef<boolean>(false);
  const isPrimingRef = useRef<boolean>(false);

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
      inactiveDeck.volume = 0;
    }
  }, [getInactiveDeck]);

  // Swap which deck is active
  const swapDecks = useCallback(() => {
    activeDeckRef.current = activeDeckRef.current === 'A' ? 'B' : 'A';
    console.log(`[AUDIO] Swapped active deck to ${activeDeckRef.current}`);
  }, []);

  /**
   * Prime both decks on first user interaction.
   * Mobile browsers require audio elements to be "activated" by user gesture
   * before they can play. This plays a silent audio clip on both decks
   * to satisfy that requirement, enabling crossfade later.
   */
  const primeBothDecks = useCallback(async () => {
    if (decksPrimedRef.current) return;

    const inactiveDeck = getInactiveDeck();
    if (!inactiveDeck) return;

    console.log('[MOBILE] Priming both decks for crossfade support');
    isPrimingRef.current = true;

    const originalVolume = inactiveDeck.volume;
    const originalSrc = inactiveDeck.src;

    inactiveDeck.volume = 0;
    inactiveDeck.src = SILENT_AUDIO_DATA_URL;

    try {
      await inactiveDeck.play();
      inactiveDeck.pause();
      decksPrimedRef.current = true;
      console.log('[MOBILE] Inactive deck primed successfully');
    } catch (e) {
      console.log('[MOBILE] Could not prime inactive deck:', e);
    } finally {
      inactiveDeck.src = originalSrc || '';
      inactiveDeck.volume = originalVolume;
      isPrimingRef.current = false;
    }
  }, [getInactiveDeck]);

  return {
    deckARef,
    deckBRef,
    activeDeckRef,
    decksPrimedRef,
    isPrimingRef,
    getActiveDeck,
    getInactiveDeck,
    loadSong,
    preloadNextSong,
    swapDecks,
    primeBothDecks,
  };
}
