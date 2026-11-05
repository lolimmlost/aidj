import { beforeEach, describe, expect, it } from 'vitest';
import { rankCandidates, type LabSong } from '../crate';
import { autoPick, splitByThumbs } from '../pick';
import { importVotes, loadVotes, type LabVote } from '../votes';
import { track } from './fixtures';

const BASE = track([[16, -20], [16, -30], [32, -8], [16, -30], [32, -8], [16, -20]]);
const at = (bpm: number) => ({ ...BASE, bpm, barLen: 240 / bpm });
const song = (id: string, artist = id, title = id): LabSong => ({ id, title, artist, duration: 200 });
const entry = (s: LabSong, bpm: number) => ({ song: s, analysis: at(bpm) });

let n = 0;
const flag = (a: LabSong, b: { id: string; artist: string; title: string }, thumb: 'up' | 'down'): LabVote => ({
  id: `v${n++}`,
  at: `2026-11-01T16:${String(n).padStart(2, '0')}:00.000Z`,
  kind: 'flag',
  a: { id: a.id, title: a.title, artist: a.artist },
  b,
  setBpm: 126,
  thumb,
  tags: [],
  note: '',
});

const NOW = song('now', 'WELKER', 'Got The Floor');
const cur = entry(NOW, 126);
const opts = { setBpm: 126, played: new Set<string>(), mode: 'dropchain' as const, window: { down: 0, up: 1 } };

describe('liked transitions (#384)', () => {
  it('puts the songs you liked after the playing one first, most 👍 first, and marks 👎', () => {
    const b = song('b');
    const c = song('c', 'Idris Muhammad', 'Could Heaven Ever Be Like This');
    const d = song('d');
    const e = song('e');
    const ranked = rankCandidates(cur, [b, c, d, e].map((s) => entry(s, 126)), opts);
    const votes = [
      flag(NOW, b, 'up'),
      // a retag gave c a new id: matched by artist + title
      flag(NOW, { id: 'old-c', artist: 'Idris Muhammad', title: 'Could Heaven Ever Be Like This' }, 'up'),
      flag(NOW, c, 'up'),
      flag(NOW, d, 'down'),
      // a 👍 out of another song doesn't count
      flag(song('other'), e, 'up'),
    ];
    const { liked, rest } = splitByThumbs(ranked, NOW, votes);
    expect(liked.map((x) => x.song.id)).toEqual(['c', 'b']);
    expect(liked[0].reasons[0]).toBe('👍 after Got The Floor');
    expect(rest.map((x) => [x.song.id, x.thumb])).toEqual([
      ['d', 'down'],
      ['e', undefined],
    ]);
    expect(rest[0].warnings[0]).toBe('👎 after Got The Floor');
  });

  it('a 👍 and a 👎 on the same pair cancel out', () => {
    const b = song('b');
    const { liked, rest } = splitByThumbs(rankCandidates(cur, [entry(b, 126)], opts), NOW, [flag(NOW, b, 'up'), flag(NOW, b, 'down')]);
    expect(liked).toEqual([]);
    expect(rest[0].thumb).toBeUndefined();
  });

  it('auto-lock takes a liked transition outside the tempo window, but not one it would have to jump to', () => {
    const near = song('near');
    const liked = song('liked');
    const pool = [entry(near, 126), entry(liked, 130)];
    // 130 is +3 %: outside the −0 … +1 % window, inside the ±8 % stretch
    expect(autoPick(cur, pool, opts, [])).toEqual({ song: near, why: 'tempo window' });
    expect(autoPick(cur, pool, opts, [flag(NOW, liked, 'up')])).toEqual({ song: liked, why: 'liked transition' });
    // played already this set: the window decides again
    expect(autoPick(cur, pool, { ...opts, played: new Set(['liked']) }, [flag(NOW, liked, 'up')])?.song).toBe(near);
    // 150 is beyond any stretch: liking it doesn't force a tempo jump
    const far = song('far');
    expect(autoPick(cur, [entry(near, 126), entry(far, 150)], opts, [flag(NOW, far, 'up')])?.song).toBe(near);
  });

  it('never auto-locks a 👎 pair, even when it is the best match', () => {
    const best = song('best');
    const other = song('other');
    const pool = [entry(best, 126), entry(other, 126.5)];
    expect(autoPick(cur, pool, opts, [])?.song).toBe(best);
    expect(autoPick(cur, pool, opts, [flag(NOW, best, 'down')])?.song).toBe(other);
    expect(autoPick(cur, [entry(best, 126)], opts, [flag(NOW, best, 'down')])).toBeNull();
  });

  it('falls back to a stretch, then a tempo jump, when the window is dry', () => {
    const stretch = song('stretch');
    expect(autoPick(cur, [entry(stretch, 132)], opts, [])).toEqual({ song: stretch, why: 'stretch' });
    const jump = song('jump');
    expect(autoPick(cur, [entry(jump, 150)], opts, [])).toEqual({ song: jump, why: 'tempo jump' });
  });
});

describe('liked songs (#385)', () => {
  it('rank 1 % closer in tempo', () => {
    const o = { setBpm: 126, played: new Set<string>(), mode: 'dropchain' as const };
    const ids = (pool: [string, number][], liked: string[]) =>
      rankCandidates(cur, pool.map(([id, bpm]) => entry(song(id), bpm)), { ...o, liked: new Set(liked) }).map((c) => c.song.id);
    // at 126, an unliked 127 used to beat a liked 128 every time
    expect(ids([['127', 127], ['128', 128]], [])).toEqual(['127', '128']);
    expect(ids([['127', 127], ['128', 128]], ['128'])).toEqual(['128', '127']);
    // a liked song 2 % off still loses to an unliked one at the set tempo
    expect(ids([['126', 126], ['128.6', 128.6]], ['128.6'])).toEqual(['126', '128.6']);
    expect(rankCandidates(cur, [entry(song('x'), 126)], { ...o, liked: new Set(['x']) })[0].reasons).toContain('♥ liked');
  });
});

describe('importVotes', () => {
  beforeEach(() => localStorage.clear());

  it('merges an export by id, oldest first, and skips what is not a vote', () => {
    const a = song('a');
    const first = flag(NOW, a, 'up');
    const second = flag(a, NOW, 'up');
    expect(importVotes([second, { junk: true }, first])).toEqual({ all: [first, second], added: 2 });
    // importing the same file again adds nothing
    expect(importVotes([first, second, first]).added).toBe(0);
    expect(loadVotes()).toHaveLength(2);
    expect(() => importVotes({ not: 'a list' })).toThrow('Not a votes export');
  });
});
