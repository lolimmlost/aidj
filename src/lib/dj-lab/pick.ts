/**
 * Auto-lock's next song (#375), steered by your thumbs (#384): a 👍 on A → B queues B the next time A
 * plays, with the set's own settings; a 👎 keeps auto-lock from picking B after A (you still can).
 * Liked songs get their head start in rankCandidates (#385). Also the queue's previews and liked runs (#373).
 */
import { fitOctave, type TrackAnalysis } from './analysis';
import { MAX_STRETCH, nameKey, rankCandidates, rankJumps, type Candidate, type LabSong } from './crate';
import { planJump, planSummary, planTransition, type MixMode, type TransitionPlan } from './plan';
import type { LabVote, SongRef } from './votes';

/** the same song: by id, else by artist + title (a retag can give the file a new id) */
const same = (a: SongRef, b: SongRef) => a.id === b.id || nameKey(a) === nameKey(b);

/**
 * Ranked candidates split into the ones you liked after `now` (most 👍 first, then rank order) and the
 * rest in rank order, where a 👎'd one carries a warning. Thumbs are net: a 👍 and a 👎 cancel out.
 */
export function splitByThumbs(ranked: Candidate[], now: SongRef, votes: LabVote[]): { liked: Candidate[]; rest: Candidate[] } {
  const flags = votes.filter((v) => v.kind === 'flag' && v.thumb && same(v.a, now));
  const scored = ranked.map((c) => {
    const net = flags.reduce((n, v) => (same(v.b, c.song) ? n + (v.thumb === 'up' ? 1 : -1) : n), 0);
    if (net > 0) return { c: { ...c, thumb: 'up' as const, reasons: [`👍 after ${now.title}`, ...c.reasons] }, net };
    if (net < 0) return { c: { ...c, thumb: 'down' as const, warnings: [`👎 after ${now.title}`, ...c.warnings] }, net };
    return { c, net };
  });
  return {
    liked: scored
      .filter((s) => s.net > 0)
      .sort((a, b) => b.net - a.net)
      .map((s) => s.c),
    rest: scored.filter((s) => s.net <= 0).map((s) => s.c),
  };
}

export interface AutoPick {
  song: LabSong;
  /** for the flight recorder */
  why: 'liked transition' | 'tempo window' | 'stretch' | 'tempo jump';
}

/**
 * The song auto-lock locks next. A liked transition first (anywhere it can stretch to: it outranks the
 * tempo window, but never forces a tempo jump); then the best pick in the tempo window; when that runs dry,
 * anything it can stretch; then the closest tempo jump. A small crate used to end the set in silence once
 * every match had played. Never a 👎'd pair.
 */
export function autoPick(
  current: { song: LabSong; analysis: TrackAnalysis },
  pool: { song: LabSong; analysis: TrackAnalysis }[],
  opts: {
    setBpm: number;
    played: Set<string>;
    mode: 'dropchain' | 'classic';
    window: { down: number; up: number };
    liked?: Set<string>;
  },
  votes: LabVote[],
): AutoPick | null {
  const { window, ...o } = opts;
  const split = (ranked: Candidate[]) => splitByThumbs(ranked, current.song, votes);
  const ok = (cs: Candidate[]) => cs.find((c) => c.thumb !== 'down')?.song;
  const stretchable = split(rankCandidates(current, pool, o));
  const liked = stretchable.liked[0]?.song;
  if (liked) return { song: liked, why: 'liked transition' };
  const inWindow = ok(split(rankCandidates(current, pool, { ...o, window })).rest);
  if (inWindow) return { song: inWindow, why: 'tempo window' };
  const stretch = ok(stretchable.rest);
  if (stretch) return { song: stretch, why: 'stretch' };
  const jumps = split(rankJumps(current, pool, o));
  const jump = ok([...jumps.liked, ...jumps.rest]);
  return jump ? { song: jump, why: 'tempo jump' } : null;
}

export interface QueuePreview {
  song: LabSong;
  /** "chain, 8 bars", "tempo jump 126 → 150", or why it can't be planned yet */
  line: string;
  plan?: TransitionPlan;
  /** the set tempo once it plays (a tempo jump moves it) */
  bpm: number;
}

/**
 * The transitions a queue would play (#373), each song planned against the one before it from the cached
 * analyses, the way the engine plans a lock: a preview, since the real plan is made when each one locks (from
 * where the song before it actually is by then). `from` is the locked song, or the playing one.
 */
export function previewQueue(
  from: { song: LabSong; analysis: TrackAnalysis } | undefined,
  queue: LabSong[],
  analyses: Map<string, TrackAnalysis>,
  opts: { setBpm: number; mode: MixMode },
): QueuePreview[] {
  let bpm = opts.setBpm;
  let A = from ? fitOctave(from.analysis, bpm) : undefined;
  return queue.map((song) => {
    const own = analyses.get(song.id);
    if (!own) {
      A = undefined;
      return { song, line: 'not analysed yet', bpm };
    }
    const fitted = fitOctave(own, bpm);
    const jump = Math.abs(bpm / fitted.bpm - 1) > MAX_STRETCH;
    const B = jump ? own : fitted;
    const prev = A;
    A = B;
    if (!prev) return { song, line: 'after a song not analysed yet', bpm };
    const o = { mode: opts.mode, fromBar: prev.de, floorBar: prev.de, setBpm: bpm };
    const plan = jump ? planJump(prev, B, o) : planTransition(prev, B, o);
    if (plan?.jump) bpm = Math.round(plan.jump.toBpm * 10) / 10;
    return { song, plan: plan ?? undefined, line: plan ? planSummary(plan) : 'no exit left in the song before', bpm };
  });
}

/**
 * A run of liked transitions from `from` (#384 in the #373 queue): each next song the one you 👍'd most after
 * the song before it, within stretch, never one already played or queued. Up to `max` songs.
 */
export function likedRun(
  from: { song: LabSong; analysis: TrackAnalysis },
  pool: { song: LabSong; analysis: TrackAnalysis }[],
  opts: { setBpm: number; played: Set<string>; mode: MixMode; liked?: Set<string> },
  votes: LabVote[],
  max = 6,
): LabSong[] {
  const run: LabSong[] = [];
  const taken = new Set(opts.played);
  let cur = from;
  while (run.length < max) {
    const next = splitByThumbs(rankCandidates(cur, pool, { ...opts, played: taken }), cur.song, votes).liked[0];
    if (!next) break;
    run.push(next.song);
    taken.add(next.song.id);
    cur = pool.find((p) => p.song.id === next.song.id) ?? { song: next.song, analysis: next.analysis };
  }
  return run;
}
