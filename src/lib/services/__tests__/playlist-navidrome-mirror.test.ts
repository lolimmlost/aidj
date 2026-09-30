import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../navidrome', () => ({
  createPlaylist: vi.fn(),
  addSongsToPlaylist: vi.fn(),
  getPlaylist: vi.fn(),
  getPlaylists: vi.fn(),
  removeSongsFromPlaylistByIndex: vi.fn(),
  replacePlaylistSongs: vi.fn(),
}));

// The mirror imports db + navidrome-users at module load; stub them. Only
// mirrorReplaceSongs reads the db (via queueSelects below).
vi.mock('@/lib/db', () => ({ db: { select: vi.fn() } }));
vi.mock('../navidrome-users', () => ({ getNavidromeUserCreds: vi.fn() }));

import { db } from '@/lib/db';
import { getPlaylist, removeSongsFromPlaylistByIndex, replacePlaylistSongs } from '../navidrome';
import { mirrorRemoveSong, mirrorReplaceSongs } from '../playlist-navidrome-mirror';
import type { SubsonicCreds } from '../navidrome-users';

const creds = { username: 'u', password: 'p' } as unknown as SubsonicCreds;

describe('mirrorRemoveSong', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not throw and skips removal when the playlist has no entries (Subsonic omits `entry`)', async () => {
    // Empty Navidrome playlist: `entry` is absent from the response entirely.
    vi.mocked(getPlaylist).mockResolvedValue({ id: 'pl1', name: 'x' } as never);

    await expect(mirrorRemoveSong('pl1', 'songA', creds)).resolves.toBeUndefined();
    expect(removeSongsFromPlaylistByIndex).not.toHaveBeenCalled();
  });

  it('removes by the matching index when the song is present', async () => {
    vi.mocked(getPlaylist).mockResolvedValue({
      id: 'pl1',
      name: 'x',
      entry: [{ id: 'songA' }, { id: 'songB' }, { id: 'songA' }],
    } as never);

    await mirrorRemoveSong('pl1', 'songA', creds);

    expect(removeSongsFromPlaylistByIndex).toHaveBeenCalledWith('pl1', [0, 2], creds);
  });

  it('is a no-op when the song is not on the server', async () => {
    vi.mocked(getPlaylist).mockResolvedValue({
      id: 'pl1',
      name: 'x',
      entry: [{ id: 'songB' }],
    } as never);

    await mirrorRemoveSong('pl1', 'songA', creds);

    expect(removeSongsFromPlaylistByIndex).not.toHaveBeenCalled();
  });

  it('never throws even if Navidrome errors', async () => {
    vi.mocked(getPlaylist).mockRejectedValue(new Error('navidrome down'));

    await expect(mirrorRemoveSong('pl1', 'songA', creds)).resolves.toBeUndefined();
    expect(removeSongsFromPlaylistByIndex).not.toHaveBeenCalled();
  });
});

/** Each call answers one db.select(...) chain, in order: .limit() or .orderBy() resolve to `rows`. */
function queueSelects(...results: unknown[][]) {
  for (const rows of results) {
    vi.mocked(db.select).mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: async () => rows, orderBy: async () => rows }) }),
    } as never);
  }
}

describe('mirrorReplaceSongs', () => {
  beforeEach(() => vi.clearAllMocks());

  const basic = { id: 'pl1', navidromeId: 'nd1', smartPlaylistCriteria: null, isLikedSongs: false };

  it('rewrites the Navidrome copy from the local order', async () => {
    queueSelects([basic], [{ songId: 'a' }, { songId: 'new' }, { songId: 'c' }]);
    await expect(mirrorReplaceSongs('pl1', 'u1', creds)).resolves.toBe(true);
    expect(replacePlaylistSongs).toHaveBeenCalledWith('nd1', ['a', 'new', 'c'], creds);
  });

  it.each([
    ['a local-only playlist (no navidromeId yet)', { ...basic, navidromeId: null }],
    ['the canonical Liked Songs list (a mirror of stars)', { ...basic, isLikedSongs: true }],
    ['a smart playlist', { ...basic, smartPlaylistCriteria: { rules: [] } }],
  ])('skips %s', async (_label, row) => {
    queueSelects([row]);
    await expect(mirrorReplaceSongs('pl1', 'u1', creds)).resolves.toBe(false);
    expect(replacePlaylistSongs).not.toHaveBeenCalled();
  });

  it('never throws when Navidrome fails', async () => {
    queueSelects([basic], [{ songId: 'a' }]);
    vi.mocked(replacePlaylistSongs).mockRejectedValue(new Error('503'));
    await expect(mirrorReplaceSongs('pl1', 'u1', creds)).resolves.toBe(false);
  });
});
