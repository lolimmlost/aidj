/**
 * Lab sets kept in this browser, so a tracklist survives Stop and reloads (the engine's history is
 * memory-only). Saved on every transition; the newest 20 sets are kept.
 */
import type { MixMode } from './plan';

export interface SavedTrack {
  id: string;
  title: string;
  artist: string;
  /** seconds from the start of the set to when it became audible */
  at: number;
  /** how it came in */
  kind?: string;
  bars?: number;
  lockMs?: number | null;
  locked?: boolean;
}

export interface SavedSet {
  id: string;
  startedAt: string;
  updatedAt: string;
  setBpm: number;
  mode: MixMode;
  tracks: SavedTrack[];
}

const KEY = 'aidj:dj-lab:sets';
const KEEP = 20;

export function loadSets(): SavedSet[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedSet[];
  } catch {
    return [];
  }
}

function write(sets: SavedSet[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sets.slice(0, KEEP)));
  } catch {
    // storage blocked or full: the set still shows this session
  }
}

/** Insert or update a set (newest first). */
export function saveSet(set: SavedSet) {
  write([set, ...loadSets().filter((s) => s.id !== set.id)]);
}

export function deleteSet(id: string): SavedSet[] {
  const sets = loadSets().filter((s) => s.id !== id);
  write(sets);
  return sets;
}

const fmt = (s: number) => {
  const v = Math.max(0, Math.round(s));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const sec = String(v % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

/** "0:00   1. Artist – Title" per line: the same format as the AIDJ mix sidecars. */
export function tracklistText(set: SavedSet): string {
  return set.tracks.map((t, i) => `${fmt(t.at).padStart(5)}  ${String(i + 1).padStart(2)}. ${t.artist} – ${t.title}`).join('\n');
}

export const setTime = fmt;
