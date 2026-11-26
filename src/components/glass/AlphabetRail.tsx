import { useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

/** The rail letter a name files under: A–Z, else '#'. */
export function letterOf(text: string): string {
  const first = text.trim().charAt(0).toUpperCase();
  if (!first) return '';
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/**
 * iOS-style A–Z index on the right edge (phones). Tap or drag along it to
 * jump; letters with nothing under them are dimmed. Sits centred between the
 * sticky title bar and the mini player (--mini-player-h, AppLayout).
 */
export function AlphabetRail({
  availableLetters,
  onLetterSelect,
  reversed = false,
}: {
  availableLetters: Set<string>;
  onLetterSelect: (letter: string) => void;
  /** Z–A sort: the rail runs the same way as the list. */
  reversed?: boolean;
}) {
  // '#' stays at the bottom either way, like the iOS index.
  const letters = useMemo(() => (reversed ? [...ALPHABET.slice(0, -1).reverse(), '#'] : ALPHABET), [reversed]);
  const railRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);

  const getLetterFromTouch = useCallback((clientY: number) => {
    if (!railRef.current) return null;
    const rect = railRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const idx = Math.floor((y / rect.height) * letters.length);
    return letters[Math.max(0, Math.min(idx, letters.length - 1))];
  }, [letters]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    activeRef.current = true;
    const letter = getLetterFromTouch(e.touches[0].clientY);
    if (letter && availableLetters.has(letter)) onLetterSelect(letter);
  }, [getLetterFromTouch, availableLetters, onLetterSelect]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!activeRef.current) return;
    e.preventDefault();
    const letter = getLetterFromTouch(e.touches[0].clientY);
    if (letter && availableLetters.has(letter)) onLetterSelect(letter);
  }, [getLetterFromTouch, availableLetters, onLetterSelect]);

  const handleTouchEnd = useCallback(() => {
    activeRef.current = false;
  }, []);

  return (
    // The band runs from under the sticky title bar to above the mini player
    // (--mini-player-h, AppLayout); the rail sits centred in it at its own
    // height, so every letter is on screen and touch maps to letters exactly.
    <div
      className="pointer-events-none fixed right-0.5 z-30 flex items-center"
      style={{
        top: 'calc(env(safe-area-inset-top) + var(--top-bar) + 4rem)',
        bottom: 'calc(var(--mobile-tabbar-offset, 0px) + var(--mini-player-h, 0px) + 0.5rem)',
      }}
    >
    <div
      ref={railRef}
      className="pointer-events-auto flex max-h-full flex-col items-center select-none touch-none py-1"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {letters.map((letter) => (
        <button
          key={letter}
          type="button"
          className={cn(
            'w-5 text-[9px] font-semibold leading-none py-[2px] rounded-sm transition-colors',
            availableLetters.has(letter)
              ? 'text-primary hover:bg-primary/10'
              : 'text-muted-foreground/30 pointer-events-none'
          )}
          onClick={() => {
            if (availableLetters.has(letter)) onLetterSelect(letter);
          }}
        >
          {letter}
        </button>
      ))}
    </div>
    </div>
  );
}
