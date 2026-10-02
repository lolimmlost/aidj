import { useEffect } from 'react';

/**
 * Publishes `--bottom-chrome`: how much of the viewport bottom is covered by
 * fixed chrome (player bar, mobile tab bar — anything marked
 * `data-bottom-chrome`). Toasts offset by it so they sit above the player
 * instead of on top of it. 0px when nothing is showing; unset on unmount.
 */
export function measureBottomChrome(elements: Iterable<Element>, viewportHeight: number): number {
  let covered = 0;
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (rect.height === 0) continue; // hidden (display: none)
    covered = Math.max(covered, viewportHeight - rect.top);
  }
  return Math.max(0, Math.round(covered));
}

export function useBottomChrome() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const els = document.querySelectorAll('[data-bottom-chrome]');
      root.style.setProperty('--bottom-chrome', `${measureBottomChrome(els, window.innerHeight)}px`);
    };

    // Size/visibility changes of the chrome itself (player shown/hidden,
    // player layout changes) and viewport changes.
    const resizeObserver = new ResizeObserver(update);
    const observeAll = () => {
      resizeObserver.disconnect();
      document.querySelectorAll('[data-bottom-chrome]').forEach((el) => resizeObserver.observe(el));
    };
    observeAll();
    update();
    window.addEventListener('resize', update);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', update);
      root.style.removeProperty('--bottom-chrome');
    };
  }, []);
}
