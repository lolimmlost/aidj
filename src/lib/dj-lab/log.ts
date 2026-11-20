/**
 * The Lab's flight recorder: what the engine, the AudioContext and the page did, kept in this
 * browser across reloads and shipped to the server log (`🎛️ [LAB …]`), so a set that dies on a
 * phone leaves a trail.
 *
 * iOS kills a page that uses too much memory without firing any event. While a set plays the engine
 * leaves a heartbeat in localStorage; the next page load finds a heartbeat that says "playing" and
 * was never closed cleanly, and logs that the previous page died, with what it was doing.
 *
 * The Lab has no log panel: in the app's debug mode (Eruda, `localStorage.debug`) every event is also
 * written to the console, where Eruda shows it.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LabLogEntry {
  seq: number;
  /** wall clock, ms */
  t: number;
  /** page load this came from */
  sid: string;
  ev: string;
  level: LogLevel;
  data?: Record<string, unknown>;
}

export interface LabBeat {
  sid: string;
  t: number;
  status: string;
  song?: string;
  pos?: number;
  next?: string;
  ctx?: string;
  heldMB?: number;
  /** what was being fetched/decoded */
  busy?: string;
  /** set by pagehide: the page went away on purpose (reload, close, navigate) */
  clean?: boolean;
}

const KEY = 'aidj:dj-lab:log';
const BEAT_KEY = 'aidj:dj-lab:beat';
const KEEP = 400;
const ENDPOINT = '/api/dj/lab-log';
const FLUSH_MS = 4000;
const BATCH = 100;

interface Stored {
  seq: number;
  /** highest seq the server has */
  sent: number;
  entries: LabLogEntry[];
}

/** What the boot script in the page's <head> knows (src/lib/utils/boot-watchdog.ts, #446). */
interface BootPage {
  id: string;
  /** when the HTML was parsed that far */
  t0: number;
  /** set when the app is running: the watchdog then stays quiet */
  started?: number;
  /** set when the watchdog reported the app as not started */
  stalled?: number;
}
const bootPage = (): BootPage | undefined =>
  typeof window === 'undefined' ? undefined : (window as Window & { __aidjPage?: BootPage }).__aidjPage;
// the boot script names the page as its HTML parses, so its report and this log share the id
const sid = bootPage()?.id ?? Math.random().toString(36).slice(2, 8);
let store: Stored | null = null;
let started = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
/** highest seq of the batch a flush has in flight: the beacon leaves those to it */
let inFlight = 0;
const listeners = new Set<() => void>();
/** what is being fetched/decoded right now, for the heartbeat */
const busy = new Map<number, string>();
let busySeq = 0;

const isBrowser = () => typeof window !== 'undefined';

let mirror: boolean | null = null;
/** debug mode (Eruda) is read once per page load, as Eruda is */
function debugMode(): boolean {
  if (mirror === null) {
    try {
      mirror = localStorage.getItem('debug') === 'true';
    } catch {
      mirror = false;
    }
  }
  return mirror;
}

function load(): Stored {
  if (store) return store;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    store = s && Array.isArray(s.entries) ? s : { seq: 0, sent: 0, entries: [] };
  } catch {
    store = { seq: 0, sent: 0, entries: [] };
  }
  return store;
}

function save() {
  if (!store) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // full or blocked: the in-memory log still ships
  }
}

const round = (v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v);

/** Record one event. Cheap enough for every state change; not for per-frame calls. */
export function labLog(ev: string, data?: Record<string, unknown>, level: LogLevel = 'info') {
  if (!isBrowser()) return;
  const s = load();
  const clean = data ? Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined).map(([k, v]) => [k, round(v)])) : undefined;
  const entry: LabLogEntry = { seq: ++s.seq, t: Date.now(), sid, ev, level, data: clean };
  // a new array each time, so useSyncExternalStore sees the change
  s.entries = [...s.entries, entry].slice(-KEEP);
  save();
  // console.debug: Eruda shows it, and the debug mode's console streaming (log/info/warn/error) doesn't send it twice
  if (debugMode()) console.debug(`🎛️ ${formatEntry(entry)}`);
  for (const fn of listeners) fn();
  scheduleFlush(level === 'info' ? FLUSH_MS : 0);
}

/** Mark a fetch/decode as in flight (shows in the heartbeat); returns the call that ends it. */
export function labBusy(what: string): () => void {
  const id = ++busySeq;
  busy.set(id, what);
  return () => busy.delete(id);
}

let lastBeatLogged = 0;
/** Called every few seconds while a set runs; every 30 s it also lands in the log. */
export function labBeat(beat: Omit<LabBeat, 'sid' | 't' | 'busy'>) {
  if (!isBrowser()) return;
  const b: LabBeat = { ...beat, sid, t: Date.now(), busy: [...busy.values()].join(', ') || undefined };
  try {
    localStorage.setItem(BEAT_KEY, JSON.stringify(b));
  } catch {
    // ignore
  }
  if (b.status !== 'idle' && b.t - lastBeatLogged >= 30_000) {
    lastBeatLogged = b.t;
    labLog('beat', { status: b.status, song: b.song, pos: b.pos, next: b.next, ctx: b.ctx, heldMB: b.heldMB, busy: b.busy });
  }
}

function markClean(of = sid) {
  try {
    const b = JSON.parse(localStorage.getItem(BEAT_KEY) ?? 'null') as LabBeat | null;
    if (b && b.sid === of) localStorage.setItem(BEAT_KEY, JSON.stringify({ ...b, clean: true }));
  } catch {
    // ignore
  }
}

function unsent(): LabLogEntry[] {
  const s = load();
  return s.entries.filter((e) => e.seq > s.sent);
}

function scheduleFlush(ms: number) {
  if (flushTimer) {
    if (ms > 0) return;
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, ms);
}

async function flush() {
  if (flushing) return;
  const batch = unsent().slice(0, BATCH);
  if (!batch.length) return;
  flushing = true;
  inFlight = batch[batch.length - 1].seq;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: batch, ua: navigator.userAgent }),
    });
    // a 4xx won't change on a retry (signed out, not an admin): drop the batch
    if (res.ok || (res.status >= 400 && res.status < 500)) {
      const s = load();
      s.sent = Math.max(s.sent, batch[batch.length - 1].seq);
      save();
    }
  } catch {
    // offline or the page is going away: the next flush (or the next page load) sends it
  } finally {
    flushing = false;
    inFlight = 0;
  }
  if (unsent().length) scheduleFlush(FLUSH_MS);
}

/** pagehide / hidden: hand what's left to the browser, which sends it even if the page dies. */
function beacon() {
  const batch = unsent()
    .filter((e) => e.seq > inFlight)
    .slice(-BATCH);
  if (!batch.length || !navigator.sendBeacon) return;
  const ok = navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify({ entries: batch, ua: navigator.userAgent })], { type: 'application/json' }));
  if (ok) {
    const s = load();
    s.sent = Math.max(s.sent, batch[batch.length - 1].seq);
    save();
  }
}

const vis = () => (typeof document !== 'undefined' ? document.visibilityState : 'unknown');

/**
 * A page that died mid-set left a "playing" heartbeat that was never closed: log it (once) and send it.
 * The app calls this on every load, so reopening on any page reports it, not only on the Lab.
 */
export function checkPreviousLabPage() {
  if (!isBrowser()) return;
  try {
    const prev = JSON.parse(localStorage.getItem(BEAT_KEY) ?? 'null') as LabBeat | null;
    if (prev && prev.sid !== sid && !prev.clean && prev.status !== 'idle') {
      const { sid: prevSid, t, ...rest } = prev;
      labLog('previous page died mid-set', { prevSid, lastBeatAgoSec: Math.round((Date.now() - t) / 1000), lastBeatAt: new Date(t).toISOString(), path: location.pathname, ...rest }, 'error');
      // reported once
      markClean(prevSid);
    }
  } catch {
    // ignore
  }
}

/**
 * Once per page load: report a previous page that died mid-set, log the device, and watch the page
 * lifecycle and uncaught errors. Safe to call more than once.
 */
export function startLabLog() {
  if (!isBrowser() || started) return;
  started = true;
  checkPreviousLabPage();
  startPageLog();
}

const LAST_LOAD_KEY = 'aidj:page:last-load';
let pageLogStarted = false;

/** The page's address as the referrer gives it: a path on this site, "elsewhere", or nothing. */
function referrerPath(): string | undefined {
  if (!document.referrer) return undefined;
  try {
    const u = new URL(document.referrer);
    return u.origin === location.origin ? u.pathname : 'elsewhere';
  } catch {
    return undefined;
  }
}

/** How this page started, for the "page load" event. */
function pageLoadInfo(): Record<string, unknown> {
  const nav = navigator as Navigator & { deviceMemory?: number; audioSession?: { type: string }; standalone?: boolean };
  const timing =
    typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function'
      ? (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
      : undefined;
  const now = Date.now();
  const boot = bootPage();
  if (boot) boot.started = now;
  // the previous page load in this storage, by any copy of the app
  let prev: { sid?: string; t?: number; path?: string } | null = null;
  try {
    prev = JSON.parse(localStorage.getItem(LAST_LOAD_KEY) ?? 'null');
    localStorage.setItem(LAST_LOAD_KEY, JSON.stringify({ sid, t: now, path: location.pathname }));
  } catch {
    // storage blocked
  }
  return {
    path: location.pathname,
    // navigate (a launch, a link, an address), reload, back_forward or prerender
    nav: timing?.type,
    from: referrerPath(),
    visibility: vis(),
    // from the HTML being parsed to the app running; a slow one may already have been reported as stuck
    bootMs: boot ? now - boot.t0 : undefined,
    stallReported: boot?.stalled ? true : undefined,
    ttfbMs: timing && timing.responseStart > 0 ? Math.round(timing.responseStart) : undefined,
    prevLoad: prev?.sid ? { sid: prev.sid, agoSec: Math.round((now - (prev.t ?? now)) / 1000), path: prev.path } : undefined,
    // Chrome only: the browser threw this tab away to save memory and loaded it again
    discarded: (document as Document & { wasDiscarded?: boolean }).wasDiscarded || undefined,
    ua: navigator.userAgent,
    deviceMemoryGB: nav.deviceMemory,
    cores: navigator.hardwareConcurrency,
    pwa: nav.standalone ?? window.matchMedia?.('(display-mode: standalone)').matches,
    audioSession: nav.audioSession?.type,
    // the app's debug console: it hooks fetch and keeps response bodies
    eruda: 'eruda' in window || undefined,
  };
}

/**
 * Once per page load, on every page (#446): log how the page started, then its lifecycle and uncaught
 * errors. On iOS more than one copy of the app can run at once (#443); with this each copy's own trail
 * reaches the server log under its page id. The Lab calls it too. Safe to call more than once.
 */
export function startPageLog() {
  if (!isBrowser() || pageLogStarted) return;
  pageLogStarted = true;
  labLog('page load', pageLoadInfo());
  document.addEventListener('visibilitychange', () => {
    labLog('visibility', { state: vis() });
    if (vis() === 'hidden') beacon();
  });
  window.addEventListener('pagehide', (e) => {
    labLog('pagehide', { persisted: e.persisted });
    markClean();
    beacon();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) labLog('pageshow from bfcache');
  });
  document.addEventListener('freeze', () => labLog('page frozen'));
  document.addEventListener('resume', () => labLog('page resumed'));
  window.addEventListener('online', () => labLog('online'));
  window.addEventListener('offline', () => labLog('offline', undefined, 'warn'));
  window.addEventListener('error', (e) => labLog('uncaught error', { msg: e.message, src: e.filename ? `${e.filename}:${e.lineno}` : undefined }, 'error'));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; name?: string } | undefined;
    // Safari also reports a cancelled download's body as unhandled; the cancel itself is logged
    const aborted = r?.name === 'AbortError';
    labLog('unhandled rejection', { msg: r?.message ?? String(e.reason), name: r?.name }, aborted ? 'info' : 'error');
  });
  // whatever the last page didn't get to send
  scheduleFlush(500);
}

export function labLogEntries(): LabLogEntry[] {
  return isBrowser() ? load().entries : [];
}

export function subscribeLabLog(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function clearLabLog() {
  const s = load();
  s.entries = [];
  s.sent = s.seq;
  save();
  for (const fn of listeners) fn();
}

export const labLogSid = () => sid;
/**
 * This page load's id, app-wide (#446): the same one as `🎛️ [LAB <id>]`, the debug console's
 * `[CLIENT] [<id>]` and the playback socket's `page=<id>`, so one copy of the app can be followed
 * through all three.
 */
export const pageId = labLogSid;

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour12: false }) + `.${String(t % 1000).padStart(3, '0')}`;

export function formatEntry(e: LabLogEntry): string {
  const data = e.data && Object.keys(e.data).length ? ' ' + Object.entries(e.data).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ') : '';
  return `${clock(e.t)} [${e.sid}]${e.level === 'info' ? '' : ` ${e.level.toUpperCase()}`} ${e.ev}${data}`;
}

export function labLogText(entries = labLogEntries()): string {
  return entries.map(formatEntry).join('\n');
}
