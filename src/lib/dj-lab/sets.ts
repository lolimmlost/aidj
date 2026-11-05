/**
 * Lab sets kept in this browser, so a tracklist survives Stop and reloads (the engine's history is
 * memory-only). Saved on every transition; the newest 20 sets are kept. Each is also copied to the server
 * (/storage/sets), so a set can be rendered offline with its cues (#392).
 */
import type { MixMode, Recipe, TransitionPlan } from './plan';

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
  /** the picker choices it was mixed with (#375), e.g. "play out · first drop" */
  choice?: string;
  /** the full recipe it came in with, so a replay mixes it the same way */
  recipe?: Recipe;
  /** where the transition sat on both tracks' bar grids, kept for cue-exact replays later */
  cues?: SavedCues;
  /** the beat-lock correction B was placed with, when one was used (s, and rate trim) */
  lockShift?: number;
  lockDrift?: number;
}

export type SavedCues = Pick<TransitionPlan, 'kind' | 'entryA' | 'cueB' | 'N' | 'S' | 'kill' | 'bass' | 'endA' | 'deB' | 'hold' | 'jump'>;

export function cuesOf(p: TransitionPlan): SavedCues {
  return { kind: p.kind, entryA: p.entryA, cueB: p.cueB, N: p.N, S: p.S, kill: p.kill, bass: p.bass, endA: p.endA, deB: p.deB, hold: p.hold, jump: p.jump };
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

/** Insert or update a set (newest first), and copy it to the server. */
export function saveSet(set: SavedSet) {
  write([set, ...loadSets().filter((s) => s.id !== set.id)]);
  uploadSet(set);
}

const ENDPOINT = '/api/dj/lab-sets';

/** Copy a set to the server (#392), fire and forget: the browser's copy is the one the Lab reads. */
export function uploadSet(set: SavedSet) {
  if (typeof window === 'undefined') return;
  void fetch(ENDPOINT, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(set) }).catch(() => {});
}

let synced = false;
/** Once per page load: copy every set this browser kept (sets played before the copying existed too). */
export function syncSets() {
  if (synced) return;
  synced = true;
  for (const s of loadSets()) uploadSet(s);
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

/** "Thu, Oct 29, 9:04 PM": how a set is named in the list, its playlist and its replay */
export const setWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * The recipe to replay a track's entry with. Sets saved before recipes were kept give back their
 * transition kind and length (the rest is planned fresh).
 */
export function replayRecipe(t: SavedTrack): Recipe | undefined {
  if (t.recipe) return t.recipe;
  if (t.kind === 'chain' || t.kind === 'swap') return { kind: t.kind, bars: t.bars };
  return undefined;
}

