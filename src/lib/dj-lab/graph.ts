/**
 * Web Audio graph for one deck, and the scheduling of a transition onto two decks (#345).
 * The same code drives the live mix (AudioContext) and the offline A/B renders (OfflineAudioContext),
 * so the variant you vote on is exactly what the live deck would play.
 *
 * Deck: source → sweep high-pass ×2 → split into lows (LP 150 ×2), highs (HP 2000 ×2) and mids
 * (input − lows − highs, so the bands always sum back to the input) → band gains → trim → out.
 * That's mix_set.py's band split; its gain curves come from plan.ts.
 */
import { barTime, type TrackAnalysis } from './analysis';
import { incomingGains, outgoingGains, sampleCurve, sweepOf, type BandGains, type TransitionPlan } from './plan';

export interface BandStage {
  lo: GainNode;
  mid: GainNode;
  hi: GainNode;
}

export interface DeckNodes {
  src: AudioBufferSourceNode;
  hp: BiquadFilterNode[];
  /**
   * Two gain stages per band, in series: the deck's fade-in runs on `in`, its later exit on `out`.
   * A deck that just came in still has its fade-in curve running when the next song is locked;
   * Firefox throws "Can't add events during a curve event" if that lock resets the same params.
   */
  in: BandStage;
  out: BandStage;
  trim: GainNode;
  /** every node, for disconnecting */
  nodes: AudioNode[];
}

const BYPASS_HZ = 10;

export function createDeck(ctx: BaseAudioContext, buffer: AudioBuffer, dest: AudioNode, trimDb = 0): DeckNodes {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const hp = [0, 1].map(() => {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = BYPASS_HZ;
    f.Q.value = Math.SQRT1_2;
    return f;
  });
  src.connect(hp[0]);
  hp[0].connect(hp[1]);
  const input = hp[1];
  const chain = (type: BiquadFilterType, hz: number) => {
    const a = ctx.createBiquadFilter();
    const b = ctx.createBiquadFilter();
    for (const f of [a, b]) {
      f.type = type;
      f.frequency.value = hz;
      f.Q.value = Math.SQRT1_2;
    }
    input.connect(a);
    a.connect(b);
    return [a, b] as const;
  };
  const lo = chain('lowpass', 150);
  const hi = chain('highpass', 2000);
  const stage = (): BandStage => ({ lo: ctx.createGain(), mid: ctx.createGain(), hi: ctx.createGain() });
  const gIn = stage();
  const gOut = stage();
  const trim = ctx.createGain();
  trim.gain.value = 10 ** (trimDb / 20);
  lo[1].connect(gIn.lo);
  hi[1].connect(gIn.hi);
  const midSum = ctx.createGain();
  const invLo = ctx.createGain();
  const invHi = ctx.createGain();
  invLo.gain.value = -1;
  invHi.gain.value = -1;
  input.connect(midSum);
  lo[1].connect(invLo);
  hi[1].connect(invHi);
  invLo.connect(midSum);
  invHi.connect(midSum);
  midSum.connect(gIn.mid);
  for (const band of ['lo', 'mid', 'hi'] as const) {
    gIn[band].connect(gOut[band]);
    gOut[band].connect(trim);
  }
  trim.connect(dest);
  return {
    src,
    hp,
    in: gIn,
    out: gOut,
    trim,
    nodes: [src, ...hp, ...lo, ...hi, ...Object.values(gIn), ...Object.values(gOut), trim, midSum, invLo, invHi],
  };
}

/**
 * Master bus: headroom for two overlapping decks → compressor → trim (Chrome's compressor adds its
 * own makeup gain) → soft clip that's linear below 0.8 and never passes 0.98. Returns its input.
 */
export function createMaster(ctx: BaseAudioContext): GainNode {
  const input = ctx.createGain();
  input.gain.value = 0.6;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value = 0;
  comp.ratio.value = 20;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  const trim = ctx.createGain();
  trim.gain.value = 0.8;
  const clip = ctx.createWaveShaper();
  const n = 4097;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a < 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18));
  }
  clip.curve = curve;
  clip.oversample = '2x';
  input.connect(comp);
  comp.connect(trim);
  trim.connect(clip);
  clip.connect(ctx.destination);
  return input;
}

export function disposeDeck(deck: DeckNodes) {
  try {
    deck.src.stop();
  } catch {
    // never started
  }
  // skipAhead swaps in a new source that isn't in `nodes`: disconnect it too, so nothing keeps the buffer
  deck.src.disconnect();
  for (const n of deck.nodes) n.disconnect();
}

/**
 * Undo a scheduled exit: the deck's `out` stage back at `g` from `when` on, sweep off. Only called
 * before the exit's curves start (unlock / relock are refused once committed), and the `in` stage
 * (a fade-in that may still be running) is never touched.
 */
export function resetGains(deck: DeckNodes, when: number, g: BandGains = { lo: 1, mid: 1, hi: 1 }) {
  for (const band of ['lo', 'mid', 'hi'] as const) {
    const param = deck.out[band].gain;
    param.cancelScheduledValues(when);
    param.setValueAtTime(g[band], when);
  }
  for (const f of deck.hp) {
    f.frequency.cancelScheduledValues(when);
    f.frequency.setValueAtTime(BYPASS_HZ, when);
  }
}

function curve(stage: BandStage, fn: (bar: number) => BandGains, b0: number, b1: number, start: number, barSec: number) {
  const dur = (b1 - b0) * barSec;
  for (const band of ['lo', 'mid', 'hi'] as const) {
    const param = stage[band].gain;
    // the curve sets its own first value; an event at the same time can trip NotSupportedError
    param.setValueCurveAtTime(sampleCurve((b) => fn(b)[band], b0, b1), start, dur);
  }
}

/** A's side: band fades from the blend start to A's end, plus the high-pass sweep when the plan sweeps. */
export function scheduleOutgoing(deck: DeckNodes, plan: TransitionPlan, tEntry: number, barSec: number) {
  curve(deck.out, (b) => outgoingGains(plan, b), 0, plan.N + 1, tEntry, barSec);
  const sw = sweepOf(plan);
  if (sw) {
    for (const f of deck.hp) {
      f.frequency.setValueAtTime(BYPASS_HZ, tEntry);
      f.frequency.setValueAtTime(sw.f0, tEntry + sw.from * barSec);
      f.frequency.exponentialRampToValueAtTime(sw.f1, tEntry + sw.to * barSec);
    }
  }
}

/** B's side: silent until its cue, then the band fade-ins up to the swap and a bar past it. */
export function scheduleIncoming(deck: DeckNodes, plan: TransitionPlan, tEntry: number, barSec: number) {
  const g0 = incomingGains(plan, 0);
  deck.in.lo.gain.value = g0.lo;
  deck.in.mid.gain.value = g0.mid;
  deck.in.hi.gain.value = g0.hi;
  // run the curves until every band is fully up (a swept bass finishes 4 bars after the swap)
  curve(deck.in, (b) => incomingGains(plan, b), 0, Math.max(plan.N, plan.S + 4) + 2, tEntry, barSec);
}

export interface PlacedTransition {
  /** ctx time B's cue bar plays (= A at its entry bar) */
  tEntry: number;
  /** played seconds per bar during the blend */
  barSec: number;
  /** B source start: ctx time and buffer offset */
  bWhen: number;
  bOffset: number;
  bRate: number;
  /** ctx time A is gone */
  tEnd: number;
}

/**
 * Where B goes, given A's clock: A's entry bar maps to ctx time `tEntry`; B plays its cue bar then,
 * advanced by the lock's shift, at A's played tempo trimmed by the lock's drift.
 */
export function placeTransition(
  A: TrackAnalysis,
  B: TrackAnalysis,
  plan: TransitionPlan,
  tEntry: number,
  rateA: number,
  lock: { shift: number; drift: number } | null,
): PlacedTransition {
  const barSec = A.barLen / rateA;
  const rateB = B.barLen / barSec;
  const bRate = rateB * (1 + (lock?.drift ?? 0));
  let bOffset = barTime(B, plan.cueB) + (lock?.shift ?? 0) * rateB;
  let bWhen = tEntry;
  if (bOffset < 0) {
    bWhen = tEntry - bOffset / bRate;
    bOffset = 0;
  }
  return { tEntry, barSec, bWhen, bOffset, bRate, tEnd: tEntry + (plan.N + 1) * barSec };
}
