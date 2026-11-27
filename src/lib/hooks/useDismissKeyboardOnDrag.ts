import { useEffect } from 'react';

/** How far a finger must travel before it counts as a drag rather than a tap. */
const DRAG_PX = 10;

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/** The focused field that's holding the on-screen keyboard up, if any. */
export function keyboardField(el: Element | null): HTMLInputElement | HTMLTextAreaElement | null {
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && TEXT_INPUTS.has(el.type)) return el;
  return null;
}

/**
 * Phones: dragging anywhere outside the focused text field lowers the keyboard, as native search
 * screens do (iOS "dismiss on drag"). Safari never blurs a field on scroll, so without this the
 * keyboard stayed up until something stole focus, like the bottom nav. Mounted once in AppLayout.
 */
export function useDismissKeyboardOnDrag() {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let field: HTMLInputElement | HTMLTextAreaElement | null = null;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      const focused = keyboardField(document.activeElement);
      // Not when the drag starts on the field itself: that's moving the caret or selecting text.
      field = t && focused && !focused.contains(e.target as Node) ? focused : null;
      if (t) {
        startX = t.clientX;
        startY = t.clientY;
      }
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!field || !t || Math.hypot(t.clientX - startX, t.clientY - startY) < DRAG_PX) return;
      if (document.activeElement === field) field.blur();
      field = null;
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
    };
  }, []);
}
