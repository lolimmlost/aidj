import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Song } from '@/lib/types/song';
import { loadRecent, saveRecent, type RecentEntry } from '@/lib/utils/recent-searches';
import { QUERY_SAVE_DELAY_MS, useRecentSearches } from '../useRecentSearches';

const song: Song = {
  id: 'song-1',
  name: 'Rapture',
  albumId: 'album-1',
  duration: 200,
  track: 1,
  url: '/api/navidrome/stream/song-1',
  artist: 'Dom Dolla',
  artistId: 'artist-1',
};

const query = (term: string): RecentEntry => ({ kind: 'query', term });

describe('useRecentSearches', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a result clicked while the typed query is still waiting to save', () => {
    const { result, rerender } = renderHook(({ q }) => useRecentSearches('user-a', q), {
      initialProps: { q: '' },
    });

    rerender({ q: 'dom dolla' });
    act(() => result.current.recordRecent({ kind: 'song', song }));
    act(() => vi.advanceTimersByTime(QUERY_SAVE_DELAY_MS));

    const expected = [query('dom dolla'), { kind: 'song', song }];
    expect(result.current.recent).toEqual(expected);
    expect(loadRecent(localStorage, 'user-a')).toEqual(expected);
  });

  it('adds a query from the URL to the saved history instead of replacing it', () => {
    saveRecent(localStorage, 'user-a', [query('drake')]);

    const { result } = renderHook(() => useRecentSearches('user-a', 'fleetwood'));
    act(() => vi.advanceTimersByTime(QUERY_SAVE_DELAY_MS));

    const expected = [query('fleetwood'), query('drake')];
    expect(result.current.recent).toEqual(expected);
    expect(loadRecent(localStorage, 'user-a')).toEqual(expected);
  });
});
