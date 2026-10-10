import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// src/test/setup.ts auto-mocks react-dom; these helpers need the real flushSync.
vi.unmock('react-dom');
import {
  canViewTransition,
  nameForNextTransition,
  suppressTransitionNames,
  waitForImage,
  withViewTransition,
  withViewTransitionAsync,
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

  it('calls onFinished once the transition finishes', async () => {
    let finish!: () => void;
    start.mockImplementation((arg: { update: () => void } | (() => void)) => {
      (typeof arg === 'function' ? arg : arg.update)();
      return { finished: new Promise<void>((r) => { finish = r; }) };
    });
    const onFinished = vi.fn();
    withViewTransition(vi.fn(), undefined, onFinished);
    await Promise.resolve();
    expect(onFinished).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
  });

  it('calls onFinished right away when no transition runs', () => {
    setReducedMotion(true);
    const onFinished = vi.fn();
    withViewTransition(vi.fn(), undefined, onFinished);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('suppresses names and restores them', () => {
    const el = document.createElement('div');
    el.setAttribute('data-hero', '');
    document.body.appendChild(el);
    const restore = suppressTransitionNames('[data-hero]');
    expect(el.style.viewTransitionName).toBe('none');
    restore();
    expect(el.style.viewTransitionName).toBe('');
    el.remove();
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

describe('withViewTransitionAsync / waitForImage', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    delete doc.startViewTransition;
    window.matchMedia = originalMatchMedia;
    document.body.innerHTML = '';
  });

  it('flushes the sync part, then awaits the async part, inside one transition', async () => {
    const order: string[] = [];
    let done: Promise<unknown> = Promise.resolve();
    doc.startViewTransition = vi.fn((arg: (() => Promise<void>) | { update: () => Promise<void> }) => {
      done = (typeof arg === 'function' ? arg : arg.update)();
    });
    setReducedMotion(false);
    const started = withViewTransitionAsync(
      () => { order.push('sync'); },
      async () => { order.push('async'); },
    );
    await done;
    expect(started).toBe(true);
    expect(doc.startViewTransition).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['sync', 'async']);
  });

  it('without support (or reduced motion) just runs both parts, no transition', async () => {
    setReducedMotion(true);
    doc.startViewTransition = vi.fn();
    const sync = vi.fn();
    const asyncPart = vi.fn(async () => {});
    expect(withViewTransitionAsync(sync, asyncPart)).toBe(false);
    expect(doc.startViewTransition).not.toHaveBeenCalled();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(asyncPart).toHaveBeenCalledTimes(1);
  });

  it('waitForImage resolves when the target image has loaded', async () => {
    document.body.innerHTML = '<div data-hero><img></div>';
    const img = document.querySelector('img')!;
    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 600 });
    await expect(waitForImage('[data-hero]', 1000)).resolves.toBeUndefined();
  });

  it('waitForImage gives up after the timeout when nothing loads', async () => {
    document.body.innerHTML = '';
    const t0 = performance.now();
    await waitForImage('[data-missing]', 50);
    expect(performance.now() - t0).toBeGreaterThanOrEqual(45);
  });
});

