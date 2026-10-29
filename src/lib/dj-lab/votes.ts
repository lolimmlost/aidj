/**
 * Lab votes and flags, kept in this browser for the prototype (#349 moves them into the DB).
 * Export gives a JSON file shaped for docs/design/dj-transitions/votes and regression/labels.tsv.
 */
import type { LockResult } from './lock';
import type { Recipe, TransitionPlan } from './plan';

export type VoteChoice = 'L' | 'R' | 'both' | 'neither';

export interface SongRef {
  id: string;
  title: string;
  artist: string;
}

export interface VariantRecord {
  label: string;
  recipe: Recipe;
  plan: Pick<TransitionPlan, 'mode' | 'kind' | 'N' | 'S' | 'bass' | 'kill' | 'hold' | 'entryA' | 'cueB' | 'how'>;
  lock: Pick<LockResult, 'p90Ms' | 'points' | 'verified'>;
}

export interface LabVote {
  id: string;
  at: string;
  kind: 'ab' | 'flag';
  a: SongRef;
  b: SongRef;
  setBpm: number;
  /** ab: the factor, both variants, and which one was on the left */
  factor?: string;
  variants?: VariantRecord[];
  left?: number;
  choice?: VoteChoice;
  /** label of the winning variant, when one won */
  winner?: string | null;
  /** flag: thumbs on a live transition */
  thumb?: 'up' | 'down';
  plan?: VariantRecord['plan'];
  lock?: VariantRecord['lock'];
  tags: string[];
  note: string;
}

export const QUICK_TAGS = ['perfect', 'flam', 'off the beat', 'energy dip', 'too early', 'too long', 'muddy', 'weaker drop'];

const KEY = 'aidj:dj-lab:votes';

export function loadVotes(): LabVote[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as LabVote[];
  } catch {
    return [];
  }
}

export function saveVote(v: LabVote): LabVote[] {
  const all = [...loadVotes(), v];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage full or blocked: the vote still shows this session
  }
  return all;
}

export function deleteVote(id: string): LabVote[] {
  const all = loadVotes().filter((v) => v.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
  return all;
}

export function planRecord(p: TransitionPlan): VariantRecord['plan'] {
  return { mode: p.mode, kind: p.kind, N: p.N, S: p.S, bass: p.bass, kill: p.kill, hold: p.hold, entryA: p.entryA, cueB: p.cueB, how: p.how };
}

export function lockRecord(l: LockResult): VariantRecord['lock'] {
  return { p90Ms: l.p90Ms, points: l.points, verified: l.verified };
}

export function exportVotes(votes: LabVote[]) {
  const blob = new Blob([JSON.stringify(votes, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dj-lab-votes-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
