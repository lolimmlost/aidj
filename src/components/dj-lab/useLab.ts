import { useEffect, useState, useSyncExternalStore } from 'react';
import { getLabEngine } from '@/lib/dj-lab/engine';
import { analyseSong, loadCrate, type LabSong } from '@/lib/dj-lab/crate';
import type { TrackAnalysis } from '@/lib/dj-lab/analysis';

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
  error?: string;
}

const EMPTY: CrateState = { songs: [], analyses: new Map(), loading: false, scanning: false, done: 0, failed: 0 };

/**
 * Load a crate and analyse its songs one at a time in the background (IndexedDB-cached), tracks
 * tagged near the set tempo first. Yields to a lock in progress, which needs the network more.
 */
export function useCrate(crateId: string | null, hint: number): CrateState {
  const [state, setState] = useState<CrateState>(EMPTY);
  useEffect(() => {
    if (!crateId) {
      setState(EMPTY);
      return;
    }
    const abort = new AbortController();
    let cancelled = false;
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
      let done = 0;
      let failed = 0;
      setState({ songs, analyses, loading: false, scanning: true, done, failed });
      const order = [...songs].sort((a, b) => Math.abs((a.bpm ?? 999) - hint) - Math.abs((b.bpm ?? 999) - hint));
      for (const song of order) {
        if (cancelled) return;
        while (!cancelled && getLabEngine().getSnapshot().next?.state === 'loading') {
          await new Promise((r) => setTimeout(r, 500));
        }
        try {
          analyses.set(song.id, await analyseSong(song, hint, undefined, abort.signal));
          done++;
        } catch {
          if (cancelled) return;
          failed++;
        }
        if (!cancelled) setState({ songs, analyses: new Map(analyses), loading: false, scanning: true, done, failed });
      }
      if (!cancelled) setState({ songs, analyses: new Map(analyses), loading: false, scanning: false, done, failed });
    })();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [crateId, hint]);
  return state;
}

export const fmtTime = (s: number) => {
  const neg = s < 0;
  const v = Math.abs(Math.round(s));
  return `${neg ? '-' : ''}${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};
