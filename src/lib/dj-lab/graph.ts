/**
 * Web Audio graph for one deck, and the scheduling of a transition onto two decks (#345).
 * The same code drives the live mix (AudioContext) and the offline A/B renders (OfflineAudioContext),
 * so the variant you vote on is exactly what the live deck would play.
 *
 * Deck: source → sweep high-pass ×2 → Linkwitz-Riley split into lows (< 150 Hz), mids and highs (> 2 kHz)
 * → band gains → trim → out. mix_set.py takes the mids as input − lows − highs, which only cancels with its
 * zero-phase filters: with the browser's, a "killed" low band left 50 Hz 2.6 dB down and 80–150 Hz 3–7 dB up.
 * Its gain curves come from plan.ts.
 */
import { barTime, type TrackAnalysis } from './analysis';
import { incomingGains, lowCutOf, outgoingGains, sampleCurve, sweepOf, type BandGains, type TransitionPlan } from './plan';

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
/** Butterworth Q for Web Audio's lowpass / highpass, which read Q in dB (allpass reads it linear) */
const BUTTERWORTH_Q_DB = 20 * Math.log10(Math.SQRT1_2);

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
  // 4th-order Linkwitz-Riley crossovers (two Butterworths in series): a low/high pair sums to an allpass
  const lr4 = (from: AudioNode, type: BiquadFilterType, hz: number) => {
    const a = ctx.createBiquadFilter();
    const b = ctx.createBiquadFilter();
    for (const f of [a, b]) {
      f.type = type;
      f.frequency.value = hz;
      f.Q.value = BUTTERWORTH_Q_DB;
    }
    from.connect(a);
    a.connect(b);
    return [a, b] as const;
  };
  const lo = lr4(hp[1], 'lowpass', 150);
  const rest = lr4(hp[1], 'highpass', 150);
  const mid = lr4(rest[1], 'lowpass', 2000);
  const hi = lr4(rest[1], 'highpass', 2000);
  // the lows take the 2 kHz crossover's allpass too, so the three bands sum flat
  const loPhase = ctx.createBiquadFilter();
  loPhase.type = 'allpass';
  loPhase.frequency.value = 2000;
  loPhase.Q.value = Math.SQRT1_2;
  lo[1].connect(loPhase);
  const stage = (): BandStage => ({ lo: ctx.createGain(), mid: ctx.createGain(), hi: ctx.createGain() });
  const gIn = stage();
  const gOut = stage();
  const trim = ctx.createGain();
  trim.gain.value = 10 ** (trimDb / 20);
  loPhase.connect(gIn.lo);
  mid[1].connect(gIn.mid);
  hi[1].connect(gIn.hi);
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
    nodes: [src, ...hp, ...lo, ...rest, ...mid, ...hi, loPhase, ...Object.values(gIn), ...Object.values(gOut), trim],
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
  releaseBuffer(deck.src);
}

/**
 * Drop a finished source's hold on its audio. iOS keeps every track that has played: the phone memory
 * test died after 7 loads of a 188 MB decode that were played, where 20 that weren't played ran fine.
 */
export function releaseBuffer(src: AudioBufferSourceNode) {
  try {
    src.buffer = null;
  } catch {
    // a browser that refuses lets go when the node goes
  }
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
  const cut = lowCutOf(plan);
  if (cut) {
    // into the cut over 1/32 bar, like the band gains' smoothing; a rise climbs to the drop; A keeps it until it's gone
    const t0 = tEntry + cut.from * barSec;
    for (const f of deck.hp) {
      f.frequency.setValueAtTime(BYPASS_HZ, Math.max(tEntry, t0 - barSec / 32));
      f.frequency.exponentialRampToValueAtTime(cut.f0, t0);
      if (cut.f1 !== cut.f0) f.frequency.exponentialRampToValueAtTime(cut.f1, tEntry + cut.to * barSec);
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
  const cut = lowCutOf(plan);
  if (cut) {
    // B's low end stays out until its drop (rising with A's on a rise), then opens on the downbeat (over 1/32 bar: no click)
    const tS = tEntry + cut.to * barSec;
    const tOpen = Math.max(tEntry, tS - barSec / 32);
    for (const f of deck.hp) {
      f.frequency.value = cut.f0;
      if (cut.f1 !== cut.f0) {
        f.frequency.setValueAtTime(cut.f0, Math.max(tEntry, tEntry + cut.from * barSec));
        f.frequency.exponentialRampToValueAtTime(cut.f1, tOpen);
      } else {
        f.frequency.setValueAtTime(cut.f0, tOpen);
      }
      f.frequency.exponentialRampToValueAtTime(BYPASS_HZ, tS);
    }
  }
}

export interface PlacedTransition {
  /** ctx time B's cue bar plays (= A at its entry bar) */
  tEntry: number;
  /** played seconds per bar during the blend */
  barSec: number;
  /** B's played seconds per bar: barSec, except on a tempo jump (B at its own tempo) */
  barSecB: number;
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
  if (plan.jump) {
    // B starts on A's bar line at its own tempo; no lock (the beats never overlap)
    const bRate = plan.jump.toBpm / B.bpm;
    const barSecB = B.barLen / bRate;
    const tEnd = tEntry + Math.max(plan.N * barSec, (plan.S + 1) * barSecB);
    return { tEntry, barSec, barSecB, bWhen: tEntry, bOffset: Math.max(0, barTime(B, plan.cueB)), bRate, tEnd };
  }
  const rateB = B.barLen / barSec;
  const bRate = rateB * (1 + (lock?.drift ?? 0));
  let bOffset = barTime(B, plan.cueB) + (lock?.shift ?? 0) * rateB;
  let bWhen = tEntry;
  if (bOffset < 0) {
    bWhen = tEntry - bOffset / bRate;
    bOffset = 0;
  }
  return { tEntry, barSec, barSecB: barSec, bWhen, bOffset, bRate, tEnd: tEntry + (plan.N + 1) * barSec };
}
