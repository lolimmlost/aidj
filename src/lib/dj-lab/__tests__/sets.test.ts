import { afterEach, describe, expect, it, vi } from 'vitest';
import { cuesOf, replayRecipe, type SavedTrack } from '../sets';
import { findSongs, type LabSong } from '../crate';
import type { TransitionPlan } from '../plan';

const track = (patch: Partial<SavedTrack> = {}): SavedTrack => ({ id: 'a', title: 'T', artist: 'A', at: 0, ...patch });
const song = (id: string, artist: string, title: string): LabSong => ({ id, artist, title, duration: 200 });

describe('replayRecipe', () => {
  it('replays the recipe a track came in with', () => {
    expect(replayRecipe(track({ recipe: { exit: 'end', entry: 'first-drop', kill: 2 } }))).toEqual({ exit: 'end', entry: 'first-drop', kill: 2 });
  });

  it('falls back to the transition kind and length for sets saved before recipes', () => {
    expect(replayRecipe(track({ kind: 'chain', bars: 16 }))).toEqual({ kind: 'chain', bars: 16 });
    expect(replayRecipe(track({ kind: 'swap', bars: 8 }))).toEqual({ kind: 'swap', bars: 8 });
    expect(replayRecipe(track({ kind: 'playout', bars: 32 }))).toBeUndefined();
    expect(replayRecipe(track())).toBeUndefined();
  });
});

describe('cuesOf', () => {
  it('keeps where the transition sat on both bar grids', () => {
    const plan = { mode: 'dropchain', kind: 'swap', N: 8, S: 8, entryA: 96, cueB: 24, bass: 'swap', kill: 2, hold: 0, endA: 104, deB: 32, lift: null, breakdown: null, how: 'x' } as TransitionPlan;
    expect(cuesOf(plan)).toEqual({ kind: 'swap', entryA: 96, cueB: 24, N: 8, S: 8, kill: 2, bass: 'swap', endA: 104, deB: 32 });
  });
});

describe('findSongs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('finds a retagged song (new id) by artist and title in the crate, without the network', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const crate = [song('new1', 'it’s murph', 'High and I Like it'), song('b', 'Wuki', 'Moon')];
    const found = await findSongs(
      [
        { id: 'b', artist: 'Wuki', title: 'Moon' },
        { id: 'old1', artist: "It's Murph, Evalyn", title: 'High And I Like It' },
      ],
      crate,
    );
    expect(found.map((s) => s?.id)).toEqual(['b', 'new1']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('searches the library for a song outside the crate, and gives null when nothing matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url.includes('search3')
          ? { searchResult3: { song: url.includes('Afters') ? [{ id: 'n2', title: 'Afters', artist: 'BL3SS, Gravagerz', duration: 180 }] : [] } }
          : { error: { code: 70 } };
        return { ok: true, json: async () => ({ 'subsonic-response': body }) } as Response;
      }),
    );
    const found = await findSongs(
      [
        { id: 'gone', artist: 'BL3SS', title: 'Afters' },
        { id: 'gone2', artist: 'Nobody', title: 'Nothing' },
      ],
      [],
    );
    expect(found[0]?.id).toBe('n2');
    expect(found[1]).toBeNull();
  });
});
