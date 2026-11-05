import type { TrackAnalysis } from '../analysis';

/** A hand-built analysis: per-bar low end from [bars, dB] sections, drops where the low end jumps. */
export function track(sections: [number, number][], opts: Partial<TrackAnalysis> = {}): TrackAnalysis {
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
