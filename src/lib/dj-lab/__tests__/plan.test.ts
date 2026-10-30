import { describe, expect, it } from 'vitest';
import type { TrackAnalysis } from '../analysis';
import { incomingGains, outgoingGains, planTransition } from '../plan';
import { rankCandidates } from '../crate';

/** A hand-built analysis: per-bar low end from [bars, dB] sections, drops where the low end jumps. */
function track(sections: [number, number][], opts: Partial<TrackAnalysis> = {}): TrackAnalysis {
  const el = sections.flatMap(([n, db]) => Array<number>(n).fill(db));
  const drops: number[] = [];
  let bar = 0;
  for (let i = 0; i < sections.length; i++) {
    if (i > 0 && sections[i][1] - sections[i - 1][1] >= 6) drops.push(bar);
    bar += sections[i][0];
  }
  return {
    version: 1,
    duration: el.length * 1.875,
    bpm: 128,
    bar0: 0,
    barLen: 1.875,
    nBars: el.length,
    gridConf: 0.6,
    gridP90Ms: 5,
    downbeat: 'drop',
    el,
    ek: el,
    eh: el.map(() => -20),
    ef: el,
    kw: el.map((v) => v + 2),
    first: 0,
    last: el.length - 1,
    intro: 8,
    outro: 8,
    drop: drops[0] ?? null,
    drops,
    de: drops[0] ?? 0,
    ...opts,
  };
}

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
});
