import { describe, expect, it } from 'vitest';
import type { KnownTransition } from '@/lib/db/schema/known-transitions.schema';
import { track } from './fixtures';
import { planTransition } from '../plan';
import { entryFor, exitsFrom, landsTake, savedRecipe, takeLabel, takeOf, takeRecipe } from '../known-takes';
import type { SavedSet } from '../sets';

// intro 16, build 16, drop 32 (bar 32), breakdown 16, drop 32 (bar 80), outro 16
const A = track([[16, -20], [16, -30], [32, -8], [16, -30], [32, -8], [16, -20]]);
const B = track([[16, -20], [16, -30], [32, -8], [16, -30], [32, -8], [16, -20]]);
const opts = { mode: 'dropchain' as const, fromBar: 0, floorBar: 32, setBpm: 128 };

const row = (p: Partial<KnownTransition>): KnownTransition =>
  ({
    id: 'r', userId: 'u', fromSongId: 'a', toSongId: 'b', fromTitle: 'A', fromArtist: '', toTitle: 'B', toArtist: '',
    plays: 1, techniques: [], preferred: null, setBpm: 126, lastPlayedAt: null, role: null, status: 'lab', note: null,
    source: 'lab', createdAt: new Date(), updatedAt: new Date(), ...p,
  }) as KnownTransition;

describe('known takes', () => {
  it('lands a later take on its own cue bars instead of the first exit the rules would take', () => {
    const rules = planTransition(A, B, opts)!;
    expect(rules.entryA).toBe(64); // the rules swap into A's second drop
    // your take: chain out of the second drop's section, 8 bars, B in on its drop
    const take = { kind: 'chain', bars: 8, entryA: 104, cueB: B.de - 8 };
    const p = planTransition(A, B, { ...opts, recipe: takeRecipe(take, B) })!;
    expect(landsTake(p, take)).toBe(true);
    expect(p.entryA).toBe(104);
  });

  it('falls back to the rules when the take cue is out of reach', () => {
    const take = { kind: 'swap', bars: 16, entryA: 500, cueB: 16 };
    const p = planTransition(A, B, { ...opts, recipe: takeRecipe(take, B) })!;
    expect(p).not.toBeNull();
    expect(landsTake(p, take)).toBe(false);
  });

  it("works out B's entry choice from the take's cue", () => {
    const late = { ...B, de: 80 };
    expect(entryFor(late, { kind: 'swap', bars: 8, entryA: 56, cueB: 24 })).toBe('first-drop');
    expect(entryFor(late, { kind: 'swap', bars: 8, entryA: 56, cueB: 72 })).toBeUndefined();
  });

  it('overrides set defaults the take was not mixed with, and maps play-outs', () => {
    const r = takeRecipe({ kind: 'swap', bars: 8, entryA: 64, cueB: 24 }, B);
    expect('exit' in r && r.exit).toBe(undefined);
    expect(r).toMatchObject({ kind: 'swap', bars: 8, outAt: 64, mode: 'dropchain' });
    expect(takeRecipe({ kind: 'playout', bars: 8, entryA: 87, cueB: 20 }, B)).toMatchObject({ exit: 'end', bars: 8 });
  });

  it('uses the saved recipe of the set the take came from', () => {
    const sets = [
      {
        id: 's', startedAt: '', updatedAt: '', setBpm: 126, mode: 'dropchain',
        tracks: [
          { id: 'a', title: 'A', artist: '', at: 0 },
          { id: 'b', title: 'B', artist: '', at: 1, kind: 'swap', bars: 8, recipe: { kill: 2, depth: 'full' }, cues: { entryA: 64, cueB: 24 } },
        ],
      },
    ] as unknown as SavedSet[];
    const take = { kind: 'swap', bars: 8, entryA: 64, cueB: 24 };
    expect(savedRecipe(sets, 'a', 'b', take)).toEqual({ kill: 2, depth: 'full' });
    expect(savedRecipe(sets, 'a', 'b', { ...take, cueB: 20 })).toBeUndefined();
  });

  it('orders exits proven first and drops the take of a pair that needs work', () => {
    const pick = { kind: 'swap', bars: 8, entryA: 1, cueB: 2 };
    const rows = [
      row({ id: '1', toSongId: 'x', status: 'needs_work', plays: 17, preferred: pick }),
      row({ id: '2', toSongId: 'y', status: 'lab', plays: 3 }),
      row({ id: '3', toSongId: 'z', status: 'proven', plays: 1, preferred: pick }),
      row({ id: '4', fromSongId: 'other' }),
    ];
    expect(exitsFrom(rows, 'a').map((r) => r.id)).toEqual(['3', '2', '1']);
    expect(takeOf(rows[0])).toBeNull();
    expect(takeOf(rows[2])).toEqual(pick);
    expect(takeLabel(pick)).toBe('SWAP 8 · OUT 1 → IN 2');
  });
});
