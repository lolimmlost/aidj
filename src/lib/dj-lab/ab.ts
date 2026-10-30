/**
 * Blind A/B of transition variants (#349), rendered offline with the live deck's graph (graph.ts).
 * One factor changes per comparison, like the Blend A/B rounds 1–3.
 */
import { barTime, dropLevelDb } from './analysis';
import { lockFor, type LoadedTrack } from './engine';
import { createDeck, createMaster, placeTransition, scheduleIncoming, scheduleOutgoing } from './graph';
import type { LockResult } from './lock';
import { planTransition, type MixMode, type Recipe, type TransitionPlan } from './plan';

export type Factor = 'bass' | 'length' | 'kind' | 'mode' | 'kill' | 'exit' | 'entry';

export const FACTORS: Record<Factor, { label: string; variants: [string, Recipe][] }> = {
  bass: { label: 'Bass: filter sweep vs hard swap', variants: [['sweep', { bass: 'sweep' }], ['swap', { bass: 'swap' }]] },
  length: { label: 'Blend: 8 vs 16 bars', variants: [['8 bars', { bars: 8 }], ['16 bars', { bars: 16 }]] },
  kind: { label: "Drop-chain: chain vs swap (B's drop replaces A's next)", variants: [['chain', { kind: 'chain' }], ['swap', { kind: 'swap' }]] },
  mode: { label: "Recipe: drop-chain vs classic (B's intro over A's end)", variants: [['drop-chain', { mode: 'dropchain' }], ['classic', { mode: 'classic' }]] },
  kill: { label: 'Pre-drop bass kill: 4 vs 8 bars', variants: [['kill 4', { kill: 4 }], ['kill 8', { kill: 8 }]] },
  exit: { label: 'A: drop-chain exit vs played out', variants: [['drop-chain exit', {}], ['play out', { exit: 'end' }]] },
  entry: { label: 'B: first drop vs main drop', variants: [['first drop', { entry: 'first-drop' }], ['main drop', { entry: 'main-drop' }]] },
};

export interface Variant {
  label: string;
  recipe: Recipe;
  plan: TransitionPlan;
  lock: LockResult;
  buffer: AudioBuffer;
  /** where in the clip B's cue and B's drop/swap land (s) */
  entryAt: number;
  swapAt: number;
}

const SR = 44100;
const PRE_BARS = 8;
const POST_BARS = 8;

/** Plan A → B as if A came in at its entry drop (an A/B isn't tied to the live position). */
export function planVariant(A: LoadedTrack, B: LoadedTrack, mode: MixMode, setBpm: number, recipe: Recipe) {
  return planTransition(A.analysis, B.analysis, { mode, fromBar: 0, floorBar: A.analysis.de, setBpm, recipe });
}

/** Render one variant: 8 bars of A before the blend, the blend, 8 bars of B after it. */
export async function renderVariant(A: LoadedTrack, B: LoadedTrack, setBpm: number, label: string, recipe: Recipe, mode: MixMode): Promise<Variant | null> {
  const plan = planVariant(A, B, mode, setBpm, recipe);
  if (!plan) return null;
  const a = A.analysis;
  const rateA = setBpm / a.bpm;
  const lock = lockFor(A, B, plan, rateA);
  if (plan.kind === 'chain' && !lock.verified) plan.hold = Math.min(4, plan.N);
  const barSec = a.barLen / rateA;
  const pre = Math.min(PRE_BARS, plan.entryA);
  const tEntry = pre * barSec;
  const len = (pre + Math.max(plan.N + 1, plan.S + 4) + POST_BARS) * barSec;
  const ctx = new OfflineAudioContext(2, Math.ceil(len * SR), SR);
  const master = createMaster(ctx);
  const ref = dropLevelDb(a);
  const trim = (x: number) => Math.max(-6, Math.min(6, x));
  const deckA = createDeck(ctx, A.buffer, master, 0);
  deckA.src.playbackRate.value = rateA;
  deckA.src.start(0, Math.max(0, barTime(a, plan.entryA - pre)));
  scheduleOutgoing(deckA, plan, tEntry, barSec);
  const useLock = lock.verified || lock.points >= 3 ? lock : null;
  const placed = placeTransition(a, B.analysis, plan, tEntry, rateA, useLock);
  const deckB = createDeck(ctx, B.buffer, master, trim(ref - dropLevelDb(B.analysis)));
  deckB.src.playbackRate.value = placed.bRate;
  scheduleIncoming(deckB, plan, tEntry, placed.barSec);
  deckB.src.start(placed.bWhen, placed.bOffset);
  const buffer = await ctx.startRendering();
  return { label, recipe, plan, lock, buffer, entryAt: tEntry, swapAt: tEntry + plan.S * barSec };
}

const same = (p: TransitionPlan, q: TransitionPlan) =>
  p.kind === q.kind && p.N === q.N && p.bass === q.bass && p.kill === q.kill && p.entryA === q.entryA && p.cueB === q.cueB && p.hold === q.hold;

/** Both variants of a factor, or a reason it doesn't apply to this pair. */
export async function renderPair(A: LoadedTrack, B: LoadedTrack, setBpm: number, mode: MixMode, factor: Factor): Promise<Variant[] | string> {
  const out: Variant[] = [];
  for (const [label, recipe] of FACTORS[factor].variants) {
    const v = await renderVariant(A, B, setBpm, label, recipe, mode);
    if (!v) return `No ${label} transition fits this pair`;
    out.push(v);
  }
  if (same(out[0].plan, out[1].plan)) return `Both variants come out the same for this pair (${out[0].plan.how})`;
  return out;
}
