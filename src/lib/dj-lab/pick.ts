/**
 * Auto-lock's next song (#375), steered by your thumbs (#384): a 👍 on A → B queues B the next time A
 * plays, with the set's own settings; a 👎 keeps auto-lock from picking B after A (you still can).
 * Liked songs get their head start in rankCandidates (#385); the tempo window's aim (#383) and the direction
 * a tempo jump keeps (#390) are in crate.ts. Also the queue's previews and liked runs (#373).
 */
import { fitOctave, type TrackAnalysis } from './analysis';
import { lastJump, MAX_STRETCH, nameKey, rankCandidates, rankJumps, windowTarget, type Candidate, type LabSong, type LastJump, type TempoBounds } from './crate';
import type { EngineSnapshot, LabDefaults, Picker } from './engine';
import { labLog } from './log';
import { planJump, planSummary, planTransition, type MixMode, type TransitionPlan } from './plan';
import { loadVotes, type LabVote, type SongRef } from './votes';

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

/** Where a pick stood when auto-lock made it, for the flight recorder (#383, #390). */
export interface PickLog {
  why: 'liked transition' | 'tempo window' | 'stretch' | 'tempo jump';
  /** the track's own tempo, as analysed */
  ownBpm: number;
  /** the set tempo it was ranked against */
  setBpm: number;
  /** how much faster than the set tempo it plays at its own tempo, counted at the octave it mixes at, % */
  faster: number;
  /** its place in the list it was picked from, 1 = the top, and that list's length */
  rank: number;
  of: number;
  /** the tempo window and where it aims (% faster than the set tempo), when the pick came out of it */
  window?: string;
  aim?: number;
  /** a tempo jump: which way it goes, which way the set's last one went, and the songs that came in since */
  jumpDir?: 'up' | 'down';
  lastJump?: 'up' | 'down';
  sinceJump?: number;
}

export interface AutoPick {
  song: LabSong;
  why: PickLog['why'];
  log: PickLog;
}

/**
 * The song auto-lock locks next. A liked transition first (anywhere it can stretch to: it outranks the
 * tempo window, but never forces a tempo jump); then the best pick in the tempo window; when that runs dry,
 * anything it can stretch; then a tempo jump: the closest one that keeps the direction of the set's last jump
 * (`last`, #390). A small crate used to end the set in silence once every match had played. Never a 👎'd pair.
 */
export function autoPick(
  current: { song: LabSong; analysis: TrackAnalysis },
  pool: { song: LabSong; analysis: TrackAnalysis }[],
  opts: {
    setBpm: number;
    played: Set<string>;
    mode: 'dropchain' | 'classic';
    window: TempoBounds;
    liked?: Set<string>;
    /** the set's last tempo jump (lastJump of the engine's history) */
    last?: LastJump;
  },
  votes: LabVote[],
): AutoPick | null {
  const { window, last, ...o } = opts;
  const split = (ranked: Candidate[]) => splitByThumbs(ranked, current.song, votes);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const pick = (why: PickLog['why'], list: Candidate[], more?: (c: Candidate) => Partial<PickLog>): AutoPick | null => {
    const at = list.findIndex((c) => c.thumb !== 'down');
    if (at < 0) return null;
    const c = list[at];
    const own = pool.find((p) => p.song.id === c.song.id)?.analysis.bpm ?? c.analysis.bpm;
    const log: PickLog = { why, ownBpm: r1(own), setBpm: o.setBpm, faster: r1((c.analysis.bpm / o.setBpm - 1) * 100), rank: at + 1, of: list.length, ...more?.(c) };
    return { song: c.song, why, log };
  };
  const stretchable = split(rankCandidates(current, pool, o));
  const inWindow = () => split(rankCandidates(current, pool, { ...o, window })).rest;
  const jumps = () => {
    const j = split(rankJumps(current, pool, { ...o, last }));
    return [...j.liked, ...j.rest];
  };
  return (
    pick('liked transition', stretchable.liked) ??
    pick('tempo window', inWindow(), () => ({ window: `−${window.down} … +${window.up} %`, aim: windowTarget(window) })) ??
    pick('stretch', stretchable.rest) ??
    pick('tempo jump', jumps(), (c) => ({ jumpDir: c.analysis.bpm < o.setBpm ? 'down' : 'up', lastJump: last?.dir, sinceJump: last?.since }))
  );
}

/** What auto-lock ranks against: the engine's snapshot, or the part of one a pick reads. */
export type PickerState = Pick<EngineSnapshot, 'setBpm' | 'mode' | 'history'> & { defaults: Pick<LabDefaults, 'tempoDown' | 'tempoUp'> };

/**
 * Auto-lock's picker for the engine (setPicker). `read` is asked at every pick, so it has to return the set as
 * it is right then (engine.getSnapshot): the engine picks the moment a song comes in, and after a tempo jump a
 * set tempo copied any earlier, say at the page's last render, is the one from before the jump. Ranking against
 * that copy swung the set between two tempos, a jump on every song (#390). Logs each pick, and hands the same
 * line to the engine for the song's `locked` event.
 */
export function autoPicker(read: () => PickerState, pool: { song: LabSong; analysis: TrackAnalysis }[], liked: Set<string>): Picker {
  return (now, played) => {
    const s = read();
    const pick = autoPick(
      { song: now.song, analysis: now.analysis },
      pool,
      { setBpm: s.setBpm, played, mode: s.mode, window: { down: s.defaults.tempoDown, up: s.defaults.tempoUp }, liked, last: lastJump(s.history) },
      // read at each pick: a thumb you just gave counts
      loadVotes(),
    );
    if (!pick) return null;
    const { why, setBpm, ...at } = pick.log;
    // pickSetBpm next to the engine's own setBpm on `locked`: the two differ only if a pick is ranked stale again
    const log = { pick: why, pickSetBpm: setBpm, ...at, likedSong: liked.has(pick.song.id) || undefined };
    labLog('auto pick', { song: `${pick.song.artist} – ${pick.song.title}`, ...log });
    return { song: pick.song, log };
  };
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
  opts: { setBpm: number; mode: MixMode; hard?: boolean },
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
    const o = { mode: opts.mode, fromBar: prev.de, floorBar: prev.de, setBpm: bpm, hard: opts.hard };
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
