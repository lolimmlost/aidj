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

export interface DeckNodes {
  src: AudioBufferSourceNode;
  hp: BiquadFilterNode[];
  gLo: GainNode;
  gMid: GainNode;
  gHi: GainNode;
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
  const gLo = ctx.createGain();
  const gMid = ctx.createGain();
  const gHi = ctx.createGain();
  const trim = ctx.createGain();
  trim.gain.value = 10 ** (trimDb / 20);
  lo[1].connect(gLo);
  hi[1].connect(gHi);
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
  midSum.connect(gMid);
  for (const g of [gLo, gMid, gHi]) g.connect(trim);
  trim.connect(dest);
  return {
    src,
    hp,
    gLo,
    gMid,
    gHi,
    trim,
    nodes: [src, ...hp, ...lo, ...hi, gLo, gMid, gHi, trim, midSum, invLo, invHi],
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
  for (const n of deck.nodes) n.disconnect();
}

/** Put every band gain at `g` from `when` on, dropping anything scheduled after it. */
export function resetGains(deck: DeckNodes, when: number, g: BandGains = { lo: 1, mid: 1, hi: 1 }) {
  for (const [param, v] of [
    [deck.gLo.gain, g.lo],
    [deck.gMid.gain, g.mid],
    [deck.gHi.gain, g.hi],
  ] as const) {
    param.cancelScheduledValues(when);
    param.setValueAtTime(v, when);
  }
  for (const f of deck.hp) {
    f.frequency.cancelScheduledValues(when);
    f.frequency.setValueAtTime(BYPASS_HZ, when);
  }
}

function curve(deck: DeckNodes, fn: (bar: number) => BandGains, b0: number, b1: number, start: number, barSec: number) {
  const dur = (b1 - b0) * barSec;
  for (const band of ['lo', 'mid', 'hi'] as const) {
    const param = { lo: deck.gLo.gain, mid: deck.gMid.gain, hi: deck.gHi.gain }[band];
    // the curve sets its own first value; an event at the same time can trip NotSupportedError
    param.setValueCurveAtTime(sampleCurve((b) => fn(b)[band], b0, b1), start, dur);
  }
}

/** A's side: band fades from the blend start to A's end, plus the high-pass sweep when the plan sweeps. */
export function scheduleOutgoing(deck: DeckNodes, plan: TransitionPlan, tEntry: number, barSec: number) {
  curve(deck, (b) => outgoingGains(plan, b), 0, plan.N + 1, tEntry, barSec);
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
  deck.gLo.gain.value = g0.lo;
  deck.gMid.gain.value = g0.mid;
  deck.gHi.gain.value = g0.hi;
  // run the curves until every band is fully up (a swept bass finishes 4 bars after the swap)
  curve(deck, (b) => incomingGains(plan, b), 0, Math.max(plan.N, plan.S + 4) + 2, tEntry, barSec);
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
