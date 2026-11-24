import { describe, it, expect } from 'vitest';
import { planPlaylistRows, type ExistingPlaylistRow } from '../playlist-rows';

const t = (iso: string) => new Date(iso);
const NOW = t('2026-11-23T12:00:00Z');

function existing(...ids: string[]): ExistingPlaylistRow[] {
  return ids.map((id, i) => ({
    songId: id,
    songArtistTitle: `A - ${id}`,
    position: i,
    addedAt: t(`2026-0${i + 1}-01T00:00:00Z`),
  }));
}
const incoming = (...ids: string[]) => ids.map((id) => ({ songId: id, songArtistTitle: `A - ${id}` }));

describe('planPlaylistRows (#429)', () => {
  it('a sync with no remote change writes nothing and keeps every date', () => {
    const before = existing('a', 'b', 'c');
    const plan = planPlaylistRows(before, incoming('a', 'b', 'c'), { now: NOW });
    expect(plan.contentChanged).toBe(false);
    expect(plan.needsWrite).toBe(false);
    expect(plan.rows.map((r) => r.addedAt)).toEqual(before.map((r) => r.addedAt));
  });

  it('one added song: only that row gets now()', () => {
    const before = existing('a', 'b');
    const plan = planPlaylistRows(before, incoming('a', 'b', 'new'), { now: NOW });
    expect(plan.contentChanged).toBe(true);
    expect(plan.added).toBe(1);
    expect(plan.rows[0].addedAt).toEqual(before[0].addedAt);
    expect(plan.rows[1].addedAt).toEqual(before[1].addedAt);
    expect(plan.rows[2].addedAt).toEqual(NOW);
  });

  it('removal and reorder are content changes; surviving dates move with their songs', () => {
    const before = existing('a', 'b', 'c');
    const plan = planPlaylistRows(before, incoming('c', 'a'), { now: NOW });
    expect(plan.contentChanged).toBe(true);
    expect(plan.removed).toBe(1);
    expect(plan.rows.map((r) => [r.songId, r.position])).toEqual([['c', 0], ['a', 1]]);
    expect(plan.rows[0].addedAt).toEqual(before[2].addedAt);
  });

  it('a retagged title rewrites rows without counting as a content change', () => {
    const plan = planPlaylistRows(existing('a'), [{ songId: 'a', songArtistTitle: 'Fixed - a' }], { now: NOW });
    expect(plan.contentChanged).toBe(false);
    expect(plan.needsWrite).toBe(true);
  });

  it('a source add date (Liked: star time) wins and backfills the stored one', () => {
    const starred = t('2025-05-05T05:05:05Z');
    const plan = planPlaylistRows(existing('a'), [{ songId: 'a', songArtistTitle: 'A - a', addedAt: starred }], { now: NOW });
    expect(plan.rows[0].addedAt).toEqual(starred);
    expect(plan.contentChanged).toBe(false);
    expect(plan.needsWrite).toBe(true);
  });

  it('ignores an invalid source date and keeps the stored one', () => {
    const before = existing('a');
    const plan = planPlaylistRows(before, [{ songId: 'a', songArtistTitle: 'A - a', addedAt: new Date('nope') }], { now: NOW });
    expect(plan.rows[0].addedAt).toEqual(before[0].addedAt);
    expect(plan.needsWrite).toBe(false);
  });

  it('honours positionBase and drops a song listed twice', () => {
    const plan = planPlaylistRows([], incoming('a', 'b', 'a'), { now: NOW, positionBase: 1 });
    expect(plan.rows.map((r) => [r.songId, r.position])).toEqual([['a', 1], ['b', 2]]);
  });

  it('positionBase shift alone is a write but not a content change', () => {
    const plan = planPlaylistRows(existing('a', 'b'), incoming('a', 'b'), { now: NOW, positionBase: 1 });
    expect(plan.contentChanged).toBe(false);
    expect(plan.needsWrite).toBe(true);
  });
});
