/**
 * Known transitions in the live Lab (Set prep "Next up"): the exits you've mixed out of the playing song,
 * and the recipe that lands your picked take on the same cue bars again.
 *
 * A take is stored as {kind, bars, entryA, cueB} (known_transitions.preferred). The planner doesn't take cue
 * bars directly; it picks an exit at or after `fromBar` and lands B on its entry drop. So a take becomes:
 * the technique (kind / play out / intro), its length, the earliest bar A may go out at (`outAt` = the take's
 * entryA, so the planner can't pick an earlier drop), and B's entry drop worked out from cueB. When this
 * browser still has the saved set the take came from, its full recipe (bass, kill, depth) comes along too.
 */
import type { KnownTechniquePick, KnownTransition, TransitionStatus } from '@/lib/db/schema/known-transitions.schema';
import { canonicalNavidromeId } from '@/lib/utils/navidrome-id';
import type { TrackAnalysis } from './analysis';
import { entryTarget, type EntryChoice, type Recipe, type TransitionPlan } from './plan';
import type { SavedSet } from './sets';

const STATUS_ORDER: Record<TransitionStatus, number> = { proven: 0, lab: 1, idea: 2, needs_work: 3 };

/** Exits out of `fromId`, proven first, needs work last; most played first within each. */
export function exitsFrom(rows: KnownTransition[], fromId: string): KnownTransition[] {
  const from = canonicalNavidromeId(fromId);
  return rows
    .filter((r) => r.fromSongId === from)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.plays - a.plays);
}

/**
 * The take the Lab mixes a pair with: your pick, unless you marked the pair needs work (then the rules
 * decide again). Untagged pairs have no pick: what auto-lock happened to play isn't a take you chose.
 */
export function takeOf(row: KnownTransition | undefined): KnownTechniquePick | null {
  if (!row?.preferred || row.status === 'needs_work') return null;
  return row.preferred;
}

/** B's entry choice that puts its drop at `cueB + bars`, the way the planner works it out (planDropchain). */
export function entryFor(B: TrackAnalysis, take: KnownTechniquePick): EntryChoice | undefined {
  if (take.cueB == null) return undefined;
  const drop = take.cueB + take.bars;
  // the default (no choice) first: B's own entry drop
  if (entryTarget(B, undefined) === drop) return undefined;
  for (const e of ['first-drop', 'main-drop'] as const) if (entryTarget(B, e) === drop) return e;
  return undefined;
}

/** The recipe a saved set played this take with, when this browser still has that set. */
export function savedRecipe(sets: SavedSet[], fromId: string, toId: string, take: KnownTechniquePick): Recipe | undefined {
  const from = canonicalNavidromeId(fromId);
  const to = canonicalNavidromeId(toId);
  for (const s of sets) {
    for (let i = 1; i < s.tracks.length; i++) {
      const a = s.tracks[i - 1];
      const b = s.tracks[i];
      if (a.id !== from || b.id !== to || !b.recipe) continue;
      if (b.kind === take.kind && b.bars === take.bars && (b.cues?.entryA ?? null) === take.entryA && (b.cues?.cueB ?? null) === take.cueB) return b.recipe;
    }
  }
  return undefined;
}

/**
 * The recipe that plays `take` again. Keys are set even when undefined on purpose: they override the set
 * defaults (opener plays out, 1st drops) the take wasn't mixed with. Your picker choices still win (engine).
 */
export function takeRecipe(take: KnownTechniquePick, B: TrackAnalysis | undefined, saved?: Recipe): Recipe {
  const { mode: _mode, ...base } = saved ?? {};
  const r: Recipe = { ...base, bars: take.bars, outAt: take.entryA ?? undefined };
  if (take.kind === 'chain' || take.kind === 'swap') {
    r.mode = 'dropchain';
    r.kind = take.kind;
    r.exit = base.exit === 'end' ? undefined : base.exit;
    r.entry = B ? entryFor(B, take) : base.entry;
  } else if (take.kind === 'playout') {
    r.exit = 'end';
    r.entry = base.entry ?? (B ? entryFor(B, take) : undefined);
  } else if (take.kind === 'intro') {
    r.mode = 'classic';
    r.cue = 'intro';
    r.exit = undefined;
  } else if (take.kind === 'droplands' || take.kind === 'longoutro') {
    r.mode = 'classic';
    r.exit = undefined;
  }
  return r;
}

/** Did the plan land on the take: same technique, length and cue bars. */
export function landsTake(plan: Pick<TransitionPlan, 'kind' | 'N' | 'entryA' | 'cueB'>, take: KnownTechniquePick): boolean {
  return plan.kind === take.kind && plan.N === take.bars && (take.entryA == null || plan.entryA === take.entryA) && (take.cueB == null || plan.cueB === take.cueB);
}

/** "SWAP 8 · OUT 64 → IN 32" */
export function takeLabel(take: Pick<KnownTechniquePick, 'kind' | 'bars'> & Partial<KnownTechniquePick>): string {
  const head = `${take.kind} ${take.bars}`.toUpperCase();
  return take.entryA != null && take.cueB != null ? `${head} · OUT ${take.entryA} → IN ${take.cueB}` : head;
}
