/**
 * Picking a Lab set back up after its page went away mid-set (#439).
 *
 * A set gets lost on a phone in two ways:
 *  - the page dies (iOS kills a page that runs out of memory). The next load finds the heartbeat the
 *    set left in localStorage, never closed (log.ts), and
 *  - the app opens a second copy of itself. On 2026-11-19 leaving the Lab started a fresh page on
 *    /dashboard while the Lab page kept running hidden: the new copy's Lab was idle ("a new set"),
 *    and only swiping back found the set.
 * Either way the heartbeat says which set, song and position it was at. The Lab offers to resume
 * there. A resume first tells every other window of the app to stop its copy, so two never play.
 */
// storage and the window channel only: log.ts (loaded on every page) imports this, so no runtime
// imports here. Planning a resume lives in resume-plan.ts, which only the Lab loads.
import type { LabBeat } from './log';

export type ResumeReason = 'died' | 'other-window';

export interface ResumePoint extends Omit<LabBeat, 'clean'> {
  /** "died": the page is gone; "other-window": it was still beating in another copy of the app */
  reason: ResumeReason;
  savedAt: number;
}

const KEY = 'aidj:dj-lab:resume';
/** an older offer is stale: that set is long over */
export const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const listeners = new Set<() => void>();

const notify = () => {
  for (const fn of listeners) fn();
};

/** Keep what the lost page was playing, so the Lab can offer to resume it. */
export function saveResumePoint(beat: LabBeat, reason: ResumeReason) {
  const { clean: _clean, ...rest } = beat;
  if (!rest.song && !rest.songId) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...rest, reason, savedAt: Date.now() } satisfies ResumePoint));
  } catch {
    // storage blocked: nothing to offer
  }
  notify();
}

export function loadResumePoint(now = Date.now()): ResumePoint | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ResumePoint | null;
    // aged from the set's last heartbeat, not from the offer: a page found dead days later is a
    // days-old set
    if (!p || typeof p.t !== 'number' || now - p.t > RESUME_MAX_AGE_MS) return null;
    return p.song || p.songId ? p : null;
  } catch {
    return null;
  }
}

let cachedRaw: string | null | undefined;
let cachedPoint: ResumePoint | null = null;
/** loadResumePoint, the same object until the stored offer changes (for useSyncExternalStore). */
export function resumeSnapshot(): ResumePoint | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // storage blocked: nothing stored
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPoint = loadResumePoint();
  }
  return cachedPoint;
}

/** Resumed, dismissed, or a new set started: the offer goes away. */
export function clearResumePoint() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  notify();
}

export function subscribeResume(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The engine's song label ("Artist – Title") back into its parts. */
export function parseSongLabel(label?: string): { artist: string; title: string } | null {
  if (!label) return null;
  const i = label.indexOf(' – ');
  return i > 0 ? { artist: label.slice(0, i), title: label.slice(i + 3) } : { artist: '', title: label };
}

/** The next song's label without the state the heartbeat prefixes it with ("locked Artist – Title"). */
export function nextSongLabel(next?: string): string | undefined {
  // a failed lock isn't a song to come back to
  if (!next || next.startsWith('failed ')) return undefined;
  return next.replace(/^(loading|locked|committed|mixing) /, '');
}

// ─── one set across windows ──────────────────────────────────────────────────

const CHANNEL = 'aidj:dj-lab';
let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel === undefined) channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  return channel;
}

/** Tell the Lab in every other window of the app to stop its set: this window takes it over. */
export function announceTakeOver(from: string) {
  getChannel()?.postMessage({ type: 'take-over', from });
}

/** Run `fn` when another window takes the set over. */
export function onTakeOver(self: string, fn: () => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (e: MessageEvent) => {
    const msg = e.data as { type?: string; from?: string } | null;
    if (msg?.type === 'take-over' && msg.from !== self) fn();
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}
