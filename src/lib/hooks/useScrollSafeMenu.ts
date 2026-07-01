import { useState, useRef, useCallback, type TouchEvent } from 'react';

/**
 * Prevents DropdownMenu from opening when the user is scrolling on mobile.
 * Tracks touch movement and suppresses opens if the finger moved > threshold.
 */
export function useScrollSafeMenu(threshold = 8) {
  const [open, setOpen] = useState(false);
  const wasScrollingRef = useRef(false);
  const touchStartYRef = useRef(0);

  const onOpenChange = useCallback((next: boolean) => {
    if (next && wasScrollingRef.current) {
      wasScrollingRef.current = false;
      return;
    }
    setOpen(next);
  }, []);

  const triggerProps = {
    onTouchStart: (e: TouchEvent) => {
      touchStartYRef.current = e.touches[0].clientY;
      wasScrollingRef.current = false;
    },
    onTouchMove: (e: TouchEvent) => {
      if (Math.abs(e.touches[0].clientY - touchStartYRef.current) > threshold) {
        wasScrollingRef.current = true;
      }
    },
  };

  return { open, onOpenChange, triggerProps } as const;
}
