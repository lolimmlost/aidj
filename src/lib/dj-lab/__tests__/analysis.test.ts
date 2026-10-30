import { describe, expect, it } from 'vitest';
import { analyseTrack, barTime } from '../analysis';
import { measureLock } from '../lock';

const SR = 11025;

/** Deterministic noise so the tests don't flake */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

interface Section {
  bars: number;
  kick: boolean;
  bass: boolean;
  hats: boolean;
}

/**
 * A synthetic club track: `pickup` beats of hats before bar 1, then sections of kick / bass / hats.
 * Returns the signal and the time of the first bar line.
 */
function synth(bpm: number, sections: Section[], pickup = 0, sr = SR, seed = 1) {
  const P = 60 / bpm;
  const beats = pickup + sections.reduce((n, s) => n + s.bars * 4, 0);
  const lead = 0.25;
  const x = new Float32Array(Math.ceil((lead + beats * P + 1) * sr));
  const noise = rng(seed);
  let beat = 0;
  const kickAt = (t: number, gain: number) => {
    const a = Math.round(t * sr);
    for (let i = 0; i < 0.18 * sr && a + i < x.length; i++) {
      const tt = i / sr;
      const f = 50 + 90 * Math.exp(-tt * 40);
      x[a + i] += gain * Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 18);
    }
  };
  const hatAt = (t: number) => {
    const a = Math.round(t * sr);
    let prev = 0;
    for (let i = 0; i < 0.03 * sr && a + i < x.length; i++) {
      const v = noise();
      x[a + i] += 0.12 * (v - prev) * Math.exp(-(i / sr) * 120);
      prev = v;
    }
  };
  const bassAt = (t: number) => {
    const a = Math.round(t * sr);
    for (let i = 0; i < P * sr * 0.9 && a + i < x.length; i++) {
      const tt = i / sr;
      x[a + i] += 0.35 * Math.sin(2 * Math.PI * 55 * tt) * Math.min(1, tt * 50);
    }
  };
  for (let i = 0; i < pickup; i++) hatAt(lead + (beat++ + 0.5) * P);
  const bar0 = lead + pickup * P;
  for (const s of sections) {
    for (let i = 0; i < s.bars * 4; i++) {
      const t = lead + beat * P;
      if (s.kick) kickAt(t, 0.8);
      if (s.hats) hatAt(t + P / 2);
      if (s.bass) bassAt(t + P / 2);
      beat++;
    }
  }
  return { x, bar0 };
}

const HOUSE: Section[] = [
  { bars: 16, kick: true, bass: false, hats: true }, // intro
  { bars: 8, kick: false, bass: false, hats: true }, // breakdown
  { bars: 32, kick: true, bass: true, hats: true }, // drop 1 at bar 24
  { bars: 16, kick: false, bass: false, hats: true }, // breakdown
  { bars: 32, kick: true, bass: true, hats: true }, // drop 2 at bar 72
  { bars: 16, kick: true, bass: false, hats: true }, // outro
];

describe('analyseTrack', () => {
  it('finds the tempo, the bar lines and both drops of a house track', () => {
    const { x, bar0 } = synth(126, HOUSE);
    const a = analyseTrack(x, SR);
    expect(a.bpm).toBeCloseTo(126, 1);
    // a bar line sits on the real downbeat (within 10 ms)
    const k = Math.round((bar0 - a.bar0) / a.barLen);
    expect(Math.abs(barTime(a, 0) + k * a.barLen - bar0)).toBeLessThan(0.01);
    expect(a.drop).toBe(24 - k);
    expect(a.drops).toContain(72 - k);
    expect(a.downbeat).toBe('drop');
  });

  it('puts the bar line on the drop when the track opens with a half-bar pickup (g2d bar fix)', () => {
    const { x, bar0 } = synth(128, HOUSE, 2);
    const a = analyseTrack(x, SR);
    expect(a.bpm).toBeCloseTo(128, 1);
    const k = Math.round((bar0 - a.bar0) / a.barLen);
    // within 10 ms of the drop's bar grid, not 2 beats off
    expect(Math.abs(a.bar0 + k * a.barLen - bar0)).toBeLessThan(0.01);
  });

  it('reads a 174 BPM track at 174 under a DnB set tempo, not half time', () => {
    const { x } = synth(174, HOUSE);
    expect(analyseTrack(x, SR, { bpmHint: 172 }).bpm).toBeCloseTo(174, 1);
  });

  it('keeps a 3:2 read out under a house set tempo (the 127-read-as-86 trap)', () => {
    const { x } = synth(127, HOUSE);
    expect(analyseTrack(x, SR, { bpmHint: 126 }).bpm).toBeCloseTo(127, 1);
  });
});

describe('measureLock', () => {
  it('measures how far B sits behind A and verifies a tight lock', () => {
    const a = synth(126, [{ bars: 24, kick: true, bass: false, hats: true }], 0, SR, 1);
    const b = synth(126, [{ bars: 24, kick: true, bass: false, hats: true }], 0, SR, 2);
    const P = 60 / 126;
    // A from its bar 8, B from its bar 0 but 7 ms late
    const r = measureLock({
      a: a.x, aSr: SR, aStart: a.bar0 + 32 * P,
      b: b.x, bSr: SR, bStart: b.bar0 - 0.007,
      rateA: 1, rateB: 1, overlap: 8 * 4 * P,
    });
    expect(r.shift).toBeCloseTo(0.007, 3);
    expect(r.verified).toBe(true);
  });

  it('locks a stretched B: 124 BPM played at 126', () => {
    const a = synth(126, [{ bars: 24, kick: true, bass: false, hats: true }], 0, SR, 3);
    const b = synth(124, [{ bars: 24, kick: true, bass: false, hats: true }], 0, SR, 4);
    const r = measureLock({
      a: a.x, aSr: SR, aStart: a.bar0 + 32 * (60 / 126),
      b: b.x, bSr: SR, bStart: b.bar0,
      rateA: 1, rateB: 126 / 124, overlap: 8 * 4 * (60 / 126),
    });
    expect(Math.abs(r.shift)).toBeLessThan(0.002);
    expect(r.verified).toBe(true);
  });

  it('refuses to verify when B has no beat to lock to', () => {
    const a = synth(126, [{ bars: 24, kick: true, bass: false, hats: true }], 0, SR, 5);
    const silent = new Float32Array(a.x.length);
    const r = measureLock({
      a: a.x, aSr: SR, aStart: a.bar0,
      b: silent, bSr: SR, bStart: 0,
      rateA: 1, rateB: 1, overlap: 8 * 4 * (60 / 126),
    });
    expect(r.verified).toBe(false);
  });
});
