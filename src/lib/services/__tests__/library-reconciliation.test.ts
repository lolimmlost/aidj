import { describe, it, expect, vi, beforeEach } from 'vitest';

// Each db.select() answers the next queued result set, whatever chain follows it
// (liked, feedback, playlist rows — the order reconcileLibrary issues them).
const selectResults: unknown[][] = [];
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const rows = selectResults.shift() ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ['from', 'where', 'innerJoin', 'orderBy', 'limit']) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => resolve(rows);
      return chain;
    }),
  },
}));
vi.mock('../navidrome', () => ({
  getSongsByIds: vi.fn(),
  search: vi.fn(),
  apiFetch: vi.fn(),
  buildSubsonicUrl: (endpoint: string) => new URL(`http://nd/rest/${endpoint}`),
}));
vi.mock('../navidrome-users', () => ({ getNavidromeUserCreds: vi.fn(async () => null) }));
vi.mock('../song-repoint', () => ({
  repointSongId: vi.fn(),
  describeRepoint: () => ['playlist_songs×1'],
  loadStarState: vi.fn(async () => ({ starred: new Set(), ghosts: new Set() })),
}));

import { getSongsByIds, search } from '../navidrome';
import { repointSongId } from '../song-repoint';
import { reconcileLibrary } from '../library-reconciliation';

// The 2026-09-30 case: a retagged song read as dead mid-scan and the matcher
// found a same-length song by another artist.
const DEAD = 'QHbiuD3WLQt8UNkiBWtqI8';
const LIVE = 'live-match';

let scanning: boolean[]; // successive getScanStatus answers; the last one repeats
let deadStream: boolean; // whether DEAD's stream currently fails

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/getScanStatus')) {
      const s = scanning.length > 1 ? scanning.shift()! : scanning[0];
      return { json: async () => ({ 'subsonic-response': { status: 'ok', scanStatus: { scanning: s } } }) };
    }
    if (url.includes('/stream')) {
      const dead = url.includes(`id=${DEAD}`) && deadStream;
      return { headers: new Headers({ 'content-type': dead ? 'text/xml' : 'audio/mpeg' }) };
    }
    return { json: async () => ({}) }; // startScan
  }));
}

describe('reconcileLibrary scan guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    selectResults.push([], [], [{ songId: DEAD, playlistId: 'pl1', songArtistTitle: 'Deep Sea Arcade - Outlaw' }]);
    scanning = [false];
    deadStream = true;
    stubFetch();
    // Detection: metadata still resolves (Navidrome keeps it), the stream is what fails.
    vi.mocked(getSongsByIds).mockResolvedValue([{ id: DEAD, duration: 225.62 }] as never);
    vi.mocked(search).mockResolvedValue([{ id: LIVE, artist: 'Deep Sea Arcade', title: 'Outlaw', name: 'Outlaw' }] as never);
    vi.mocked(repointSongId).mockResolvedValue({} as never);
  });

  it('repoints a dead id when no scan is running and it is still dead on re-check', async () => {
    const r = await reconcileLibrary('u1');
    expect(repointSongId).toHaveBeenCalledWith(expect.objectContaining({ oldId: DEAD, newId: LIVE }));
    expect(r).toMatchObject({ deadIds: 1, remapped: 1, revived: 0, skipped: undefined });
  });

  it('skips the whole run while Navidrome is scanning — reads nothing, writes nothing', async () => {
    scanning = [true];
    const r = await reconcileLibrary('u1');
    expect(r).toMatchObject({ skipped: 'scan_in_progress', checkedIds: 0, remapped: 0 });
    expect(getSongsByIds).not.toHaveBeenCalled();
    expect(repointSongId).not.toHaveBeenCalled();
  });

  it('treats an unreadable scan status as scanning', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      throw new Error('ECONNREFUSED');
    });
    const r = await reconcileLibrary('u1');
    expect(r.skipped).toBe('scan_in_progress');
    expect(repointSongId).not.toHaveBeenCalled();
  });

  it('stops before writing when a scan starts mid-run', async () => {
    scanning = [false, true]; // idle at the start, scanning by the pre-write re-check
    const r = await reconcileLibrary('u1');
    expect(r).toMatchObject({ deadIds: 1, remapped: 0, skipped: 'scan_in_progress' });
    expect(repointSongId).not.toHaveBeenCalled();
  });

  it('leaves an id alone when it streams again by the pre-write re-check', async () => {
    const realFetch = vi.mocked(fetch).getMockImplementation()!;
    let streamChecks = 0;
    vi.mocked(fetch).mockImplementation(async (url) => {
      // First stream check (detection) fails; later ones succeed — the file is back.
      if (String(url).includes(`/stream`) && String(url).includes(`id=${DEAD}`)) deadStream = streamChecks++ === 0;
      return realFetch(url as string);
    });
    const r = await reconcileLibrary('u1');
    expect(r).toMatchObject({ deadIds: 1, remapped: 0, revived: 1 });
    expect(repointSongId).not.toHaveBeenCalled();
  });

  it('leaves an id alone when its metadata resolves again (Navidrome kept the id)', async () => {
    // Detection: gone from the API entirely. Re-check: back, and streaming.
    vi.mocked(getSongsByIds)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValue([{ id: DEAD }] as never);
    deadStream = false;
    const r = await reconcileLibrary('u1');
    expect(r).toMatchObject({ deadIds: 1, revived: 1, remapped: 0 });
    expect(repointSongId).not.toHaveBeenCalled();
  });
});
