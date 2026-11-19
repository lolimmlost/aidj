import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceError } from '../../utils';
import type { LidarrAlbumRecord, LidarrArtistRecord, LidarrMetadataProfile, ReleaseOwnerLookup } from '../lidarr';

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
  /** Lidarr's post-add actions undoing our write: the next N artist / album writes are reverted. */
  clobberArtist: 0,
  clobberAlbum: 0,
  /** The next N artist reads by MBID stall (LIDARR_TIMEOUT_ERROR). */
  timeoutNext: 0,
  /** Artists not in Lidarr yet (by MBID) and their releases, as the metadata server knows them. */
  catalog: {} as Record<string, { artist: LidarrArtistRecord; albums: LidarrAlbumRecord[] }>,
  /** Metadata-server answers that override the ones derived from the data above. */
  owners: {} as Record<string, ReleaseOwnerLookup>,
  nextId: 900,
}));

vi.mock('../lidarr', () => ({
  LIDARR_REQUEST_TIMEOUT_MS: 30000,
  findArtistByMbid: vi.fn(async (mbid: string) => {
    if (lidarr.timeoutNext > 0) {
      lidarr.timeoutNext--;
      throw new ServiceError('LIDARR_TIMEOUT_ERROR', 'API request timed out (5000ms limit)');
    }
    return lidarr.artists.find(a => a.foreignArtistId === mbid) ?? null;
  }),
  getArtistRecord: vi.fn(async (id: number) => {
    const found = lidarr.artists.find(a => a.id === id);
    if (!found) throw new Error(`no artist ${id}`);
    return { ...found };
  }),
  lookupArtistByMbid: vi.fn(async (mbid: string) =>
    lidarr.catalog[mbid]?.artist ?? (lidarr.lookup?.foreignArtistId === mbid ? lidarr.lookup : null)),
  addArtist: vi.fn(async (a: LidarrArtistRecord) => {
    const id = lidarr.nextId++;
    const created = { ...a, id, monitored: true, monitorNewItems: 'none' as const, metadataProfileId: 1, qualityProfileId: 1 };
    lidarr.artists.push(created);
    // the refresh loads the catalog's releases; "Standard" hides singles/EPs until widened + refreshed
    for (const al of lidarr.catalog[a.foreignArtistId]?.albums ?? []) {
      const placed = { ...al, artistId: id };
      (al.albumType === 'EP' || al.albumType === 'Single' ? lidarr.hiddenUntilRefresh : lidarr.albums).push(placed);
    }
    return { ...created };
  }),
  lookupReleaseOwner: vi.fn(async (rg: string): Promise<ReleaseOwnerLookup> => {
    if (lidarr.owners[rg]) return lidarr.owners[rg];
    const placed = [...lidarr.albums, ...lidarr.hiddenUntilRefresh].find(a => a.foreignAlbumId === rg);
    const holder = placed && lidarr.artists.find(a => a.id === placed.artistId);
    if (placed && holder) {
      return { kind: 'found', title: placed.title, albumType: placed.albumType, secondaryTypes: placed.secondaryTypes ?? [], artistMbid: holder.foreignArtistId, artistName: holder.artistName };
    }
    for (const [mbid, entry] of Object.entries(lidarr.catalog)) {
      const al = entry.albums.find(a => a.foreignAlbumId === rg);
      if (al) return { kind: 'found', title: al.title, albumType: al.albumType, secondaryTypes: al.secondaryTypes ?? [], artistMbid: mbid, artistName: entry.artist.artistName };
    }
    return { kind: 'none' };
  }),
  findAlbumByForeignId: vi.fn(async (rg: string) => {
    const al = lidarr.albums.find(a => a.foreignAlbumId === rg);
    if (!al) return null;
    const holder = lidarr.artists.find(a => a.id === al.artistId);
    return { ...al, artist: holder && { artistName: holder.artistName, foreignArtistId: holder.foreignArtistId, monitored: holder.monitored } };
  }),
  updateArtist: vi.fn(async (artist: LidarrArtistRecord, changes: Partial<LidarrArtistRecord>) => {
    const i = lidarr.artists.findIndex(a => a.id === artist.id);
    lidarr.artists[i] = { ...lidarr.artists[i], ...changes };
    if (lidarr.clobberArtist > 0) {
      lidarr.clobberArtist--;
      lidarr.artists[i] = { ...lidarr.artists[i], monitored: false };
    }
    return lidarr.artists[i];
  }),
  listArtistAlbums: vi.fn(async (id: number) => lidarr.albums.filter(a => a.artistId === id)),
  setAlbumsMonitored: vi.fn(async (ids: number[], monitored: boolean) => {
    lidarr.monitorCalls.push({ ids, monitored });
    for (const a of lidarr.albums) if (ids.includes(a.id)) a.monitored = monitored;
    if (lidarr.clobberAlbum > 0) {
      lidarr.clobberAlbum--;
      for (const a of lidarr.albums) if (ids.includes(a.id)) a.monitored = false;
    }
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
    lidarr.hiddenUntilRefresh = lidarr.hiddenUntilRefresh.filter(a => a.artistId !== id);
  }),
}));

import {
  requestFromLidarr,
  getArtistRequestStatus,
  getAlbumsFiledElsewhere,
  resolveSongRelease,
  albumState,
  __setSleepForTests,
} from '../lidarr-request';
import * as api from '../lidarr';

const MBID = '780269c0-0000-4000-8000-000000000000';
const RG_ALBUM = '2494f053-262a-4a4e-9cae-8e87272cef6e';
const RG_SINGLE = '9601211c-83e5-4ec8-8816-8c3bc4a6a592';
const LEAD_MBID = '0ee4c949-13ea-4f04-9975-7b5cec7b81d4';
const RG_COLLAB = 'ebf58806-a454-4a55-9e1b-850e3deb676b';

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
  lidarr.clobberArtist = 0;
  lidarr.clobberAlbum = 0;
  lidarr.timeoutNext = 0;
  lidarr.catalog = {};
  lidarr.owners = {};
  lidarr.nextId = 900;
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
    // the metadata server knows it as this artist's single; Lidarr just hasn't listed it yet
    lidarr.owners[RG_SINGLE] = { kind: 'found', title: 'STAR', albumType: 'Single', secondaryTypes: [], artistMbid: MBID, artistName: '千葉雄喜' };
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

describe('verified writes and Lidarr stalls (#435)', () => {
  it('re-applies a follow that Lidarr reverts right after an add (post-add actions)', async () => {
    lidarr.lookup = artist();
    lidarr.clobberArtist = 1; // the first PUT is undone, like prod's RLGN
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'RLGN', mode: 'artist' });
    expect(r.outcome).toBe('monitored');
    expect(api.updateArtist).toHaveBeenCalledTimes(2);
    expect(lidarr.artists[0]).toMatchObject({ monitored: true, monitorNewItems: 'new' });
  });

  it("does not list the whole library after an add (that read timed out on prod)", async () => {
    lidarr.lookup = artist();
    await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'artist' });
    expect(api.findArtistByMbid).toHaveBeenCalledTimes(1); // only the initial miss
    expect(api.getArtistRecord).toHaveBeenCalled();
  });

  it('gives up with LIDARR_NOT_APPLIED rather than report a follow that did not stick', async () => {
    lidarr.artists = [artist()];
    lidarr.clobberArtist = 99;
    await expect(requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'artist' }))
      .rejects.toMatchObject({ code: 'LIDARR_NOT_APPLIED' });
    expect(api.updateArtist).toHaveBeenCalledTimes(4);
  });

  it('re-monitors an album that Lidarr un-monitors after the first write', async () => {
    lidarr.artists = [artist({ monitored: true })];
    lidarr.albums = [album()];
    lidarr.clobberAlbum = 1;
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_ALBUM });
    expect(r.outcome).toBe('monitored');
    expect(lidarr.monitorCalls).toHaveLength(2);
    expect(lidarr.albums[0].monitored).toBe(true);
    expect(lidarr.searched).toEqual([31631]);
  });

  it('retries a stalled read once', async () => {
    lidarr.artists = [artist()];
    lidarr.timeoutNext = 1;
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'artist' });
    expect(r.outcome).toBe('monitored');
    expect(api.findArtistByMbid).toHaveBeenCalledTimes(2);
  });

  it('surfaces a read that stalls twice as LIDARR_TIMEOUT_ERROR', async () => {
    lidarr.artists = [artist()];
    lidarr.timeoutNext = 2;
    await expect(requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'artist' }))
      .rejects.toMatchObject({ code: 'LIDARR_TIMEOUT_ERROR' });
  });
});

describe('collabs and releases Lidarr can\'t get (#436)', () => {
  const lead = (over: Partial<LidarrArtistRecord> = {}) =>
    artist({ id: 0, artistName: 'Ilya Gadaev', foreignArtistId: LEAD_MBID, ...over });

  it('gets a collab under its lead artist: adds the lead with nothing else monitored', async () => {
    lidarr.artists = [artist()];
    lidarr.catalog[LEAD_MBID] = {
      artist: lead(),
      albums: [
        album({ id: 777, title: 'SHEEPSTEP', foreignAlbumId: RG_COLLAB, albumType: 'EP' }),
        album({ id: 778, title: 'Lead Album', foreignAlbumId: 'lead-album', albumType: 'Album' }),
      ],
    };
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'RLGN', mode: 'release', releaseGroupId: RG_COLLAB, releaseTitle: 'SHEEPSTEP', releaseType: 'EP' });

    expect(r).toMatchObject({ outcome: 'monitored', lidarrArtistId: 2503, lidarrAlbumId: 777, artistMonitored: false, filedUnder: { mbid: LEAD_MBID, artistName: 'Ilya Gadaev' } });
    expect(r.message).toBe('"SHEEPSTEP" is filed under Ilya Gadaev in Lidarr. Added Ilya Gadaev (nothing else) and queued it.');
    const leadRec = lidarr.artists.find(a => a.foreignArtistId === LEAD_MBID)!;
    expect(leadRec).toMatchObject({ monitored: true, monitorNewItems: 'none' });
    expect(leadRec.metadataProfileId).toBe(lidarr.profiles.find(p => p.name === 'Standard + Singles/EPs')!.id);
    // the searched artist is untouched: no profile change, no refresh, still unmonitored
    expect(lidarr.artists.find(a => a.id === 2503)).toMatchObject({ metadataProfileId: 1, monitored: false });
    expect(lidarr.refreshed).toEqual([leadRec.id]);
    expect(lidarr.albums.filter(a => a.monitored).map(a => a.id)).toEqual([777]);
    expect(lidarr.searched).toEqual([777]);
  });

  it('queues a collab under a lead already in Lidarr without adding anyone', async () => {
    lidarr.artists = [artist(), lead({ id: 3000, monitored: true })];
    lidarr.albums = [album({ id: 555, title: 'PANITA', artistId: 3000, foreignAlbumId: RG_COLLAB, albumType: 'Single' })];
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'RLGN', mode: 'release', releaseGroupId: RG_COLLAB });
    expect(r).toMatchObject({ outcome: 'monitored', lidarrAlbumId: 555 });
    expect(r.message).toBe('"PANITA" is filed under Ilya Gadaev in Lidarr. Queued it there.');
    expect(api.addArtist).not.toHaveBeenCalled();
    expect(api.createMetadataProfile).not.toHaveBeenCalled();
  });

  it("says unavailable, and widens nothing, when Lidarr's database has no such release", async () => {
    lidarr.artists = [artist()];
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_SINGLE, releaseTitle: 'Ghost', releaseType: 'Single' });
    expect(r.outcome).toBe('unavailable');
    expect(r.message).toBe(`Lidarr's database doesn't have "Ghost", so it can't download it.`);
    expect(api.createMetadataProfile).not.toHaveBeenCalled();
    expect(lidarr.refreshed).toEqual([]);
  });

  it('treats a failing metadata server as "try again", not "doesn\'t exist", and touches no profile', async () => {
    lidarr.artists = [artist()];
    lidarr.owners[RG_SINGLE] = { kind: 'unknown', reason: 'API fetch error after 0 retries: API request failed: 503 Service Unavailable' };
    const r = await requestFromLidarr({ mbid: MBID, artistName: 'x', mode: 'release', releaseGroupId: RG_SINGLE, releaseTitle: 'SHEEPSTEP', releaseType: 'EP' });
    expect(r).toMatchObject({ outcome: 'pending', releaseGroupId: RG_SINGLE });
    expect(api.createMetadataProfile).not.toHaveBeenCalled();
    expect(lidarr.refreshed).toEqual([]);
  });

  it('says unavailable when the release is a secondary type the profile skips', async () => {
    lidarr.artists = [artist()];
    lidarr.owners[RG_SINGLE] = { kind: 'found', title: 'Live at X', albumType: 'Album', secondaryTypes: ['Live'], artistMbid: MBID, artistName: '千葉雄喜' };
    const r = await requestFromLidarr({ mbid: MBID, artistName: '千葉雄喜', mode: 'release', releaseGroupId: RG_SINGLE });
    expect(r.outcome).toBe('unavailable');
    expect(r.message).toBe(`"Live at X" is a Live release, which 千葉雄喜's Lidarr profile skips.`);
  });

  it("reports a collab's state under its lead, with the lead's monitored flag", async () => {
    lidarr.artists = [lead({ id: 3000, monitored: true })];
    lidarr.albums = [album({ id: 555, title: 'PANITA', artistId: 3000, foreignAlbumId: RG_COLLAB, monitored: true })];
    expect(await getAlbumsFiledElsewhere([RG_COLLAB, 'not-in-lidarr'])).toEqual({
      [RG_COLLAB]: { state: 'wanted', title: 'PANITA', trackFiles: 0, tracks: 10, filedUnder: 'Ilya Gadaev' },
    });
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
