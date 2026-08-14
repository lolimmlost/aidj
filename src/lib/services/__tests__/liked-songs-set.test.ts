import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as navidrome from '../navidrome';

// Configurable resolve value for any awaited/`.then`ed db chain.
let resolveValue: unknown[] = [];

// Chainable, thenable db mock: every builder method returns the same proxy,
// and awaiting the proxy (or calling `.then`) resolves to `resolveValue`.
function makeDb() {
  const p: Record<string, unknown> = {};
  const methods = [
    'select', 'from', 'where', 'orderBy', 'limit',
    'insert', 'values', 'onConflictDoUpdate', 'returning',
    'update', 'set', 'delete',
  ];
  for (const m of methods) p[m] = vi.fn(() => p);
  (p as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(resolveValue).then(onFulfilled);
  return p;
}

vi.mock('@/lib/db', () => ({ db: makeDb() }));

vi.mock('../navidrome', () => ({
  starSong: vi.fn().mockResolvedValue(undefined),
  unstarSong: vi.fn().mockResolvedValue(undefined),
  getSongsByIds: vi.fn().mockResolvedValue([]),
  getStarredSongs: vi.fn().mockResolvedValue([]),
}));

vi.mock('../navidrome-users', () => ({
  getNavidromeUserCreds: vi.fn().mockResolvedValue(null),
}));

import { setSongLiked, isCanonicalLikedPlaylist } from '../liked-songs-sync';

const CREDS = { username: 'u', token: 't', salt: 's' } as unknown as Parameters<typeof setSongLiked>[3];

describe('setSongLiked write-through', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveValue = [];
  });

  it('liking a song stars it in Navidrome (source of truth)', async () => {
    // findLikedPlaylist resolves to an existing mirror playlist so no create path.
    resolveValue = [{ id: 'pl1', name: '❤️ Liked Songs', navidromeId: null }];
    await setSongLiked('user-1', 'song-1', true, CREDS, { artist: 'A', title: 'T' });

    expect(navidrome.starSong).toHaveBeenCalledWith('song-1', CREDS);
    expect(navidrome.unstarSong).not.toHaveBeenCalled();
  });

  it('unliking a song unstars it in Navidrome (the "remove = unstar" fix)', async () => {
    resolveValue = [];
    await setSongLiked('user-1', 'song-1', false, CREDS);

    expect(navidrome.unstarSong).toHaveBeenCalledWith('song-1', CREDS);
    expect(navidrome.starSong).not.toHaveBeenCalled();
  });
});

describe('isCanonicalLikedPlaylist', () => {
  it('matches the app-managed ❤️ Liked Songs playlist', () => {
    expect(isCanonicalLikedPlaylist({ name: '❤️ Liked Songs', navidromeId: null })).toBe(true);
  });

  it('rejects Navidrome-backed playlists (e.g. "Loved Songs")', () => {
    expect(isCanonicalLikedPlaylist({ name: 'Loved Songs', navidromeId: '99x5' })).toBe(false);
  });

  it('rejects unrelated playlists', () => {
    expect(isCanonicalLikedPlaylist({ name: 'Road Trip', navidromeId: null })).toBe(false);
  });
});
