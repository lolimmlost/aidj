/**
 * View Transitions helpers (#289). Everything here is progressive
 * enhancement: without browser support, or under reduced motion, updates
 * apply immediately with no animation. Visual only — never on the audio path.
 */
import { flushSync } from 'react-dom';

type StartViewTransition = (arg: (() => void | Promise<void>) | { update: () => void | Promise<void>; types?: string[] }) => unknown;

function getStart(): StartViewTransition | null {
  if (typeof document === 'undefined') return null;
  const doc = document as Document & { startViewTransition?: StartViewTransition };
  return typeof doc.startViewTransition === 'function'
    ? (arg) => doc.startViewTransition!(arg) // keep `this` = document
    : null;
}

/** True when a view transition would actually animate. */
export function canViewTransition(): boolean {
  if (!getStart()) return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Whether `:active-view-transition-type()` (typed transitions) is supported. */
export function supportsViewTransitionTypes(): boolean {
  return typeof window !== 'undefined'
    && !!window.CSS?.supports?.('selector(:active-view-transition-type(a))');
}

/**
 * Run a React state update inside a view transition. The current DOM is
 * captured first, then `update` is flushed synchronously so the browser can
 * capture the new state. Returns whether a transition was started.
 */
export function withViewTransition(update: () => void, types?: string[]): boolean {
  const start = getStart();
  if (!start || !canViewTransition()) {
    update();
    return false;
  }
  // flushSync is the point: the browser captures the new snapshot as soon as
  // this callback returns, so React must have committed the update by then.
  // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- required by the View Transitions API
  const run = () => flushSync(update);
  start(types && supportsViewTransitionTypes() ? { update: run, types } : run);
  return true;
}

/**
 * Give one element a view-transition-name for the next transition only
 * (e.g. the album card that was tapped), so names stay unique even when the
 * same album appears in two lists. Cleared after the transition window.
 */
export function nameForNextTransition(el: Element | null | undefined, name: string, clearAfterMs = 1000) {
  if (!(el instanceof HTMLElement) || !canViewTransition()) return;
  el.style.viewTransitionName = name;
  setTimeout(() => {
    if (el.style.viewTransitionName === name) el.style.viewTransitionName = '';
  }, clearAfterMs);
}

/**
 * Like withViewTransition, but the update may be async (e.g. a route change):
 * `syncPart` is flushed first, then the browser keeps showing the old snapshot
 * until `asyncPart` resolves, and captures the new state after that.
 */
export function withViewTransitionAsync(
  syncPart: () => void,
  asyncPart: () => Promise<unknown>,
  types?: string[],
): boolean {
  const start = getStart();
  if (!start || !canViewTransition()) {
    syncPart();
    void asyncPart();
    return false;
  }
  const run = async () => {
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- required by the View Transitions API
    flushSync(syncPart);
    await asyncPart();
  };
  start(types && supportsViewTransitionTypes() ? { update: run, types } : run);
  return true;
}

/**
 * Resolve once the element matching `selector` exists and its <img> (if any)
 * has loaded, or after `timeoutMs`. Used so a morph lands on the real image of
 * a page that's still loading instead of an empty placeholder.
 */
export function waitForImage(selector: string, timeoutMs = 600): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      const img = document.querySelector<HTMLImageElement>(`${selector} img`);
      if ((img && img.complete && img.naturalWidth > 0) || performance.now() - t0 > timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}
