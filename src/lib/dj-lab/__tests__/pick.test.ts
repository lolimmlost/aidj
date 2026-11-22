import { beforeEach, describe, expect, it } from 'vitest';
import { fitOctave } from '../analysis';
import { JUMP_SETTLE, rankCandidates, type LabSong } from '../crate';
import { autoPick, autoPicker, likedRun, previewQueue, splitByThumbs, type PickerState } from '../pick';
import { LabEngine, type HistoryEntry } from '../engine';
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
    expect(autoPick(cur, pool, opts, [])).toMatchObject({ song: near, why: 'tempo window' });
    expect(autoPick(cur, pool, opts, [flag(NOW, liked, 'up')])).toMatchObject({ song: liked, why: 'liked transition' });
    // played already this set: the window decides again
    expect(autoPick(cur, pool, { ...opts, played: new Set(['liked']) }, [flag(NOW, liked, 'up')])?.song).toBe(near);
    // 150 is beyond any stretch: liking it doesn't force a tempo jump
    const far = song('far');
    expect(autoPick(cur, [entry(near, 126), entry(far, 150)], opts, [flag(NOW, far, 'up')])?.song).toBe(near);
  });

  it('never auto-locks a 👎 pair, even when it is the best match', () => {
    const best = song('best');
    const other = song('other');
    // the −0 … +1 % window aims at +0.5 %
    const pool = [entry(best, 126.6), entry(other, 126)];
    expect(autoPick(cur, pool, opts, [])?.song).toBe(best);
    expect(autoPick(cur, pool, opts, [flag(NOW, best, 'down')])?.song).toBe(other);
    expect(autoPick(cur, [entry(best, 126)], opts, [flag(NOW, best, 'down')])).toBeNull();
  });

  it('falls back to a stretch, then a tempo jump, when the window is dry', () => {
    const stretch = song('stretch');
    expect(autoPick(cur, [entry(stretch, 132)], opts, [])).toMatchObject({ song: stretch, why: 'stretch' });
    const jump = song('jump');
    expect(autoPick(cur, [entry(jump, 150)], opts, [])).toMatchObject({ song: jump, why: 'tempo jump' });
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

describe('auto-lock tempo (#383, #390)', () => {
  beforeEach(() => localStorage.clear());

  /**
   * Auto-lock playing a crate out, the way the engine drives its picker: a song comes in (a tempo jump moves the
   * set tempo with it), and the next one is picked right then. `stale` gives the picker the set from before that
   * song came in, which is what the page's render-time copy was.
   */
  function playOut(tempos: number[], o: { window?: [number, number]; stale?: boolean } = {}) {
    const pool = tempos.map((bpm, i) => entry(song(`${i}: ${bpm}`), bpm));
    const [down, up] = o.window ?? [4, 4];
    let state: PickerState = { setBpm: 126, mode: 'dropchain', defaults: { tempoDown: down, tempoUp: up }, history: [] };
    let before = state;
    const picker = autoPicker(() => (o.stale ? before : state), pool, new Set());
    const played = new Set<string>();
    let now = { song: NOW, analysis: at(126), rate: 1, floorBar: 0 };
    const songs: { bpm: number; setBpm: number; jump?: 'up' | 'down'; log: Record<string, unknown> }[] = [];
    for (;;) {
      const pick = picker(now, played);
      if (!pick) break;
      const own = pool.find((p) => p.song === pick.song)!.analysis;
      const fitted = fitOctave(own, state.setBpm);
      // the engine's own test for a jump (schedule), on the real set tempo
      const jump = Math.abs(state.setBpm / fitted.bpm - 1) > 0.08;
      const setBpm = jump ? own.bpm : state.setBpm;
      const entryOf = { song: pick.song, at: 0, plan: jump ? { jump: { fromBpm: state.setBpm, toBpm: own.bpm } } : {} } as HistoryEntry;
      songs.push({ bpm: own.bpm, setBpm, jump: jump ? (own.bpm > state.setBpm ? 'up' : 'down') : undefined, log: pick.log ?? {} });
      before = state;
      state = { ...state, setBpm, history: [...state.history, entryOf] };
      played.add(pick.song.id);
      now = { song: pick.song, analysis: jump ? own : fitted, rate: 1, floorBar: 0 };
    }
    const jumps = songs.flatMap((s, i) => (s.jump ? [{ dir: s.jump, i }] : []));
    return {
      songs,
      jumps,
      path: jumps.map((j) => songs[j.i].setBpm),
      // a jump the other way on the very next song
      backToBack: jumps.filter((j, k) => k > 0 && j.dir !== jumps[k - 1].dir && j.i === jumps[k - 1].i + 1).length,
      // the direction turning on two jumps in a row: up, down, up
      turnsInARow: jumps.filter((j, k) => k > 1 && j.dir !== jumps[k - 1].dir && jumps[k - 1].dir !== jumps[k - 2].dir).length,
    };
  }

  it('with −0 … +8 %, spreads its picks across the window instead of taking the slowest each time', () => {
    const tempos = [0.2, 1.2, 2.2, 3.2, 4.2, 5.2, 6.2, 7.2].map((p) => 126 * (1 + p / 100));
    const { songs } = playOut(tempos, { window: [0, 8] });
    expect(songs.map((s) => s.log.faster)).toEqual([4.2, 3.2, 5.2, 2.2, 6.2, 1.2, 7.2, 0.2]);
    expect(songs.every((s) => s.log.pick === 'tempo window' && s.log.aim === 4)).toBe(true);
    // the set tempo doesn't follow the picks (that needs the engine to ramp the rate: not this change)
    expect(songs.every((s) => s.setBpm === 126)).toBe(true);
  });

  it('logs where each pick stood: own tempo, the set tempo it was ranked against, its rank', () => {
    const a = song('a');
    const window = { down: 0, up: 8 };
    expect(autoPick(cur, [entry(a, 131.04), entry(song('b'), 127)], { ...opts, window }, [])?.log).toEqual({
      why: 'tempo window',
      ownBpm: 131,
      setBpm: 126,
      faster: 4,
      rank: 1,
      of: 2,
      window: '−0 … +8 %',
      aim: 4,
    });
    // the top pick is a 👎 pair: the one taken is second in its list
    expect(autoPick(cur, [entry(a, 131.04), entry(song('b'), 127)], { ...opts, window }, [flag(NOW, a, 'down')])?.log).toMatchObject({ rank: 2, of: 2, ownBpm: 127 });
    // a 252 BPM track mixes into a 126 set at half time: its own tempo is logged as analysed
    expect(autoPick(cur, [entry(a, 252)], opts, [])?.log).toMatchObject({ why: 'tempo window', ownBpm: 252, faster: 0 });
    expect(autoPick(cur, [entry(a, 150)], { ...opts, last: { dir: 'down', since: 1 } }, [])?.log).toEqual({
      why: 'tempo jump',
      ownBpm: 150,
      setBpm: 126,
      faster: 19,
      rank: 1,
      of: 1,
      jumpDir: 'up',
      lastJump: 'down',
      sinceJump: 1,
    });
  });

  it('after a jump, stays at the new tempo while there is anything to play there', () => {
    // from 126, 140 is the closest jump; 144 and 147 are within a stretch of 140, 110 and 170 are not
    const { songs, path } = playOut([140, 144, 147, 110, 170]);
    expect(songs.map((s) => [s.bpm, s.log.pick])).toEqual([
      [140, 'tempo jump'],
      [144, 'tempo window'],
      [147, 'stretch'],
      [170, 'tempo jump'],
      [110, 'tempo jump'],
    ]);
    expect(path).toEqual([140, 170, 110]);
  });

  it('keeps a jump going the way the last one went, until songs have played at the new tempo', () => {
    // from 137.5, 114 (−17 %) is closer than 162 (+18 %): closest-first went straight back down
    const kept = playOut([137.5, 114, 162, 172, 174]);
    expect(kept.songs.map((s) => s.bpm)).toEqual([137.5, 162, 172, 174, 114]);
    expect(kept.path).toEqual([137.5, 162, 114]);
    expect(kept.backToBack).toBe(0);
    // the jump back down, once nothing faster is left, says so
    expect(kept.songs.at(-1)!.log).toMatchObject({ pick: 'tempo jump', jumpDir: 'down', lastJump: 'up', sinceJump: 2, rank: 1, of: 1 });

    // JUMP_SETTLE more songs at 139 after the jump up: either direction again, so the closer 112 (−19 %, to +24 %)
    const fillers = (n: number) => Array.from({ length: n }, () => 139);
    expect(playOut([139, ...fillers(JUMP_SETTLE), 112, 172]).path).toEqual([139, 112, 172]);
    expect(playOut([139, ...fillers(JUMP_SETTLE - 1), 112, 172]).path).toEqual([139, 172, 112]);
  });

  // what auto-lock had left for the last 27 songs on 2026-11-01 (saved set mvyfdp93, as analysed), after 67
  // songs around 126 BPM: a few slow strays, a 137–142 group, a 174–190 group
  const LATE_2026_11_01 = [115, 137.4, 110, 138, 110, 138, 93.9, 138, 188, 140, 190, 140, 185, 140, 180, 140, 180, 140, 175, 140, 175, 140, 175, 141, 174, 142, 174];

  it('never turns the tempo around on two jumps in a row with the crate of the 2026-11-01 set', () => {
    for (const window of [[4, 4], [0, 8]] as [number, number][]) {
      const run = playOut(LATE_2026_11_01, { window });
      expect(run.songs).toHaveLength(LATE_2026_11_01.length);
      // down through the strays (the 174–190 group rides the low 90s at half time), then up to stay
      expect(run.path).toEqual([115, 93.9, 137.4]);
      expect(run.backToBack).toBe(0);
      expect(run.turnsInARow).toBe(0);
    }
  });

  it('reads the set tempo at each pick: ranked against the one before a jump, the same crate swings on every song', () => {
    // what the night did: the page handed the picker its last render's set tempo, and the engine picks before
    // the page renders the jump
    const stale = playOut(LATE_2026_11_01, { stale: true });
    expect(stale.jumps.length).toBeGreaterThan(20);
    expect(stale.turnsInARow).toBeGreaterThan(15);
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

describe('queue (#373)', () => {
  it('previews each queued transition against the song before it, and moves the set tempo on a jump', () => {
    const b = song('b');
    const c = song('c');
    const d = song('d');
    const analyses = new Map([
      ['b', at(127)],
      ['c', at(150)],
    ]);
    const p = previewQueue(cur, [b, c, d], analyses, { setBpm: 126, mode: 'dropchain' });
    expect(p[0].line).toMatch(/^(chain|swap|playout|cut|intro), \d+ bars$/);
    expect(p[0].bpm).toBe(126);
    // 150 is beyond the stretch from 126: a tempo jump, and the set runs at 150 after it
    expect(p[1].line).toMatch(/^tempo jump 126 → 150/);
    expect(p[1].bpm).toBe(150);
    expect(p[2].line).toBe('not analysed yet');
  });

  it('follows your liked transitions into a run, without repeating or playing what has played', () => {
    const b = song('b');
    const c = song('c');
    const d = song('d');
    const pool = [entry(b, 126), entry(c, 126), entry(d, 126)];
    const votes = [flag(NOW, b, 'up'), flag(b, c, 'up'), flag(c, NOW, 'up'), flag(c, d, 'up')];
    const o = { setBpm: 126, played: new Set<string>(), mode: 'dropchain' as const };
    expect(likedRun(cur, pool, o, votes).map((s) => s.id)).toEqual(['b', 'c', 'd']);
    // d played already: the run stops at c
    expect(likedRun(cur, pool, { ...o, played: new Set(['d']) }, votes).map((s) => s.id)).toEqual(['b', 'c']);
    expect(likedRun(cur, pool, o, votes, 1).map((s) => s.id)).toEqual(['b']);
    expect(likedRun(cur, pool, o, [])).toEqual([]);
  });

  it('keeps a queue in order: add once, move, remove, play next', () => {
    const e = new LabEngine();
    const [b, c, d] = [song('b'), song('c'), song('d')];
    e.enqueue([b, c, b]);
    e.enqueue([d, c]);
    expect(e.getSnapshot().queue.map((s) => s.id)).toEqual(['b', 'c', 'd']);
    e.moveQueued('d', -1);
    expect(e.getSnapshot().queue.map((s) => s.id)).toEqual(['b', 'd', 'c']);
    e.moveQueued('b', -1);
    expect(e.getSnapshot().queue.map((s) => s.id)).toEqual(['b', 'd', 'c']);
    e.dequeue('d');
    expect(e.getSnapshot().queue.map((s) => s.id)).toEqual(['b', 'c']);
    // nothing playing: play next just moves it to the front
    e.playNext('c');
    expect(e.getSnapshot().queue.map((s) => s.id)).toEqual(['c', 'b']);
  });
});
