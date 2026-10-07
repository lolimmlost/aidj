import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// src/test/setup.ts auto-mocks react-dom; these helpers need the real flushSync.
vi.unmock('react-dom');
import {
  canViewTransition,
  nameForNextTransition,
  withViewTransition,
} from '../view-transition';

const doc = document as unknown as { startViewTransition?: unknown };

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia;
}

describe('view-transition helpers', () => {
  const originalMatchMedia = window.matchMedia;
  let start: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    start = vi.fn((arg: (() => void) | { update: () => void }) => {
      (typeof arg === 'function' ? arg : arg.update)();
    });
    doc.startViewTransition = start;
    setReducedMotion(false);
  });

  afterEach(() => {
    delete doc.startViewTransition;
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
  });

  it('runs the update inside a transition when supported', () => {
    const update = vi.fn();
    expect(withViewTransition(update)).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('applies the update directly without browser support', () => {
    delete doc.startViewTransition;
    const update = vi.fn();
    expect(canViewTransition()).toBe(false);
    expect(withViewTransition(update)).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('skips the transition under reduced motion', () => {
    setReducedMotion(true);
    const update = vi.fn();
    expect(withViewTransition(update)).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('names an element for the next transition only', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    nameForNextTransition(el, 'album-art', 500);
    expect(el.style.viewTransitionName).toBe('album-art');
    vi.advanceTimersByTime(500);
    expect(el.style.viewTransitionName).toBe('');
  });

  it('does not name elements when transitions are unavailable', () => {
    delete doc.startViewTransition;
    const el = document.createElement('div');
    nameForNextTransition(el, 'album-art');
    expect(el.style.viewTransitionName).toBe('');
  });
});
