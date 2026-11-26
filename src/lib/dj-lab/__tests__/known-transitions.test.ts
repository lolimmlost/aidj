import { describe, expect, it } from 'vitest';
import { aggregateLabSets } from '../known-transitions';

const t = (id: string, title: string, kind?: string, bars?: number, entryA?: number, cueB?: number) => ({
  id, title, artist: `${title} artist`, ...(kind ? { kind, bars, cues: { entryA, cueB } } : {}),
});

describe('aggregateLabSets', () => {
  it('folds consecutive pairs across sets with technique counts and most used cue bars', () => {
    const sets = [
      { id: 's1', updatedAt: '2026-11-01T15:53:00Z', setBpm: 126, tracks: [t('a', 'Heaven'), t('b', 'Moon', 'swap', 16, 111, 12), t('c', '123', 'swap', 8, 64, 20)] },
      { id: 's2', updatedAt: '2026-11-02T16:41:00Z', setBpm: 126, tracks: [t('a', 'Heaven'), t('b', 'Moon', 'swap', 8, 119, 20)] },
      { id: 's3', updatedAt: '2026-11-03T18:17:00Z', setBpm: 123, tracks: [t('a', 'Heaven'), t('b', 'Moon', 'swap', 8, 119, 20)] },
    ];
    const out = aggregateLabSets(sets);
    expect(out.map((p) => `${p.fromTitle}>${p.toTitle}:${p.plays}`)).toEqual(['Heaven>Moon:3', 'Moon>123:1']);
    const hm = out[0];
    expect(hm.techniques).toEqual([
      { kind: 'swap', bars: 8, count: 2, entryA: 119, cueB: 20 },
      { kind: 'swap', bars: 16, count: 1, entryA: 111, cueB: 12 },
    ]);
    // tempo and date come from the most recent set with the pair
    expect(hm.setBpm).toBe(123);
    expect(hm.lastPlayedAt?.toISOString()).toBe('2026-11-03T18:17:00.000Z');
  });

  it('skips malformed tracks, self-pairs and tracks without a transition record', () => {
    const out = aggregateLabSets([
      { tracks: [t('a', 'A'), { title: 'no id' }, t('a', 'A'), t('a', 'A', 'cut', 4, 1, 1)] },
      { tracks: 'nope' },
      { tracks: [t('x', 'X'), t('y', 'Y')] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ fromSongId: 'x', toSongId: 'y', plays: 1, techniques: [] });
  });
});
