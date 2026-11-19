import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LidarrAlbumRecord, LidarrArtistRecord, LidarrMetadataProfile } from '../lidarr';

// In-memory Lidarr. Each test seeds it; the mocked API reads/writes it.
const lidarr = vi.hoisted(() => ({
  artists: [] as LidarrArtistRecord[],
  albums: [] as LidarrAlbumRecord[],
  profiles: [] as LidarrMetadataProfile[],
  lookup: null as LidarrArtistRecord | null,
  /** Albums that only appear after a RefreshArtist (hidden by the profile). */
  hiddenUntilRefresh: [] as LidarrAlbumRecord[],
  searched: [] as number[],
  refreshed: [] as number[],
  monitorCalls: [] as Array<{ ids: number[]; monitored: boolean }>,
}));

vi.mock('../lidarr', () => ({
  findArtistByMbid: vi.fn(async (mbid: string) => lidarr.artists.find(a => a.foreignArtistId === mbid) ?? null),
  lookupArtistByMbid: vi.fn(async () => lidarr.lookup),
  addArtist: vi.fn(async (a: LidarrArtistRecord) => {
    lidarr.artists.push({ ...a, id: 900, monitored: true, monitorNewItems: 'none', metadataProfileId: 1, qualityProfileId: 1 });
  }),
  updateArtist: vi.fn(async (artist: LidarrArtistRecord, changes: Partial<LidarrArtistRecord>) => {
    const i = lidarr.artists.findIndex(a => a.id === artist.id);
    lidarr.artists[i] = { ...lidarr.artists[i], ...changes };
    return lidarr.artists[i];
  }),
  listArtistAlbums: vi.fn(async (id: number) => lidarr.albums.filter(a => a.artistId === id)),
  setAlbumsMonitored: vi.fn(async (ids: number[], monitored: boolean) => {
    lidarr.monitorCalls.push({ ids, monitored });
    for (const a of lidarr.albums) if (ids.includes(a.id)) a.monitored = monitored;
  }),
  searchForAlbum: vi.fn(async (id: number) => { lidarr.searched.push(id); return true; }),
  getMetadataProfiles: vi.fn(async () => lidarr.profiles),
  createMetadataProfile: vi.fn(async (p: Omit<LidarrMetadataProfile, 'id'>) => {
    const created = { ...p, id: 10 + lidarr.profiles.length };
    lidarr.profiles.push(created);
    return created;
  }),
  refreshArtist: vi.fn(async (id: number) => {
    lidarr.refreshed.push(id);
    lidarr.albums.push(...lidarr.hiddenUntilRefresh.filter(a => a.artistId === id));
    lidarr.hiddenUntilRefresh = [];
  }),
}));

import {
  requestFromLidarr,
  getArtistRequestStatus,
  resolveSongRelease,
  albumState,
  __setSleepForTests,
} from '../lidarr-request';
import * as api from '../lidarr';

const MBID = '780269c0-0000-4000-8000-000000000000';
const RG_ALBUM = '2494f053-262a-4a4e-9cae-8e87272cef6e';
const RG_SINGLE = '9601211c-83e5-4ec8-8816-8c3bc4a6a592';

function artist(over: Partial<LidarrArtistRecord> = {}): LidarrArtistRecord {
  return {
    id: 2503, artistName: '千葉雄喜', foreignArtistId: MBID, images: [], links: [], genres: [], status: 'continuing',
    monitored: false, monitorNewItems: 'none', metadataProfileId: 1, qualityProfileId: 1, ...over,
  };
}

function album(over: Partial<LidarrAlbumRecord> = {}): LidarrAlbumRecord {
  return {
    id: 31631, title: 'Eien', artistId: 2503, foreignAlbumId: RG_ALBUM, monitoringStatus: '', images: [], links: [],
    secondaryTypes: [], monitored: false,
    statistics: { trackFileCount: 0, trackCount: 10, totalTrackCount: 10, sizeOnDisk: 0, percentOfTracks: 0 },
    ...over,
  };
}

function profile(id: number, name: string, allowed: string[]): LidarrMetadataProfile {
  const types = [['Single', 2], ['Other', 4], ['EP', 1], ['Broadcast', 3], ['Album', 0]] as const;
  return {
    id, name,
    primaryAlbumTypes: types.map(([n, i]) => ({ albumType: { id: i, name: n }, allowed: allowed.includes(n) })),
    secondaryAlbumTypes: [{ albumType: { id: 0, name: 'Studio' }, allowed: true }],
    releaseStatuses: [{ releaseStatus: { id: 0, name: 'Official' }, allowed: true }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lidarr.artists = [];
  lidarr.albums = [];
  lidarr.profiles = [profile(1, 'Standard', ['Album']), profile(3, 'Studio + Soundtrack', ['Album'])];
  lidarr.lookup = null;
  lidarr.hiddenUntilRefresh = [];
  lidarr.searched = [];
  lidarr.refreshed = [];
  lidarr.monitorCalls = [];
  __setSleepForTests(async () => {});
});

describe('requestFromLidarr — artist mode (#435)', () => {
  it('follows an existing unmonitored artist: monitored + monitorNewItems=new', async () => {
    lidarr.artists = [artist()];
    const r = await requestFromLidarr({ mbid: MBID, artistName: '千葉雄喜', mode: 'artist' });
    expect(r.outcome).toBe('monitored');
    expect(lidarr.artists[0]).toMatchObject({ monitored: true, monitorNewItems: 'new' });
  });

  it("never lowers monitorNewItems='all'", async () => {
    lidarr.artists = [artist({ monitored: false, monitorNewItems: 'all' })];
    await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'artist' });
    expect(lidarr.artists[0].monitorNewItems).toBe('all');
  });

  it('reports an artist that is already followed without writing', async () => {
    lidarr.artists = [artist({ monitored: true, monitorNewItems: 'new' })];
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'artist' });
    expect(r.outcome).toBe('already_monitored');
    expect(api.updateArtist).not.toHaveBeenCalled();
  });

  it('adds a missing artist by exact MBID, then follows it', async () => {
    lidarr.lookup = artist();
    const r = await requestFromLidarr({ mbid: MBID, artistName: '千葉雄喜', mode: 'artist' });
    expect(api.addArtist).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ outcome: 'monitored', lidarrArtistId: 900 });
    expect(lidarr.artists[0]).toMatchObject({ monitored: true, monitorNewItems: 'new' });
  });

  it('returns not_found when MusicBrainz has no such artist', async () => {
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'artist' });
    expect(r.outcome).toBe('not_found');
    expect(api.addArtist).not.toHaveBeenCalled();
  });
});

describe('requestFromLidarr — release mode (#436)', () => {
  it('monitors the exact release group, monitors the artist, and searches', async () => {
    lidarr.artists = [artist()];
    lidarr.albums = [album()];
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_ALBUM, releaseType: 'Album' });
    expect(r).toMatchObject({ outcome: 'monitored', lidarrAlbumId: 31631, releaseTitle: 'Eien' });
    expect(lidarr.albums[0].monitored).toBe(true);
    expect(lidarr.artists[0].monitored).toBe(true);
    expect(lidarr.artists[0].monitorNewItems).toBe('none'); // release pick doesn't follow the artist
    expect(lidarr.searched).toEqual([31631]);
  });

  it("never unmonitors another user's pick", async () => {
    lidarr.artists = [artist({ monitored: true })];
    lidarr.albums = [album(), album({ id: 2, foreignAlbumId: 'other', monitored: true })];
    await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_ALBUM });
    expect(lidarr.monitorCalls).toEqual([{ ids: [31631], monitored: true }]);
    expect(lidarr.albums[1].monitored).toBe(true);
  });

  it('says in_library / already_monitored instead of re-queueing', async () => {
    lidarr.artists = [artist({ monitored: true })];
    lidarr.albums = [album({ statistics: { trackFileCount: 10, trackCount: 10, totalTrackCount: 10, sizeOnDisk: 1, percentOfTracks: 100 } })];
    expect((await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_ALBUM })).outcome).toBe('in_library');

    lidarr.albums = [album({ monitored: true })];
    expect((await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_ALBUM })).outcome).toBe('already_monitored');
    expect(lidarr.searched).toEqual([]);
  });

  it('treats a monitored album under an UNmonitored artist as not wanted (the #435 state)', async () => {
    lidarr.artists = [artist({ monitored: false })];
    lidarr.albums = [album({ monitored: true })];
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_ALBUM });
    expect(r.outcome).toBe('monitored');
    expect(lidarr.artists[0].monitored).toBe(true);
  });

  it('widens only this artist\'s profile for a single, refreshes, then monitors it', async () => {
    lidarr.artists = [artist()];
    lidarr.albums = [album()];
    lidarr.hiddenUntilRefresh = [album({ id: 31632, title: 'STAR', foreignAlbumId: RG_SINGLE })];
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_SINGLE, releaseType: 'Single' });

    const widened = lidarr.profiles.find(p => p.name === 'Standard + Singles/EPs')!;
    expect(widened).toBeDefined();
    expect(widened.primaryAlbumTypes.filter(t => t.allowed).map(t => t.albumType.name).sort()).toEqual(['Album', 'EP', 'Single']);
    expect(widened.secondaryAlbumTypes).toEqual(lidarr.profiles[0].secondaryAlbumTypes);
    expect(lidarr.artists[0].metadataProfileId).toBe(widened.id);
    expect(lidarr.profiles.find(p => p.id === 1)!.primaryAlbumTypes.filter(t => t.allowed).length).toBe(1); // default untouched
    expect(lidarr.refreshed).toEqual([2503]);
    expect(r).toMatchObject({ outcome: 'monitored', lidarrAlbumId: 31632 });
  });

  it('reuses an existing widened profile instead of creating another', async () => {
    lidarr.profiles.push(profile(7, 'Standard + Singles/EPs', ['Album', 'EP', 'Single']));
    lidarr.artists = [artist()];
    lidarr.hiddenUntilRefresh = [album({ id: 5, foreignAlbumId: RG_SINGLE })];
    await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_SINGLE, releaseType: 'Single' });
    expect(api.createMetadataProfile).not.toHaveBeenCalled();
    expect(lidarr.artists[0].metadataProfileId).toBe(7);
  });

  it('keeps a soundtrack artist\'s profile traits when widening', async () => {
    lidarr.profiles[1].secondaryAlbumTypes.push({ albumType: { id: 2, name: 'Soundtrack' }, allowed: true });
    lidarr.artists = [artist({ metadataProfileId: 3 })];
    lidarr.hiddenUntilRefresh = [album({ id: 5, foreignAlbumId: RG_SINGLE })];
    await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_SINGLE, releaseType: 'EP' });
    const widened = lidarr.profiles.find(p => p.name === 'Studio + Soundtrack + Singles/EPs')!;
    expect(widened.secondaryAlbumTypes.map(t => t.albumType.name)).toContain('Soundtrack');
  });

  it("returns pending when Lidarr still hasn't listed the release; a recheck doesn't refresh again", async () => {
    lidarr.artists = [artist()];
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_SINGLE, releaseType: 'Single' });
    expect(r).toMatchObject({ outcome: 'pending', releaseGroupId: RG_SINGLE });
    expect(lidarr.refreshed).toHaveLength(1);

    await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_SINGLE, recheck: true });
    expect(lidarr.refreshed).toHaveLength(1);
  });
});

describe('requestFromLidarr — song mode', () => {
  const groups = [
    { id: RG_ALBUM, title: 'Eien', primaryType: 'Album', firstReleaseDate: '2025-01-01' },
    { id: RG_SINGLE, title: 'STAR', primaryType: 'Single', firstReleaseDate: '2024-05-01' },
  ];

  it('uses the Last.fm album when it matches a release group', async () => {
    lidarr.artists = [artist()];
    lidarr.albums = [album()];
    const r = await requestFromLidarr(
      { mbid: MBID, artistName: 'x', mode: 'song', songTitle: 'Some Track', releaseGroups: groups },
      { lookupAlbum: async () => 'Eien (Deluxe Edition)' },
    );
    expect(r).toMatchObject({ outcome: 'monitored', releaseGroupId: RG_ALBUM });
  });

  it('falls back to a single named after the song', async () => {
    expect(await resolveSongRelease('x', 'Star', groups, async () => null)).toMatchObject({ id: RG_SINGLE });
  });

  it("says not_found rather than guessing the latest album", async () => {
    lidarr.artists = [artist()];
    lidarr.albums = [album()];
    const r = await requestFromLidarr(
      { mbid: MBID, artistName: 'x', mode: 'song', songTitle: 'Unknown', releaseGroups: groups },
      { lookupAlbum: async () => null },
    );
    expect(r.outcome).toBe('not_found');
    expect(lidarr.monitorCalls).toEqual([]);
  });
});

describe('getArtistRequestStatus', () => {
  it('reports the artist and each album state keyed by release group', async () => {
    lidarr.artists = [artist({ monitored: true, monitorNewItems: 'new' })];
    lidarr.albums = [
      album({ monitored: true }),
      album({ id: 2, foreignAlbumId: RG_SINGLE, statistics: { trackFileCount: 1, trackCount: 3, totalTrackCount: 3, sizeOnDisk: 1, percentOfTracks: 33 } }),
    ];
    const s = await getArtistRequestStatus(MBID);
    expect(s).toMatchObject({ inLidarr: true, artistMonitored: true, followingNewReleases: true });
    expect(s.albums[RG_ALBUM].state).toBe('wanted');
    expect(s.albums[RG_SINGLE]).toMatchObject({ state: 'partial', trackFiles: 1, tracks: 3 });
  });

  it('reports an absent artist', async () => {
    expect(await getArtistRequestStatus(MBID)).toMatchObject({ inLidarr: false, albums: {} });
  });

  it('albumState: monitored album but unmonitored artist is not wanted', () => {
    expect(albumState(album({ monitored: true }), false)).toBe('not_monitored');
  });
});
