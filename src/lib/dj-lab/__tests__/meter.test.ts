import { describe, expect, it } from 'vitest';
import { barTime, fitOctave, remeter, type TrackAnalysis } from '../analysis';
import { rankCandidates, type LabSong } from '../crate';

/** A plain analysis: `nBars` bars at `bpm`, drops where asked, per-bar energy rising by bar. */
function analysis(bpm: number, nBars: number, drops: number[]): TrackAnalysis {
  const barLen = 240 / bpm;
  const per = (o: number) => Array.from({ length: nBars }, (_, i) => -30 + o + (i % 4));
  return {
    version: 2,
    duration: 1 + nBars * barLen,
    bpm,
    bar0: 1,
    barLen,
    nBars,
    gridConf: 0.6,
    gridP90Ms: 8,
    downbeat: 'drop',
    el: per(0),
    ek: per(1),
    eh: per(2),
    ef: per(3),
    kw: per(4),
    first: 0,
    last: nBars - 1,
    intro: 16,
    outro: nBars - 16,
    drop: drops[0] ?? null,
    drops,
    de: drops[0] ?? 0,
  };
}

const song = (id: string): LabSong => ({ id, title: id, artist: id, duration: 300 });

describe('remeter / fitOctave', () => {
  it('keeps a track at its own tempo when that is closest', () => {
    const a = analysis(126, 128, [33]);
    expect(fitOctave(a, 128)).toBe(a);
  });

  it('counts a 172 BPM track at half time for an 86 BPM set, the drop still on a bar line', () => {
    const a = analysis(172, 160, [65, 97]);
    const h = fitOctave(a, 86);
    expect(h.meter).toBe(0.5);
    expect(h.bpm).toBeCloseTo(86);
    expect(h.barLen).toBeCloseTo(a.barLen * 2);
    expect(h.nBars).toBe(79);
    expect(h.el).toHaveLength(79);
    // same moment in the audio
    expect(barTime(h, h.drop!)).toBeCloseTo(barTime(a, a.drop!));
    expect(barTime(h, h.de)).toBeCloseTo(barTime(a, a.de));
    expect(barTime(h, 10)).toBeCloseTo(barTime(a, 1 + 20));
  });

  it('pairs two bars by their mean power', () => {
    const a = analysis(170, 4, [0]);
    a.el = [0, -10, -3, -3];
    const h = remeter(a, 0.5);
    expect(h.el[0]).toBeCloseTo(10 * Math.log10((1 + 0.1) / 2));
    expect(h.el[1]).toBeCloseTo(-3);
  });

  it('counts an 86 BPM track at double time for a 172 BPM set', () => {
    const a = analysis(86, 64, [17]);
    const d = fitOctave(a, 172);
    expect(d.meter).toBe(2);
    expect(d.bpm).toBeCloseTo(172);
    expect(d.nBars).toBe(128);
    expect(d.el).toHaveLength(128);
    expect(barTime(d, d.drop!)).toBeCloseTo(barTime(a, a.drop!));
    expect(d.last).toBe(127);
  });
});

describe('rankCandidates across octaves', () => {
  it('offers a 172 BPM track after an 86 BPM one, marked half time', () => {
    const now = { song: song('now'), analysis: analysis(86, 64, [17]) };
    const pool = [
      { song: song('dnb'), analysis: analysis(172.5, 160, [65]) },
      { song: song('house'), analysis: analysis(126, 128, [33]) },
    ];
    const picks = rankCandidates(now, pool, { setBpm: 86, played: new Set(), mode: 'dropchain', window: { down: 4, up: 4 } });
    expect(picks.map((p) => p.song.id)).toEqual(['dnb']);
    expect(picks[0].analysis.meter).toBe(0.5);
    expect(picks[0].reasons).toContain('half time · 173 BPM');
  });
});
