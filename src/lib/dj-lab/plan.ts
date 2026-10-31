/**
 * Transition planning for the Transition Lab (#345): mix_set.py's rules, for a live deck.
 *
 * - dropchain (g2a–g2d, the default): tracks play drop to drop. 'swap' = B's drop replaces A's next
 *   drop (B's build over A's breakdown) when that drop is no bigger (≤ 1 dB) and A's breakdown is short
 *   (≤ 24 bars); else 'chain' = B's drop lands as A's drop section ends. Hard bass swap on B's drop with
 *   a 4-bar pre-drop kill (8 bars above 150 BPM, rule 12).
 * - classic (g1): B's intro over A's end, an 8-bar blend + bass filter sweep; 32 bars + hard swap when
 *   A has a ≥32-bar beats-only outro; B's drop lands as A ends when it sits near B's start.
 *
 * Live difference from mix_set: A is already playing, so the plan takes the first exit point that
 * starts at or after `fromBar` (later drop sections of A, then A's end).
 */
import type { TrackAnalysis } from './analysis';
import { meanOf, percentile } from './dsp';

export type MixMode = 'dropchain' | 'classic';
export type TransitionKind = 'chain' | 'swap' | 'droplands' | 'longoutro' | 'intro' | 'cut' | 'playout';

export type ExitChoice = 'section' | 'next-drop' | 'end';
export type EntryChoice = 'first-drop' | 'main-drop' | 'intro';

/** Overrides an A/B variant can set; anything left out follows the rules. */
export interface Recipe {
  mode?: MixMode;
  /** dropchain: force chain or swap (swap only where A has a next drop) */
  kind?: 'chain' | 'swap';
  bass?: 'swap' | 'sweep';
  /** blend length in bars */
  bars?: number;
  /** bars of A's bass kill before B's drop (swap bass) */
  kill?: number;
  /** classic: B comes in at its intro even when its drop is near the start */
  cue?: 'auto' | 'intro';
  /**
   * Where A goes out (#375): after this drop section (chain), into its next drop (swap), or played
   * out to its last beat bar.
   */
  exit?: ExitChoice;
  /** Where B comes in (#375): its earliest drop, its main drop, or from the top */
  entry?: EntryChoice;
}

export interface TransitionPlan {
  mode: MixMode;
  kind: TransitionKind;
  /** blend length (bars) */
  N: number;
  /** bar of the blend where the bass swaps (B's drop in dropchain) */
  S: number;
  /** A's bar where B starts */
  entryA: number;
  /** B's bar heard at entryA */
  cueB: number;
  bass: 'swap' | 'sweep';
  /** bars of A's bass kill before S */
  kill: number;
  /** B's top held back until S - hold (chain without a verified lock, rule 1) */
  hold: number;
  /** A's bar where A is gone */
  endA: number;
  /** B's entry drop: the floor for B's own exit */
  deB: number;
  /** dropchain: next-drop lift and breakdown length that picked swap vs chain */
  lift: number | null;
  breakdown: number | null;
  how: string;
  /** a requested choice that couldn't be honoured, and what was done instead */
  unmet?: string;
}

export interface PlanOptions {
  mode: MixMode;
  /** earliest A bar the blend may start at (now + lead time) */
  fromBar: number;
  /** A's entry drop, or 0 for the opening track (its exit blend may start anywhere) */
  floorBar: number;
  /** the set tempo during the blend */
  setBpm: number;
  recipe?: Recipe;
}

const floor4 = (n: number) => Math.floor(n / 4) * 4;

/** End of a drop section that starts at bar d: first 4-bar block from 16 bars on with the low end 6 dB under the track's high level. */
function dropSectionEnd(A: TrackAnalysis, d: number, hiA: number): number {
  let E1 = d + 32;
  for (let b = d + 16; b < d + 33; b += 4) {
    if (meanOf(A.el, b, b + 4) < hiA - 6) {
      E1 = b;
      break;
    }
  }
  return Math.min(E1, d + floor4(A.last - 1 - d));
}

/** B's drop to land on for an entry choice; null = from the top (intro) */
export function entryTarget(B: TrackAnalysis, entry?: EntryChoice): number | null {
  if (entry === 'intro') return null;
  const drops = [...B.drops, ...(B.drop !== null ? [B.drop] : [])];
  if (entry === 'first-drop' && drops.length) return Math.min(...drops);
  if (entry === 'main-drop' && B.drop !== null) return B.drop;
  return B.de;
}

const hasDrops = (t: TrackAnalysis) => t.drops.length > 0 || t.drop !== null;

export function planDropchain(A: TrackAnalysis, B: TrackAnalysis, opts: PlanOptions): TransitionPlan | null {
  const r = opts.recipe ?? {};
  const forced = r.kind ?? (r.exit === 'section' ? 'chain' : r.exit === 'next-drop' ? 'swap' : undefined);
  const target = entryTarget(B, r.entry);
  const hiA = percentile(A.el.slice(A.first, A.last + 1), 60);
  const eA = (b: number) => meanOf(A.kw, b, b + 8);
  // A's drop sections from its entry drop on: the first exit that's still ahead of `fromBar` wins
  const base = opts.floorBar > 0 ? opts.floorBar : A.de;
  const sectionStarts = [...new Set([base, ...A.drops.filter((d) => d > base)])].sort((x, y) => x - y);
  const kill = r.kill ?? (opts.setBpm > 150 ? 8 : 4);
  for (const d of sectionStarts) {
    const nxt = A.drops.filter((x) => d + 32 <= x && x <= d + 96 && x <= A.last - 1);
    const E1 = dropSectionEnd(A, d, hiA);
    const lift = nxt.length ? Math.round((eA(nxt[0]) - eA(d)) * 10) / 10 : null;
    let brk = 0;
    if (nxt.length) {
      let run = 0;
      for (let b = E1; b < nxt[0]; b++) {
        run = A.el[b] < hiA - 6 ? run + 1 : 0;
        brk = Math.max(brk, run);
      }
    }
    const ruleSwap = nxt.length > 0 && lift !== null && lift <= 1 && brk <= 24;
    const swap = forced ? forced === 'swap' && nxt.length > 0 : ruleSwap;
    const kind: TransitionKind = swap ? 'swap' : 'chain';
    const Dx = swap ? nxt[0] : E1;
    const Nmax = r.bars ?? (swap ? 16 : 8);
    // the opener has no entry blend, so its first exit blend may reach back to bar 0
    const floor = opts.floorBar === 0 && d === sectionStarts[0] ? 0 : d;
    // B from the top: its own intro, no build length limit; otherwise the build before the chosen drop
    const N = Math.max(4, Math.min(Nmax, target === null ? Nmax : floor4(target - B.first), Dx - floor));
    const entryA = Dx - N;
    if (entryA < opts.fromBar || Dx > A.nBars - 1) continue;
    const cueB = target === null ? B.first : Math.max(0, target - N);
    const into = target === null ? "B's intro" : target === B.de ? "B's drop" : `B's ${target === entryTarget(B, 'first-drop') ? 'first' : 'main'} drop`;
    return {
      mode: 'dropchain',
      kind,
      N,
      S: N,
      entryA,
      cueB,
      bass: r.bass ?? 'swap',
      kill: Math.min(kill, N),
      hold: 0,
      endA: entryA + N + 1,
      deB: target ?? B.de,
      lift,
      breakdown: nxt.length ? brk : null,
      how: `${kind}: ${into} on A bar ${Dx - A.first} (${Dx - d} bars after A's drop), ${N}-bar ${target === null ? 'blend' : 'build'}`,
      unmet:
        forced === 'swap' && kind !== 'swap'
          ? "Into A's next drop isn't possible here (no next drop in range): chained instead"
          : forced === 'swap' && !ruleSwap
            ? `Heads-up: ${brk} bars of A's breakdown before that drop${lift !== null && lift > 1 ? `, and that drop is ${lift} dB bigger than this one` : ''} (rule 3)`
            : undefined,
    };
  }
  return null;
}

export function planClassic(A: TrackAnalysis, B: TrackAnalysis, opts: PlanOptions): TransitionPlan | null {
  const r = { ...opts.recipe, ...(opts.recipe?.entry === 'intro' ? { cue: 'intro' as const } : {}) };
  const dropBar = r.entry ? entryTarget(B, r.entry) : B.drop;
  const D = dropBar === null ? null : dropBar - B.first;
  let kind: TransitionKind;
  let N: number;
  let cue: number;
  let S: number;
  if (r.cue !== 'intro' && D !== null && D <= 16) {
    kind = 'droplands';
    N = Math.max(8, floor4(D));
    cue = (dropBar as number) - N;
    S = N;
  } else if (r.cue !== 'intro' && D !== null && A.outro >= 32 && D <= 96) {
    kind = 'longoutro';
    N = 32;
    cue = (dropBar as number) - N;
    S = N;
  } else {
    kind = 'intro';
    N = A.outro >= 32 ? 32 : 8;
    cue = B.first;
    S = N === 32 ? 8 : 4;
  }
  if (r.bars) {
    N = r.bars;
    if (kind === 'intro') S = N >= 24 ? 8 : 4;
    else {
      S = N;
      cue = (dropBar as number) - N;
    }
  }
  cue = Math.max(0, cue);
  const endA = Math.min(A.last + 1, A.nBars);
  const entryA = endA - N;
  if (entryA < opts.fromBar) return null;
  const how = {
    droplands: `drop lands as A ends (B drop ${D} bars in)`,
    longoutro: `drop lands as A ends over A's long outro (B drop ${D} bars in)`,
    intro: "B's intro over A's end",
  }[kind as 'droplands' | 'longoutro' | 'intro'];
  return {
    mode: 'classic',
    kind,
    N,
    S,
    entryA,
    cueB: cue,
    bass: r.bass ?? (N >= 24 ? 'swap' : 'sweep'),
    kill: r.kill ?? 1,
    hold: 0,
    endA: entryA + N + 1,
    deB: opts.mode === 'dropchain' ? B.de : cue + N,
    lift: null,
    breakdown: null,
    how,
  };
}

/**
 * Last resort when A has no phrase exit left (its last beat bar is behind the playhead, e.g. a long
 * beatless outro): cut on the next bar line into a 4-bar build and B's drop. Without it every lock
 * failed with "no exit left" and auto-lock cycled through the whole crate.
 */
export function planCut(A: TrackAnalysis, B: TrackAnalysis, opts: PlanOptions): TransitionPlan | null {
  if (B.nBars < 8) return null;
  const N = 4;
  const entryA = Math.max(0, opts.fromBar);
  const target = B.drop !== null ? B.de : B.first;
  return {
    mode: opts.mode,
    kind: 'cut',
    N,
    S: N,
    entryA,
    cueB: Math.max(0, target - N),
    bass: 'swap',
    kill: N,
    hold: 0,
    endA: entryA + N + 1,
    deB: B.drop !== null ? B.de : target + N,
    lift: null,
    breakdown: null,
    how: `cut: no phrase exit left in A, B's ${B.drop !== null ? 'drop' : 'intro'} lands ${N} bars after the cut`,
  };
}

/**
 * Play A out (#375): the blend sits on A's last beat bars. With a drop entry, B's chosen drop lands as
 * A ends (16-bar build, 32 over a long beats-only outro, shorter if B's build is); with an intro entry,
 * B's intro rides over A's end (the classic recipe).
 */
export function planPlayOut(A: TrackAnalysis, B: TrackAnalysis, opts: PlanOptions): TransitionPlan | null {
  const r = opts.recipe ?? {};
  const target = hasDrops(B) ? entryTarget(B, r.entry) : null;
  const endA = Math.min(A.last + 1, A.nBars);
  let N: number;
  let S: number;
  let cueB: number;
  if (target === null) {
    N = r.bars ?? (A.outro >= 32 ? 32 : 8);
    S = N >= 24 ? 8 : 4;
    cueB = B.first;
  } else {
    N = r.bars ?? Math.max(4, Math.min(A.outro >= 32 ? 32 : 16, floor4(target - B.first)));
    S = N;
    cueB = Math.max(0, target - N);
  }
  const entryA = endA - N;
  if (entryA < opts.fromBar || entryA < 0) return null;
  const onDrop = target !== null;
  return {
    mode: opts.mode,
    kind: 'playout',
    N,
    S,
    entryA,
    cueB,
    bass: r.bass ?? (onDrop || N >= 24 ? 'swap' : 'sweep'),
    // a drop entry keeps the deep pre-drop break (rule 2); an intro blend swaps over one bar
    kill: Math.min(r.kill ?? (onDrop ? (opts.setBpm > 150 ? 8 : 4) : 1), N),
    hold: 0,
    endA: entryA + N + 1,
    deB: target ?? B.de,
    lift: null,
    breakdown: null,
    how: onDrop
      ? `play out: B's ${r.entry === 'first-drop' ? 'first drop' : r.entry === 'main-drop' ? 'main drop' : 'drop'} lands as A ends, ${N}-bar build`
      : `play out: B's intro over A's last ${N} bars`,
  };
}

/** The first feasible exit for A into B; dropchain falls back to the classic end-of-track blend, then a cut. */
export function planTransition(A: TrackAnalysis, B: TrackAnalysis, opts: PlanOptions): TransitionPlan | null {
  const r = opts.recipe ?? {};
  const mode = r.mode ?? opts.mode;
  const o = { ...opts, mode };
  const notes: string[] = [];
  if (r.exit === 'end') {
    const p = planPlayOut(A, B, o);
    if (p) return p;
    notes.push("Play out isn't possible: A's last beat bar is too close or behind the playhead");
  }
  if ((r.entry === 'first-drop' || r.entry === 'main-drop') && !hasDrops(B)) notes.push(`B has no drop to come in on: ${r.entry === 'first-drop' ? 'first' : 'main'} drop ignored`);
  const withNotes = (p: TransitionPlan | null) => {
    if (!p) return p;
    const all = [...notes, ...(p.unmet ? [p.unmet] : [])];
    return all.length ? { ...p, unmet: all.join('; ') } : p;
  };
  if (mode === 'dropchain' && hasDrops(A) && (hasDrops(B) || r.entry === 'intro')) {
    const p = planDropchain(A, B, o);
    if (p) return withNotes(p);
  }
  return withNotes(planClassic(A, B, o) ?? planCut(A, B, o));
}

/* ---------- gain curves (shared by the live deck and the offline A/B render) ---------- */

export interface BandGains {
  lo: number;
  mid: number;
  hi: number;
}

const ramp = (t: number, x0: number, x1: number, v0: number, v1: number) => {
  const v = v0 + ((v1 - v0) * (t - x0)) / (x1 - x0);
  return Math.min(Math.max(v, Math.min(v0, v1)), Math.max(v0, v1));
};

/** B's band gains at `tb` bars after its cue (mix_set step 5, xin). */
export function incomingGains(p: TransitionPlan, tb: number): BandGains {
  const { N, S } = p;
  if (tb < 0) return { lo: 0, mid: 0, hi: 0 };
  let hi = tb < S ? ramp(tb, 0, S, 0.5, 1) : 1;
  let mid = tb < S ? ramp(tb, 0, S, 0, 0.8) ** 1.5 : tb < S + 1 ? 0.9 : 1;
  if (p.hold) {
    const h = ramp(tb, S - p.hold - 1, S - p.hold, 0, 1);
    hi *= h;
    mid *= h;
  }
  let lo: number;
  if (p.bass === 'sweep') lo = ramp(tb, S - 4, S + 4, 0, 1);
  else {
    lo = tb >= S ? 1 : 0;
    // long blends: one bar of A's bass back at S+8 (B's bass out for it)
    if (N >= 24 && S + 9 <= N && tb >= S + 8 && tb < S + 9) lo = 0;
  }
  return { lo, mid, hi };
}

/** A's band gains at `tbo` bars after the blend starts (mix_set step 5, xout). */
export function outgoingGains(p: TransitionPlan, tbo: number): BandGains {
  const { N, S } = p;
  if (tbo < 0) return { lo: 1, mid: 1, hi: 1 };
  if (tbo >= N + 1) return { lo: 0, mid: 0, hi: 0 };
  const top = S < N ? (tbo < S ? 1 : ramp(tbo, S, N, 1, 0)) : ramp(tbo, N - 4, N + 1, 1, 0);
  let lo: number;
  if (p.bass === 'swap') {
    lo = tbo < S - p.kill ? 1 : 0;
    if (N >= 24 && S + 9 <= N && tbo >= S + 8 && tbo < S + 9) lo = 1;
  } else {
    lo = S + 4 < N + 1 ? (tbo < S + 4 ? 1 : ramp(tbo, S + 4, N + 1, 1, 0)) : 1;
  }
  return { lo, mid: top, hi: top };
}

/** A's high-pass sweep (sweep bass): 20 → 600 Hz from S-4 to S+4 bars. */
export function sweepOf(p: TransitionPlan): { from: number; to: number; f0: number; f1: number } | null {
  return p.bass === 'sweep' ? { from: p.S - 4, to: p.S + 4, f0: 20, f1: 600 } : null;
}

/**
 * Sample a gain curve for an AudioParam value curve: `stepsPerBar` points per bar from bar `b0` to
 * `b1`, smoothed over 1/16 bar like mix_set's uniform filter (no clicks on hard swaps).
 */
export function sampleCurve(fn: (bar: number) => number, b0: number, b1: number, stepsPerBar = 64): Float32Array {
  const n = Math.max(2, Math.ceil((b1 - b0) * stepsPerBar) + 1);
  const raw = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) raw[i + 1] = raw[i] + fn(b0 + i / stepsPerBar);
  const w = Math.max(1, Math.round(stepsPerBar / 16));
  const half = Math.floor(w / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i - half + w);
    out[i] = (raw[hi] - raw[lo]) / (hi - lo);
  }
  return out;
}

/** "play out · first drop · sweep · 16 bars": the picker choices in a recipe, for history and votes */
export function describeRecipe(r: Recipe): string {
  const exit = { section: 'after the drop', 'next-drop': "into A's next drop", end: 'play out' } as const;
  const entry = { 'first-drop': 'first drop', 'main-drop': 'main drop', intro: 'intro' } as const;
  return [
    r.exit && exit[r.exit],
    r.entry && entry[r.entry],
    r.bass && (r.bass === 'sweep' ? 'sweep' : 'hard swap'),
    r.bars && `${r.bars} bars`,
  ]
    .filter(Boolean)
    .join(' · ');
}
