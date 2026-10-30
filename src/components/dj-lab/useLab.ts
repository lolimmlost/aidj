import { useEffect, useState, useSyncExternalStore } from 'react';
import { getLabEngine } from '@/lib/dj-lab/engine';
import { analyseSong, BIG_FILE_BYTES, getCachedAnalysis, isPhone, loadCrate, type LabSong } from '@/lib/dj-lab/crate';
import type { TrackAnalysis } from '@/lib/dj-lab/analysis';

const noSubscribe = () => () => {};
/** false in the server render and during hydration, true after: gate what comes from localStorage */
export function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

export function useLabEngine() {
  const engine = getLabEngine();
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  return { engine, snap };
}

/** Re-render every `ms` while `active` (countdowns, bar counters). */
export function useTicker(active: boolean, ms = 250) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

export interface CrateState {
  songs: LabSong[];
  analyses: Map<string, TrackAnalysis>;
  loading: boolean;
  scanning: boolean;
  done: number;
  failed: number;
  /** big files (phones) waiting for the set to end */
  waiting: number;
  error?: string;
}

const EMPTY: CrateState = { songs: [], analyses: new Map(), loading: false, scanning: false, done: 0, failed: 0, waiting: 0 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** a song whose download a lock cancelled is tried again, this many times */
const MAX_TRIES = 3;

/**
 * Load a crate and analyse its songs one at a time in the background (IndexedDB-cached). Not keyed
 * on the set tempo: changing it would re-fetch the whole crate.
 *
 * The scan gets out of a set's way: a lock that starts loading cancels the scan's download (the song
 * goes back in the queue), and on a phone, big files (FLACs) wait until the set ends. Decoding a
 * 50 MB FLAC next to two playing decks is what got the page killed mid-set.
 */
export function useCrate(crateId: string | null): CrateState {
  const [state, setState] = useState<CrateState>(EMPTY);
  useEffect(() => {
    if (!crateId) {
      setState(EMPTY);
      return;
    }
    const engine = getLabEngine();
    let cancelled = false;
    let current: AbortController | null = null;
    // a lock needs the network more than the scan does
    const unsubscribe = engine.subscribe(() => {
      if (engine.getSnapshot().next?.state === 'loading') current?.abort();
    });
    setState({ ...EMPTY, loading: true });
    (async () => {
      let songs: LabSong[];
      try {
        songs = await loadCrate(crateId);
      } catch (e) {
        if (!cancelled) setState({ ...EMPTY, error: (e as Error).message });
        return;
      }
      if (cancelled) return;
      const analyses = new Map<string, TrackAnalysis>();
      const queue = [...songs];
      const waiting: LabSong[] = [];
      const tries = new Map<string, number>();
      const holdBig = isPhone();
      const live = () => engine.getSnapshot().status !== 'idle';
      let done = 0;
      let failed = 0;
      const publish = (scanning: boolean) => {
        if (!cancelled) setState({ songs, analyses: new Map(analyses), loading: false, scanning, done, failed, waiting: waiting.length });
      };
      publish(true);
      while (!cancelled && (queue.length || waiting.length)) {
        while (!cancelled && engine.getSnapshot().next?.state === 'loading') await sleep(500);
        let song = queue.shift();
        if (!song) {
          // only big files left: they wait for the set to end
          if (live()) {
            await sleep(2000);
            continue;
          }
          song = waiting.shift()!;
        } else if (holdBig && live() && (song.size ?? 0) > BIG_FILE_BYTES && !(await getCachedAnalysis(song.id))) {
          waiting.push(song);
          publish(true);
          continue;
        }
        current = new AbortController();
        try {
          analyses.set(song.id, await analyseSong(song, undefined, undefined, current.signal));
          done++;
        } catch (e) {
          if (cancelled) return;
          const n = (tries.get(song.id) ?? 0) + 1;
          tries.set(song.id, n);
          // cancelled for a lock: try it again after
          if ((e as Error).name === 'AbortError' && n < MAX_TRIES) queue.unshift(song);
          else failed++;
        } finally {
          current = null;
        }
        publish(true);
      }
      publish(false);
    })();
    return () => {
      cancelled = true;
      current?.abort();
      unsubscribe();
    };
  }, [crateId]);
  return state;
}

export const fmtTime = (s: number) => {
  const neg = s < 0;
  const v = Math.abs(Math.round(s));
  return `${neg ? '-' : ''}${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};
