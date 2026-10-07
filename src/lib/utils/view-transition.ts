/**
 * View Transitions helpers (#289). Everything here is progressive
 * enhancement: without browser support, or under reduced motion, updates
 * apply immediately with no animation. Visual only — never on the audio path.
 */
import { flushSync } from 'react-dom';

type StartViewTransition = (arg: (() => void) | { update: () => void; types?: string[] }) => unknown;

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
