import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../navidrome', () => ({
  createPlaylist: vi.fn(),
  addSongsToPlaylist: vi.fn(),
  getPlaylist: vi.fn(),
  getPlaylists: vi.fn(),
  removeSongsFromPlaylistByIndex: vi.fn(),
}));

// The mirror imports db + navidrome-users at module load; stub them so the
// module can be imported even though these tests only exercise mirrorRemoveSong.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('../navidrome-users', () => ({ getNavidromeUserCreds: vi.fn() }));

import { getPlaylist, removeSongsFromPlaylistByIndex } from '../navidrome';
import { mirrorRemoveSong } from '../playlist-navidrome-mirror';
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
