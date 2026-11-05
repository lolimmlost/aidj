import { describe, expect, it } from 'vitest';
import { track } from './fixtures';
import { describeRecipe, FULL_CUT_HZ, incomingGains, lowCutOf, outgoingGains, planJump, planTransition, RISE_HZ } from '../plan';
import { rankCandidates, rankJumps } from '../crate';
import { placeTransition } from '../graph';

// intro 16, build 16, drop 32 (bar 32), breakdown 16, drop 32 (bar 80), outro 16
const SHORT_BREAK = track([[16, -20], [16, -30], [32, -8], [16, -30], [32, -8], [16, -20]]);
// same, but a 40-bar breakdown before the second drop (Noizu: "went into low energy")
const LONG_BREAK = track([[16, -20], [16, -30], [32, -8], [40, -30], [32, -8], [16, -20]]);
const B = track([[16, -20], [16, -30], [32, -8], [16, -30], [32, -8], [16, -20]]);

const opts = { mode: 'dropchain' as const, fromBar: 0, floorBar: 32, setBpm: 128 };

describe('planTransition (drop-chain)', () => {
  it("swaps: B's drop replaces A's next drop after a short breakdown", () => {
    const p = planTransition(SHORT_BREAK, B, opts)!;
    expect(p.kind).toBe('swap');
    expect(p.entryA + p.S).toBe(80); // B's drop lands on A's second drop
    expect(p.N).toBe(16);
    expect(p.cueB).toBe(B.de - 16);
    expect(p.kill).toBe(4);
  });

  it('chains instead when the breakdown would be too long (rule 3)', () => {
    const p = planTransition(LONG_BREAK, B, opts)!;
    expect(p.kind).toBe('chain');
    expect(p.entryA + p.S).toBe(64); // as A's drop section ends
    expect(p.N).toBe(8);
  });

  it('takes the next exit when the first is already behind the playhead', () => {
    const p = planTransition(SHORT_BREAK, B, { ...opts, fromBar: 70 })!;
    // the swap into bar 80 starts at bar 64: gone. Next: chain out of the second drop's section
    expect(p.entryA).toBeGreaterThanOrEqual(70);
    expect(p.kind).toBe('chain');
    expect(p.entryA + p.S).toBe(112);
  });

  it('kills 8 bars of bass above 150 BPM (rule 12)', () => {
    expect(planTransition(SHORT_BREAK, B, { ...opts, setBpm: 155 })!.kill).toBe(8);
  });

  it('honours a recipe override', () => {
    const p = planTransition(SHORT_BREAK, B, { ...opts, recipe: { kind: 'chain', bass: 'sweep' } })!;
    expect(p.kind).toBe('chain');
    expect(p.bass).toBe('sweep');
  });

  it('cuts into B on the next bar when A has no phrase exit left (no "no exit left" loop)', () => {
    const p = planTransition(SHORT_BREAK, B, { ...opts, fromBar: SHORT_BREAK.last + 1 })!;
    expect(p.kind).toBe('cut');
    expect(p.entryA).toBe(SHORT_BREAK.last + 1);
    expect(p.cueB + p.S).toBe(B.de);
  });

  it("falls back to the classic blend over A's end when B has no drop", () => {
    const flat = track([[96, -10]]);
    const p = planTransition(SHORT_BREAK, flat, opts)!;
    expect(p.mode).toBe('classic');
    expect(p.kind).toBe('intro');
    expect(p.endA).toBe(SHORT_BREAK.last + 2);
  });
});

describe('transition choices (#375)', () => {
  // B with a short first drop at 32 and its main drop at 80 (the one the rules enter on)
  const TWO_DROPS = { ...B, drop: 80, de: 80 };

  it('plays A out: B lands its drop as A ends', () => {
    const p = planTransition(SHORT_BREAK, B, { ...opts, recipe: { exit: 'end' } })!;
    expect(p.kind).toBe('playout');
    expect(p.entryA + p.S).toBe(SHORT_BREAK.last + 1);
    expect(p.cueB + p.S).toBe(B.de);
    expect(p.unmet).toBeUndefined();
  });

  it('plays A out with B from the top when asked for the intro', () => {
    const p = planTransition(SHORT_BREAK, B, { ...opts, recipe: { exit: 'end', entry: 'intro' } })!;
    expect(p.kind).toBe('playout');
    expect(p.cueB).toBe(B.first);
  });

  it('says so when play out is no longer possible, and uses the next best exit', () => {
    const p = planTransition(SHORT_BREAK, B, { ...opts, fromBar: SHORT_BREAK.last, recipe: { exit: 'end' } })!;
    expect(p.kind).not.toBe('playout');
    expect(p.unmet).toMatch(/Play out isn't possible/);
  });

  it("brings B in on its first drop instead of the main one", () => {
    const rules = planTransition(SHORT_BREAK, TWO_DROPS, opts)!;
    const first = planTransition(SHORT_BREAK, TWO_DROPS, { ...opts, recipe: { entry: 'first-drop' } })!;
    expect(rules.cueB + rules.S).toBe(80);
    expect(first.cueB + first.S).toBe(32);
    // B's own next exit then counts from that first drop
    expect(first.deB).toBe(32);
  });

  it('flags a swap that A has no next drop for', () => {
    // the swap into bar 80 is behind the playhead; the second drop section has no next drop
    const p = planTransition(SHORT_BREAK, B, { ...opts, fromBar: 70, recipe: { exit: 'next-drop' } })!;
    expect(p.kind).toBe('chain');
    expect(p.unmet).toMatch(/next drop/);
  });

  it('honours a forced swap over a long breakdown, with a rule-3 heads-up', () => {
    const p = planTransition(LONG_BREAK, B, { ...opts, recipe: { exit: 'next-drop' } })!;
    expect(p.kind).toBe('swap');
    expect(p.unmet).toMatch(/breakdown/);
  });
});

describe('band gains', () => {
  const swap = planTransition(SHORT_BREAK, B, opts)!;

  it("kills A's bass 4 bars before B's drop and hands it over on the drop", () => {
    expect(outgoingGains(swap, swap.S - 5).lo).toBe(1);
    expect(outgoingGains(swap, swap.S - 3).lo).toBe(0);
    expect(incomingGains(swap, swap.S - 0.5).lo).toBe(0);
    expect(incomingGains(swap, swap.S).lo).toBe(1);
  });

  it("brings B's top in under A and lets A ride out to its end", () => {
    expect(incomingGains(swap, 0).hi).toBeCloseTo(0.5);
    expect(incomingGains(swap, swap.S + 2)).toEqual({ lo: 1, mid: 1, hi: 1 });
    expect(outgoingGains(swap, swap.N + 1)).toEqual({ lo: 0, mid: 0, hi: 0 });
  });

  it('cuts the bass for just 1 or 2 bars when asked', () => {
    for (const kill of [1, 2]) {
      const p = planTransition(SHORT_BREAK, B, { ...opts, recipe: { kill } })!;
      expect(p.kill).toBe(kill);
      expect(outgoingGains(p, p.S - kill - 0.5).lo).toBe(1);
      expect(outgoingGains(p, p.S - kill + 0.5).lo).toBe(0);
      expect(incomingGains(p, p.S - 0.5).lo).toBe(0);
      expect(incomingGains(p, p.S).lo).toBe(1);
    }
  });

  it('stops the bass for half a bar (drop stop) and can cut the whole low end', () => {
    const stop = planTransition(SHORT_BREAK, B, { ...opts, recipe: { kill: 0.5, depth: 'full' } })!;
    expect(stop.kill).toBe(0.5);
    expect(outgoingGains(stop, stop.S - 0.75).lo).toBe(1);
    expect(outgoingGains(stop, stop.S - 0.25).lo).toBe(0);
    expect(lowCutOf(stop)).toEqual({ from: stop.S - 0.5, to: stop.S, f0: FULL_CUT_HZ, f1: FULL_CUT_HZ });
    // the default depth is the lows band only, and a sweep has no cut to deepen
    expect(lowCutOf(planTransition(SHORT_BREAK, B, { ...opts, recipe: { kill: 2 } })!)).toBeNull();
    expect(lowCutOf({ ...stop, bass: 'sweep' })).toBeNull();
    expect(describeRecipe({ kill: 0.5, depth: 'full' })).toBe('drop stop (½ bar) · full low cut');
  });

  it('rises: a high-pass on both decks climbs through the cut into the drop', () => {
    const rise = planTransition(SHORT_BREAK, B, { ...opts, recipe: { kill: 4, depth: 'rise' } })!;
    expect(lowCutOf(rise)).toEqual({ from: rise.S - 4, to: rise.S, f0: RISE_HZ[0], f1: RISE_HZ[1] });
    // the bass band still goes with the cut
    expect(outgoingGains(rise, rise.S - 2).lo).toBe(0);
    expect(describeRecipe({ kill: 4, depth: 'rise' })).toBe('4-bar cut · rising filter');
  });

  it("holds B's build back without a verified lock (rule 1)", () => {
    const held = { ...swap, hold: 4 };
    expect(incomingGains(held, swap.S - 6).mid).toBe(0);
    expect(incomingGains(held, swap.S - 2).mid).toBeGreaterThan(0);
  });
});

describe('rankCandidates', () => {
  const song = (id: string, artist = id) => ({ id, title: id, artist, duration: 200 });
  it('puts the closest tempo first, whatever the rest of the score', () => {
    const at = (bpm: number) => ({ ...B, bpm, barLen: 240 / bpm, gridConf: bpm === 131 ? 0.9 : 0.3 });
    const ranked = rankCandidates(
      { song: song('now'), analysis: at(128) },
      [
        { song: song('far'), analysis: at(131) },
        { song: song('near'), analysis: at(128.2) },
        { song: song('out'), analysis: at(150) },
      ],
      { setBpm: 128, played: new Set(), mode: 'dropchain' },
    );
    expect(ranked.map((c) => c.song.id)).toEqual(['near', 'far']);
    expect(ranked[1].bpmDelta).toBeCloseTo(3);
  });

  it('keeps to the tempo window (#378): nothing faster than +up % or slower than −down %', () => {
    const at = (bpm: number) => ({ ...B, bpm, barLen: 240 / bpm });
    const pool = [125, 127, 128.5, 130, 132].map((bpm) => ({ song: song(String(bpm)), analysis: at(bpm) }));
    const ids = rankCandidates({ song: song('now'), analysis: at(128) }, pool, {
      setBpm: 128,
      played: new Set(),
      mode: 'dropchain',
      window: { down: 1, up: 2 },
    }).map((c) => c.song.id);
    expect(ids.sort()).toEqual(['127', '128.5', '130']);
  });
});

describe('tempo jump', () => {
  // B at 100 BPM: 22 % under a 128 set, too far to stretch
  const slow = track([[16, -20], [16, -30], [32, -8], [16, -30], [32, -8], [16, -20]], { bpm: 100, barLen: 2.4 });

  it("hands over in A's next breakdown, B's drop after A is gone", () => {
    const p = planJump(SHORT_BREAK, slow, opts)!;
    expect(p.kind).toBe('jump');
    expect(p.entryA).toBe(64);
    expect(p.N).toBe(8);
    expect(p.S).toBe(8);
    expect(p.cueB).toBe(slow.de - 8);
    // 8 of A's bars at 128 = 6.25 of B's at 100
    expect(p.jump).toEqual({ fromBpm: 128, toBpm: 100, fadeB: 6.25 });
    expect(p.how).toContain('128 → 100 BPM');
  });

  it("drops A's low end at once, crossfades the tops, and holds B's bass for its drop", () => {
    const p = planJump(SHORT_BREAK, slow, opts)!;
    expect(outgoingGains(p, -0.5).lo).toBe(1);
    expect(outgoingGains(p, 0.5).lo).toBe(0);
    expect(outgoingGains(p, 4).mid).toBeCloseTo(Math.SQRT1_2);
    expect(outgoingGains(p, 8).hi).toBe(0);
    expect(incomingGains(p, p.jump!.fadeB).hi).toBe(1);
    expect(incomingGains(p, p.S - 0.1).lo).toBe(0);
    expect(incomingGains(p, p.S).lo).toBe(1);
    // no cut filter on a jump
    expect(lowCutOf({ ...p, depth: 'full' })).toBeNull();
  });

  it("plays B at its own tempo from A's bar line", () => {
    const p = planJump(SHORT_BREAK, slow, opts)!;
    const placed = placeTransition(SHORT_BREAK, slow, p, 10, 1, null);
    expect(placed.bRate).toBe(1);
    expect(placed.barSec).toBe(1.875);
    expect(placed.barSecB).toBe(2.4);
    expect(placed.bWhen).toBe(10);
    // A gone after 8 of its bars (15 s); B's drop plus a bar after 9 of B's (21.6 s)
    expect(placed.tEnd).toBeCloseTo(31.6);
  });

  it("uses A's beatless outro to play out, or its last beat bars", () => {
    const outro = { ...SHORT_BREAK, last: 111 };
    const p = planJump(outro, slow, { ...opts, recipe: { exit: 'end' } })!;
    expect(p.entryA).toBe(112);
    expect(p.how).toContain('beatless outro');
    const q = planJump(SHORT_BREAK, slow, { ...opts, recipe: { exit: 'end' } })!;
    expect(q.entryA).toBe(124);
    expect(q.N).toBe(4);
    // past those too: from the next bar, so auto-lock's fallback still has a way out
    const r = planJump(SHORT_BREAK, slow, { ...opts, fromBar: 126, recipe: { exit: 'end' } })!;
    expect(r.entryA).toBe(126);
    expect(r.N).toBe(2);
    expect(planJump(SHORT_BREAK, slow, { ...opts, fromBar: 128 })).toBeNull();
  });

  it('lists songs out of stretch range, closest tempo first, at their own tempo', () => {
    const song = (id: string) => ({ id, title: id, artist: id, duration: 200 });
    const at = (bpm: number) => ({ ...B, bpm, barLen: 240 / bpm });
    const ids = rankJumps({ song: song('now'), analysis: at(128) }, [128.2, 150, 100, 64].map((bpm) => ({ song: song(String(bpm)), analysis: at(bpm) })), {
      setBpm: 128,
      played: new Set(),
      mode: 'dropchain',
    }).map((c) => c.song.id);
    // 64 fits at double time: a normal match, not a jump
    expect(ids).toEqual(['150', '100']);
  });
});
