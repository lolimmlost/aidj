import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { transaction: vi.fn() } }));
vi.mock('../navidrome', () => ({
  starSong: vi.fn(),
  unstarSong: vi.fn(),
  getStarredSongs: vi.fn(),
  getMissingStarredSongs: vi.fn(),
}));
vi.mock('../playlist-navidrome-mirror', () => ({ mirrorReplaceSongs: vi.fn() }));
vi.mock('@/lib/config/config', () => ({ getConfig: () => ({ navidromeUsername: 'juan' }) }));

import { db } from '@/lib/db';
import { starSong, unstarSong } from '../navidrome';
import { mirrorReplaceSongs } from '../playlist-navidrome-mirror';
import { repointSongId, describeRepoint, DryRunRollback, type StarState } from '../song-repoint';

// The 2026-09-02 live case from #221: one retagged song liked, thumbed up and in
// four playlists. The SQL itself is rehearsed against a prod copy; these tests
// cover what happens around the transaction.
const counts = {
  liked: 1,
  feedback: 1,
  playlistRows: 4,
  history: 12,
  scores: 1,
  playlistIds: ['liked', 'radio', 'chosic1', 'chosic2'],
};
const input = { userId: 'u1', oldId: 'old', newId: 'new', artist: 'A', title: 'T' };
const stars = (starred: string[], ghosts: string[] = []): StarState => ({
  starred: new Set(starred),
  ghosts: new Set(ghosts),
});

describe('repointSongId', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.transaction).mockResolvedValue(counts as never);
    vi.mocked(mirrorReplaceSongs).mockResolvedValue(true);
  });

  it('rejects missing or identical ids before touching anything', async () => {
    await expect(repointSongId({ ...input, newId: 'old' })).rejects.toThrow(/invalid ids/);
    await expect(repointSongId({ ...input, oldId: '' })).rejects.toThrow(/invalid ids/);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('moves the star, unstars the ghost and mirrors every touched playlist', async () => {
    const s = stars(['old'], ['old']);
    const r = await repointSongId({ ...input, stars: s });

    expect(starSong).toHaveBeenCalledWith('new', undefined);
    expect(unstarSong).toHaveBeenCalledWith('old', undefined);
    expect(mirrorReplaceSongs).toHaveBeenCalledTimes(4);
    expect(r).toMatchObject({ starMoved: true, ghostUnstarred: true, playlistsMirrored: 4 });
    // The shared star sets follow the move, so the next id in a run sees current state.
    expect([...s.starred]).toEqual(['new']);
    expect(s.ghosts.size).toBe(0);
  });

  it('does not re-star when the new id is already starred, nor unstar a live (non-ghost) star', async () => {
    const r = await repointSongId({ ...input, stars: stars(['old', 'new']) });
    expect(starSong).not.toHaveBeenCalled();
    expect(unstarSong).not.toHaveBeenCalled();
    expect(r.starMoved).toBe(false);
  });

  it('counts only playlists whose Navidrome copy was actually rewritten', async () => {
    vi.mocked(mirrorReplaceSongs).mockImplementation(async (id) => id !== 'chosic1' && id !== 'chosic2');
    const r = await repointSongId({ ...input, stars: stars([]) });
    expect(r.playlistsMirrored).toBe(2);
  });

  it('a second run finds nothing to move and makes no Navidrome calls', async () => {
    vi.mocked(db.transaction).mockResolvedValue({
      liked: 0, feedback: 0, playlistRows: 0, history: 0, scores: 0, playlistIds: [],
    } as never);
    const r = await repointSongId({ ...input, stars: stars(['new']) });
    expect(describeRepoint(r)).toEqual([]);
    expect(starSong).not.toHaveBeenCalled();
    expect(mirrorReplaceSongs).not.toHaveBeenCalled();
  });

  it('dry run returns the counts but makes no Navidrome calls', async () => {
    vi.mocked(db.transaction).mockRejectedValue(new DryRunRollback(counts));
    const r = await repointSongId({ ...input, dryRun: true, stars: stars(['old']) });
    expect(r).toMatchObject({ playlistRows: 4, history: 12, playlistsMirrored: 0, starMoved: false });
    expect(starSong).not.toHaveBeenCalled();
    expect(mirrorReplaceSongs).not.toHaveBeenCalled();
  });

  it('navidrome: false writes the DB but leaves stars and mirrors alone', async () => {
    const r = await repointSongId({ ...input, navidrome: false, stars: stars(['old']) });
    expect(r.playlistRows).toBe(4);
    expect(starSong).not.toHaveBeenCalled();
    expect(mirrorReplaceSongs).not.toHaveBeenCalled();
  });

  it('a failed transaction throws and nothing on Navidrome is touched', async () => {
    vi.mocked(db.transaction).mockRejectedValue(new Error('deadlock'));
    await expect(repointSongId({ ...input, stars: stars(['old']) })).rejects.toThrow('deadlock');
    expect(starSong).not.toHaveBeenCalled();
    expect(mirrorReplaceSongs).not.toHaveBeenCalled();
  });

  it('a Navidrome star failure is reported, not thrown', async () => {
    vi.mocked(starSong).mockRejectedValue(new Error('503'));
    const r = await repointSongId({ ...input, stars: stars(['old']) });
    expect(r.starMoved).toBe(false);
    expect(r.playlistsMirrored).toBe(4);
  });
});

describe('describeRepoint', () => {
  it('labels what moved', () => {
    expect(
      describeRepoint({ ...counts, playlistsMirrored: 2, starMoved: true, ghostUnstarred: false }),
    ).toEqual([
      'liked_songs_sync',
      'recommendation_feedback',
      'playlist_songs×4',
      'listening_history×12',
      'compound_scores',
      'navidrome_playlist×2',
      'navidrome_star',
    ]);
  });
});
