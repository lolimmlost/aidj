/**
 * Auto-lock's next song (#375), steered by your thumbs (#384): a 👍 on A → B queues B the next time A
 * plays, with the set's own settings; a 👎 keeps auto-lock from picking B after A (you still can).
 * Liked songs get their head start in rankCandidates (#385).
 */
import type { TrackAnalysis } from './analysis';
import { nameKey, rankCandidates, rankJumps, type Candidate, type LabSong } from './crate';
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
