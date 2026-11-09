import { beforeEach, describe, expect, it } from 'vitest';
import type { Song } from '@/lib/types/song';
import {
  LEGACY_RECENT_KEY,
  MAX_RECENT,
  addRecent,
  loadRecent,
  recentSearchKey,
  saveRecent,
  type RecentEntry,
} from '../recent-searches';

const song: Song = {
  id: 'song-1',
  name: 'Confession',
  albumId: 'album-1',
  duration: 200,
  track: 1,
  url: '/api/navidrome/stream/song-1',
  artist: 'James Hype',
  artistId: 'artist-1',
};

const query = (term: string): RecentEntry => ({ kind: 'query', term });

describe('recent searches', () => {
  beforeEach(() => localStorage.clear());

  it('saves clicked songs, artists and albums, newest first', () => {
    let list: RecentEntry[] = [query('james')];
    list = addRecent(list, { kind: 'song', song });
    list = addRecent(list, { kind: 'artist', id: 'artist-1', name: 'James Hype' });
    list = addRecent(list, { kind: 'album', id: 'album-1', name: 'Lies', artist: 'James Hype', artistId: 'artist-1' });
    saveRecent(localStorage, 'user-a', list);

    expect(loadRecent(localStorage, 'user-a').map((e) => e.kind)).toEqual(['album', 'artist', 'song', 'query']);
  });

  it('keeps each user’s list separate on the same browser', () => {
    saveRecent(localStorage, 'user-a', [query('drake')]);

    expect(loadRecent(localStorage, 'user-b')).toEqual([]);
    expect(loadRecent(localStorage, 'user-a')).toEqual([query('drake')]);
    expect(recentSearchKey('user-a')).not.toBe(recentSearchKey('user-b'));
  });

  it('removes the old shared list without giving it to anyone', () => {
    localStorage.setItem(LEGACY_RECENT_KEY, JSON.stringify(['someone else']));

    expect(loadRecent(localStorage, 'user-a')).toEqual([]);
    expect(localStorage.getItem(LEGACY_RECENT_KEY)).toBeNull();
  });

  it('moves a repeat to the front and drops the oldest past the cap', () => {
    let list: RecentEntry[] = [];
    for (let i = 0; i < MAX_RECENT; i++) list = addRecent(list, query(`q${i}`));
    list = addRecent(list, query('Q3')); // same query, different case
    expect(list[0]).toEqual(query('Q3'));
    expect(list).toHaveLength(MAX_RECENT);

    list = addRecent(list, { kind: 'song', song });
    expect(list).toHaveLength(MAX_RECENT);
    expect(list).not.toContainEqual(query('q0'));
  });

  it('ignores corrupt or unknown stored entries', () => {
    localStorage.setItem(recentSearchKey('user-a'), JSON.stringify([query('ok'), { kind: 'nope' }, 42]));
    expect(loadRecent(localStorage, 'user-a')).toEqual([query('ok')]);

    localStorage.setItem(recentSearchKey('user-a'), '{not json');
    expect(loadRecent(localStorage, 'user-a')).toEqual([]);
  });
});
