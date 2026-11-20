/**
 * Other copies of the app open in this browser (#446).
 *
 * On iOS the PWA can run more than one copy at once. A hidden one keeps playing next to the one on
 * screen, with the same storage and device id, and the two take the audio from each other (#443).
 * Nothing in the server log told the copies apart.
 *
 * On load a page asks every other copy on a BroadcastChannel to answer. Each answers with what it
 * is doing (path, visibility, age, playing or not). The new page logs "other copies open" with the
 * answers; each copy that answers logs "another copy opened". The server log then shows both sides,
 * each under its own page id.
 */

export type CopyInfo = Record<string, unknown>;
export type CopyLog = (ev: string, data?: Record<string, unknown>, level?: 'info' | 'warn' | 'error') => void;

/** The part of BroadcastChannel this uses (tests pass a fake). */
export interface CopiesChannel {
  postMessage(msg: unknown): void;
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
  removeEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
  close?(): void;
}

export interface WatchCopiesOptions {
  /** this page's id (the flight recorder's) */
  id: string;
  /** what this copy is doing; sent with every hello and answer */
  describe: () => CopyInfo;
  log: CopyLog;
  /** default: a BroadcastChannel; null where there is none */
  channel?: CopiesChannel | null;
  /** how long the new page collects answers before logging them */
  collectMs?: number;
  now?: () => number;
}

export const COPIES_CHANNEL = 'aidj:pages';
const COLLECT_MS = 1500;

interface CopyMessage {
  type: 'hello' | 'here';
  from: string;
  info?: CopyInfo;
}

const isCopyMessage = (m: unknown): m is CopyMessage => {
  const msg = m as CopyMessage | null;
  return !!msg && (msg.type === 'hello' || msg.type === 'here') && typeof msg.from === 'string';
};

/** Ask the other copies who they are, and answer the ones that open later. Returns the stop. */
export function watchPageCopies(opts: WatchCopiesOptions): () => void {
  const ownChannel = opts.channel === undefined;
  const ch: CopiesChannel | null = ownChannel
    ? typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(COPIES_CHANNEL)
    : (opts.channel ?? null);
  if (!ch) return () => {};

  const now = opts.now ?? Date.now;
  const loadedAt = now();
  const info = (): CopyInfo => ({ ...opts.describe(), ageSec: Math.round((now() - loadedAt) / 1000) });
  const answers = new Map<string, CopyInfo>();
  let collecting = true;

  const onMessage = (e: MessageEvent) => {
    const msg = e.data as unknown;
    if (!isCopyMessage(msg) || msg.from === opts.id) return;
    if (msg.type === 'hello') {
      // a copy opened while this one is alive: answer it, and say so in this copy's own log
      const me = info();
      ch.postMessage({ type: 'here', from: opts.id, info: me } satisfies CopyMessage);
      opts.log('another copy opened', { other: msg.from, otherPath: msg.info?.path, otherVisibility: msg.info?.visibility, ...me }, 'warn');
    } else if (collecting) {
      answers.set(msg.from, { id: msg.from, ...msg.info });
    } else {
      // a copy that was suspended answers when it runs again
      opts.log('other copy answered late', { id: msg.from, ...msg.info }, 'warn');
    }
  };

  ch.addEventListener('message', onMessage);
  ch.postMessage({ type: 'hello', from: opts.id, info: info() } satisfies CopyMessage);
  const timer = setTimeout(() => {
    collecting = false;
    if (answers.size) opts.log('other copies open', { count: answers.size, copies: [...answers.values()] }, 'warn');
  }, opts.collectMs ?? COLLECT_MS);

  return () => {
    clearTimeout(timer);
    ch.removeEventListener('message', onMessage);
    if (ownChannel) ch.close?.();
  };
}
