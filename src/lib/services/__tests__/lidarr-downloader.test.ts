import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queueToLidarr } from '../lidarr-downloader';

// Minimal in-memory Lidarr: one artist with four albums.
type Album = { id: number; title: string; foreignAlbumId: string; monitored: boolean; artistId: number; statistics: { percentOfTracks: number } };
let albums: Album[];
const BASE = 'http://lidarr.test';

function fakeLidarr(url: string, init?: RequestInit): Response {
  const u = new URL(url);
  const path = u.pathname.replace('/api/v1', '');
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
  const method = init?.method ?? 'GET';
  if (path === '/rootfolder') return json([{ path: '/music' }]);
  if (path === '/qualityprofile' || path === '/metadataprofile') return json([{ id: 1 }]);
  if (path === '/artist/lookup') return json([{ artistName: 'Guts', foreignArtistId: 'mb-guts' }]);
  if (path === '/artist' && method === 'GET') return json([{ id: 7, artistName: 'Guts', foreignArtistId: 'mb-guts', monitored: true, monitorNewItems: 'none' }]);
  if (path === '/album' && method === 'GET') {
    const artistId = u.searchParams.get('artistId');
    return json(artistId ? albums.filter((a) => a.artistId === Number(artistId)) : albums);
  }
  const m = path.match(/^\/album\/(\d+)$/);
  if (m && method === 'PUT') {
    const body = JSON.parse(String(init!.body));
    albums = albums.map((a) => (a.id === Number(m[1]) ? { ...a, monitored: body.monitored } : a));
    return json(body);
  }
  if (path === '/command') return json({ id: 1 });
  return new Response('not found', { status: 404 });
}

const monitored = () => albums.filter((a) => a.monitored).map((a) => a.title).sort();

describe('queueToLidarr monitoring', () => {
  beforeEach(() => {
    process.env.LIDARR_URL = BASE;
    process.env.LIDARR_API_KEY = 'k';
    albums = [
      { id: 1, title: 'Paradise for All', foreignAlbumId: 'a1', monitored: false, artistId: 7, statistics: { percentOfTracks: 0 } },
      { id: 2, title: 'Guts (Le Bienheureux)', foreignAlbumId: 'a2', monitored: false, artistId: 7, statistics: { percentOfTracks: 0 } },
      { id: 3, title: 'Hip Hop After All', foreignAlbumId: 'a3', monitored: true, artistId: 7, statistics: { percentOfTracks: 40 } },
      { id: 4, title: 'Unrequested', foreignAlbumId: 'a4', monitored: false, artistId: 7, statistics: { percentOfTracks: 0 } },
    ];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => fakeLidarr(url, init)));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps every album queued in the same batch for one artist', async () => {
    const r = await queueToLidarr([
      { artist: 'Guts', title: 'Song A', album: 'Paradise for All' },
      { artist: 'Guts', title: 'Song B', album: 'Guts (Le Bienheureux)' },
    ]);
    expect(r.queued).toBe(2);
    expect(monitored()).toEqual(['Guts (Le Bienheureux)', 'Hip Hop After All', 'Paradise for All']);
  });

  it('leaves an album that was already monitored monitored', async () => {
    await queueToLidarr([{ artist: 'Guts', title: 'Song A', album: 'Paradise for All' }]);
    expect(albums.find((a) => a.id === 3)!.monitored).toBe(true);
  });

  it('still unmonitors an album nobody asked for that got turned on mid-run', async () => {
    // Simulate a refresh flipping album 4 on after the run's snapshot was taken.
    const real = (globalThis.fetch as ReturnType<typeof vi.fn>).getMockImplementation()!;
    let flipped = false;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      const res = await real(url, init);
      if (!flipped && init?.method === 'PUT' && /\/album\/1$/.test(url)) {
        flipped = true;
        albums = albums.map((a) => (a.id === 4 ? { ...a, monitored: true } : a));
      }
      return res;
    });
    await queueToLidarr([{ artist: 'Guts', title: 'Song A', album: 'Paradise for All' }]);
    expect(albums.find((a) => a.id === 4)!.monitored).toBe(false);
  });
});
