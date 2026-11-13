import { describe, expect, it } from 'vitest';
import { genreFamily, JUMP_SETTLE, JUMP_TURNS_BACK, lastJump, OTHER_GENRE, rankCandidates, rankJumps, windowTarget, type LabSong } from '../crate';
import { track } from './fixtures';

const song = (genre?: string, genres?: string[]): LabSong => ({ id: 'x', title: 't', artist: 'a', duration: 300, genre, genres });

describe('genreFamily', () => {
  it('maps fine-grained tags to a family', () => {
    expect(genreFamily(song(undefined, ['Tech House', 'Electronic']))).toBe('House & techno');
    expect(genreFamily(song(undefined, ['Dance', 'House', 'Edm']))).toBe('House & techno');
    expect(genreFamily(song(undefined, ['Trap', 'Cloud Rap']))).toBe('Hip hop');
    expect(genreFamily(song(undefined, ['Drum And Bass']))).toBe('Bass & EDM');
    expect(genreFamily(song(undefined, ['Boogie', 'Contemporary R&B', 'Electro-Funk']))).toBe('Soul, funk & R&B');
    expect(genreFamily(song('Electronic'))).toBe('Electronic');
  });

  it('reads Last.fm and Beatport spellings', () => {
    expect(genreFamily(song(undefined, ['india', 'hip-hop']))).toBe('Hip hop');
    expect(genreFamily(song('phonk'))).toBe('Hip hop');
    expect(genreFamily(song('Mainstage'))).toBe('Bass & EDM');
    expect(genreFamily(song('Hard Dance / Hardcore / Neo Rave'))).toBe('Bass & EDM');
    expect(genreFamily(song('Indie Dance'))).toBe('House & techno');
    expect(genreFamily(song('Trap / Future Bass'))).toBe('Bass & EDM');
    expect(genreFamily(song('Hardcore Punk'))).toBe('Rock & indie');
    expect(genreFamily(song('Darkwave'))).toBe('Rock & indie');
    expect(genreFamily(song('Synthwave'))).toBe('Electronic');
  });

  it('skips tags that are not genres, then falls back to Other', () => {
    expect(genreFamily(song(undefined, ['Music', 'Indie Rock']))).toBe('Rock & indie');
    expect(genreFamily(song('People & Blogs'))).toBe(OTHER_GENRE);
    expect(genreFamily(song())).toBe(OTHER_GENRE);
  });
});

const BASE = track([[16, -20], [16, -30], [32, -8], [16, -30], [32, -8], [16, -20]]);
const at = (bpm: number) => ({ ...BASE, bpm, barLen: 240 / bpm });
const lab = (id: string, artist = id): LabSong => ({ id, title: id, artist, duration: 200 });
const entry = (id: string, bpm: number, artist = id) => ({ song: lab(id, artist), analysis: at(bpm) });
const cur = entry('now', 126);
const o = { setBpm: 126, played: new Set<string>(), mode: 'dropchain' as const };
const ids = (cs: { song: LabSong }[]) => cs.map((c) => c.song.id);
// a tempo this many % faster than the 126 set tempo
const pct = (p: number) => 126 * (1 + p / 100);

describe('rankCandidates: the tempo window aims at its middle (#383)', () => {
  it('−0 … +8 % aims at +4 %, ±4 % at the set tempo', () => {
    expect(windowTarget({ down: 0, up: 8 })).toBe(4);
    expect(windowTarget({ down: 4, up: 4 })).toBe(0);
    expect(windowTarget({ down: 8, up: 0 })).toBe(-4);
    expect(windowTarget()).toBe(0);
  });

  it('ranks by distance to the middle of the window, not to the set tempo', () => {
    const pool = [entry('set tempo', 126), entry('+4 %', pct(4)), entry('+7.5 %', pct(7.5))];
    // the set tempo is the slowest track −0 … +8 % allows: it used to win every pick
    expect(ids(rankCandidates(cur, pool, { ...o, window: { down: 0, up: 8 } }))).toEqual(['+4 %', '+7.5 %', 'set tempo']);
    const around = [entry('−3.5 %', pct(-3.5)), entry('set tempo', 126), entry('+3.5 %', pct(3.5))];
    expect(ids(rankCandidates(cur, around, { ...o, window: { down: 4, up: 4 } }))[0]).toBe('set tempo');
    // no window (liked transitions, the stretch fallback): the set tempo
    expect(ids(rankCandidates(cur, pool, o))).toEqual(['set tempo', '+4 %', '+7.5 %']);
  });

  it('still keeps to the window', () => {
    const pool = [entry('−1 %', pct(-1)), entry('+2 %', pct(2)), entry('+8.5 %', pct(8.5))];
    expect(ids(rankCandidates(cur, pool, { ...o, window: { down: 0, up: 8 } }))).toEqual(['+2 %']);
  });

  it('ranks tempo in 2 % steps: inside one, the rest of the score decides', () => {
    // same artist as the playing song, dead on the set tempo, against a new artist 0.8 % off: half-percent steps
    // put the exact match first every time
    const pool = [entry('same artist', 126, 'now'), entry('new artist', pct(0.8))];
    expect(ids(rankCandidates(cur, pool, o))).toEqual(['new artist', 'same artist']);
    // a step further out, tempo decides again
    expect(ids(rankCandidates(cur, [entry('same artist', 126, 'now'), entry('new artist', pct(3.5))], o))).toEqual(['same artist', 'new artist']);
  });

  it('gives a liked song its 1 % head start around the middle of the window too (#385)', () => {
    const w = { down: 0, up: 8 };
    const pool = [entry('+3.2 %', pct(3.2)), entry('+5.6 %', pct(5.6))];
    expect(ids(rankCandidates(cur, pool, { ...o, window: w }))).toEqual(['+3.2 %', '+5.6 %']);
    // 1.6 % from the middle counts as 0.6 %: closer than the unliked one at 0.8 %
    expect(ids(rankCandidates(cur, pool, { ...o, window: w, liked: new Set(['+5.6 %']) }))).toEqual(['+5.6 %', '+3.2 %']);
    // 3.5 % from the middle counts as 2.5 %: still behind one that is on it
    const far = [entry('+4 %', pct(4)), entry('+7.5 %', pct(7.5))];
    expect(ids(rankCandidates(cur, far, { ...o, window: w, liked: new Set(['+7.5 %']) }))).toEqual(['+4 %', '+7.5 %']);
  });
});

describe('rankJumps: a tempo jump keeps its direction (#390)', () => {
  const pool = [entry('100', 100), entry('115', 115), entry('140', 140), entry('150', 150)];

  it('ranks the closest tempo first when the set has not jumped', () => {
    const ranked = rankJumps(cur, pool, o);
    expect(ids(ranked)).toEqual(['115', '140', '150', '100']);
    expect(ranked.flatMap((c) => c.warnings)).toEqual([]);
    // songs within a stretch are not jumps
    expect(rankJumps(cur, [entry('130', 130)], o)).toEqual([]);
  });

  it('after a jump up, ranks jumps that keep going up ahead of jumps back down, and the reverse', () => {
    const up = rankJumps(cur, pool, { ...o, last: { dir: 'up', since: 0 } });
    expect(ids(up)).toEqual(['140', '150', '115', '100']);
    expect(up.map((c) => c.warnings.includes(JUMP_TURNS_BACK))).toEqual([false, false, true, true]);
    const down = rankJumps(cur, pool, { ...o, last: { dir: 'down', since: JUMP_SETTLE - 1 } });
    expect(ids(down)).toEqual(['115', '100', '140', '150']);
  });

  it('lets a new direction in once enough songs have played at the new tempo', () => {
    const settled = rankJumps(cur, pool, { ...o, last: { dir: 'up', since: JUMP_SETTLE } });
    expect(ids(settled)).toEqual(['115', '140', '150', '100']);
    expect(settled.flatMap((c) => c.warnings)).toEqual([]);
  });

  it('still offers a jump back when nothing else is left', () => {
    expect(ids(rankJumps(cur, [entry('115', 115)], { ...o, last: { dir: 'up', since: 0 } }))).toEqual(['115']);
  });

  it('reads the last jump, and the songs since, out of a set history', () => {
    const jump = (fromBpm: number, toBpm: number) => ({ plan: { jump: { fromBpm, toBpm } } });
    expect(lastJump([])).toBeUndefined();
    expect(lastJump([{}, { plan: {} }])).toBeUndefined();
    expect(lastJump([{}, jump(126, 140)])).toEqual({ dir: 'up', since: 0 });
    expect(lastJump([{}, jump(126, 140), {}, jump(140, 115), {}, { plan: {} }])).toEqual({ dir: 'down', since: 2 });
  });
});
