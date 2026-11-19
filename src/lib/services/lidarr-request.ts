/**
 * Request music for an artist the library doesn't have yet (#435, #436).
 *
 * The search page's MusicBrainz card used to call Aurral, which added the
 * artist to Lidarr with nothing monitored: nothing downloaded, yet the UI said
 * "Queued". This goes straight to Lidarr and reports what actually happened.
 *
 * Three modes:
 *  - artist  — follow the artist: monitored + monitorNewItems=new. Future releases
 *              download; nothing old does.
 *  - release — one MusicBrainz release group (album / EP / single). Lidarr's
 *              album.foreignAlbumId IS the release-group id, so the match is exact.
 *  - song    — a song title, resolved to a release group, then handled as release.
 *
 * Rules:
 *  - Never unmonitor anything. A second user's pick must not cancel the first's.
 *  - Never lower an artist's monitorNewItems ('all' stays 'all').
 *  - Singles/EPs are invisible under the default "Standard" metadata profile
 *    (studio albums only). When someone asks for one, only THAT artist moves to a
 *    widened copy of its profile ("<name> + Singles/EPs"), then Lidarr refreshes it.
 *    The default profile is never touched: it would pull singles for every artist.
 */
import {
  addArtist,
  createMetadataProfile,
  findArtistByMbid,
  getMetadataProfiles,
  listArtistAlbums,
  lookupArtistByMbid,
  refreshArtist,
  searchForAlbum,
  setAlbumsMonitored,
  updateArtist,
  type LidarrAlbumRecord,
  type LidarrArtistRecord,
  type LidarrMetadataProfile,
} from './lidarr';

export type RequestMode = 'artist' | 'release' | 'song';

export type RequestOutcome =
  | 'monitored'          // we just set it to download
  | 'already_monitored'  // it was already wanted
  | 'in_library'         // Lidarr already has every track
  | 'pending'            // Lidarr is still loading the release; ask again shortly
  | 'not_found';         // couldn't find the artist / release / song

export interface ReleaseGroupRef {
  id: string;
  title: string;
  primaryType?: string;
  firstReleaseDate?: string;
}

export interface RequestInput {
  mbid: string;
  artistName: string;
  mode: RequestMode;
  releaseGroupId?: string;
  /** Needed to widen the metadata profile for singles/EPs. */
  releaseType?: string;
  releaseTitle?: string;
  songTitle?: string;
  /** Release groups MusicBrainz lists for the artist (song mode matches against them). */
  releaseGroups?: ReleaseGroupRef[];
  /** A follow-up check after 'pending': look again, don't trigger another refresh. */
  recheck?: boolean;
}

export interface RequestResult {
  outcome: RequestOutcome;
  message: string;
  lidarrArtistId?: number;
  lidarrAlbumId?: number;
  releaseGroupId?: string;
  releaseTitle?: string;
}

export type AlbumState = 'in_library' | 'partial' | 'wanted' | 'not_monitored';

export interface ArtistRequestStatus {
  inLidarr: boolean;
  lidarrArtistId?: number;
  artistMonitored: boolean;
  /** monitorNewItems is 'new' or 'all' and the artist is monitored. */
  followingNewReleases: boolean;
  /** Keyed by MusicBrainz release-group id. Only albums Lidarr knows about. */
  albums: Record<string, { state: AlbumState; title: string; trackFiles: number; tracks: number }>;
}

// Lidarr's primary album type ids (same in every install).
const PRIMARY_TYPE_IDS: Record<string, number> = { album: 0, ep: 1, single: 2, broadcast: 3, other: 4 };
const WIDEN_TYPES = ['album', 'ep', 'single'];

let sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
/** Tests swap the sleeper so polling doesn't wait. */
export function __setSleepForTests(fn: (ms: number) => Promise<void>) {
  sleep = fn;
}

const POLL_INTERVAL_MS = 2000;
const POLL_NEW_ARTIST = 6;   // ~12 s for a freshly added artist's albums to appear
const POLL_AFTER_REFRESH = 6; // ~12 s after a RefreshArtist

export function albumState(album: LidarrAlbumRecord, artistMonitored: boolean): AlbumState {
  const files = album.statistics?.trackFileCount ?? 0;
  const total = album.statistics?.totalTrackCount ?? album.statistics?.trackCount ?? 0;
  if (total > 0 && files >= total) return 'in_library';
  if (files > 0) return 'partial';
  if (album.monitored && artistMonitored) return 'wanted';
  return 'not_monitored';
}

export function normalizeTitle(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s*[([](feat\.?|ft\.?|with)\s[^)\]]*[)\]]/g, '')
    .replace(/\s*[([][^)\]]*(remaster|deluxe|edition|version)[^)\]]*[)\]]/g, '')
    .replace(/[\s\p{P}]+/gu, ' ')
    .trim();
}

/** Find (or add) the artist in Lidarr. Adds it monitored with nothing else monitored. */
async function ensureArtist(mbid: string, artistName: string): Promise<{ artist: LidarrArtistRecord; added: boolean } | null> {
  const existing = await findArtistByMbid(mbid);
  if (existing) return { artist: existing, added: false };

  const lookedUp = await lookupArtistByMbid(mbid);
  if (!lookedUp) return null;
  console.log(`[lidarr-request] adding "${artistName}" (${mbid}) to Lidarr`);
  await addArtist(lookedUp, { monitorAll: false });

  for (let i = 0; i < 3; i++) {
    const added = await findArtistByMbid(mbid);
    if (added) return { artist: added, added: true };
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function pollForAlbum(artistId: number, releaseGroupId: string, attempts: number): Promise<LidarrAlbumRecord | null> {
  for (let i = 0; i < attempts; i++) {
    await sleep(POLL_INTERVAL_MS);
    const album = (await listArtistAlbums(artistId)).find(a => a.foreignAlbumId === releaseGroupId);
    if (album) return album;
  }
  return null;
}

function allowedPrimaryTypes(profile: LidarrMetadataProfile): Set<string> {
  return new Set(profile.primaryAlbumTypes.filter(t => t.allowed).map(t => t.albumType.name.toLowerCase()));
}

/**
 * Make sure the artist's metadata profile shows `releaseType`. Returns true if it
 * changed the artist's profile. Reuses "<profile> + Singles/EPs" if it exists.
 */
async function widenProfileFor(artist: LidarrArtistRecord, releaseType: string): Promise<boolean> {
  const type = releaseType.toLowerCase();
  if (!(type in PRIMARY_TYPE_IDS)) return false;

  const profiles = await getMetadataProfiles();
  const current = profiles.find(p => p.id === artist.metadataProfileId);
  if (!current) return false;
  if (allowedPrimaryTypes(current).has(type)) return false;

  const baseName = current.name.replace(/ \+ Singles\/EPs$/, '');
  const widenedName = `${baseName} + Singles/EPs`;
  let widened = profiles.find(p => p.name === widenedName);
  if (!widened) {
    const allow = new Set([...allowedPrimaryTypes(current), ...WIDEN_TYPES, type]);
    const { id: _id, ...rest } = current;
    widened = await createMetadataProfile({
      ...rest,
      name: widenedName,
      primaryAlbumTypes: current.primaryAlbumTypes.map(t => ({
        ...t,
        allowed: allow.has(t.albumType.name.toLowerCase()),
      })),
    });
    console.log(`[lidarr-request] created metadata profile "${widenedName}" (id ${widened.id})`);
  } else if (!allowedPrimaryTypes(widened).has(type)) {
    return false; // someone edited it by hand; don't fight them
  }

  await updateArtist(artist, { metadataProfileId: widened.id });
  console.log(`[lidarr-request] "${artist.artistName}" → metadata profile "${widenedName}"`);
  return true;
}

async function requestRelease(
  artist: LidarrArtistRecord,
  added: boolean,
  input: RequestInput & { releaseGroupId: string },
): Promise<RequestResult> {
  const base = { lidarrArtistId: artist.id, releaseGroupId: input.releaseGroupId };
  const title = input.releaseTitle ?? 'this release';

  let album = (await listArtistAlbums(artist.id)).find(a => a.foreignAlbumId === input.releaseGroupId) ?? null;
  if (!album && added) {
    album = await pollForAlbum(artist.id, input.releaseGroupId, POLL_NEW_ARTIST);
  }
  if (!album && !input.recheck) {
    // Hidden by the metadata profile (singles/EPs), or Lidarr hasn't refreshed yet.
    const latest = (await findArtistByMbid(input.mbid)) ?? artist;
    await widenProfileFor(latest, input.releaseType ?? 'album');
    await refreshArtist(artist.id);
    album = await pollForAlbum(artist.id, input.releaseGroupId, POLL_AFTER_REFRESH);
  }
  if (!album) {
    return {
      ...base,
      outcome: 'pending',
      releaseTitle: input.releaseTitle,
      message: `Lidarr is still loading ${input.artistName}'s releases. "${title}" will be checked again shortly.`,
    };
  }

  const fresh = (await findArtistByMbid(input.mbid)) ?? artist;
  const state = albumState(album, fresh.monitored);
  const result = { ...base, lidarrAlbumId: album.id, releaseTitle: album.title };

  if (state === 'in_library') {
    return { ...result, outcome: 'in_library', message: `"${album.title}" is already in the library.` };
  }
  if (state === 'wanted' || state === 'partial') {
    return { ...result, outcome: 'already_monitored', message: `"${album.title}" is already waiting to download.` };
  }

  if (!fresh.monitored) await updateArtist(fresh, { monitored: true });
  await setAlbumsMonitored([album.id], true);
  await searchForAlbum(album.id);
  return {
    ...result,
    outcome: 'monitored',
    message: `"${album.title}" is monitored and waiting for download.`,
  };
}

/** Resolve a song title to one of the artist's release groups. */
export async function resolveSongRelease(
  artistName: string,
  songTitle: string,
  releaseGroups: ReleaseGroupRef[],
  lookupAlbum: (artist: string, song: string) => Promise<string | null>,
): Promise<ReleaseGroupRef | null> {
  const byTitle = new Map<string, ReleaseGroupRef[]>();
  for (const rg of releaseGroups) {
    const key = normalizeTitle(rg.title);
    byTitle.set(key, [...(byTitle.get(key) ?? []), rg]);
  }
  // Prefer the earliest release with a given title (the original over reissues).
  const pick = (key: string) =>
    (byTitle.get(key) ?? []).slice().sort((a, b) => (a.firstReleaseDate ?? '9').localeCompare(b.firstReleaseDate ?? '9'))[0];

  const albumName = await lookupAlbum(artistName, songTitle);
  if (albumName) {
    const hit = pick(normalizeTitle(albumName));
    if (hit) return hit;
  }
  // A single is usually named after its song.
  return pick(normalizeTitle(songTitle)) ?? null;
}

export async function requestFromLidarr(
  input: RequestInput,
  deps: { lookupAlbum?: (artist: string, song: string) => Promise<string | null> } = {},
): Promise<RequestResult> {
  if (input.mode === 'song') {
    const song = input.songTitle?.trim();
    if (!song) return { outcome: 'not_found', message: 'Type a song title.' };
    const rg = await resolveSongRelease(
      input.artistName,
      song,
      input.releaseGroups ?? [],
      deps.lookupAlbum ?? (async () => null),
    );
    if (!rg) {
      return {
        outcome: 'not_found',
        message: `Couldn't tell which release has "${song}". Pick it from the list instead.`,
      };
    }
    return requestFromLidarr({
      ...input,
      mode: 'release',
      releaseGroupId: rg.id,
      releaseTitle: rg.title,
      releaseType: rg.primaryType,
    });
  }

  const ensured = await ensureArtist(input.mbid, input.artistName);
  if (!ensured) {
    return { outcome: 'not_found', message: `Lidarr couldn't find ${input.artistName} on MusicBrainz.` };
  }
  const { artist, added } = ensured;

  if (input.mode === 'artist') {
    const following = artist.monitored && (artist.monitorNewItems === 'new' || artist.monitorNewItems === 'all');
    if (following) {
      return {
        outcome: 'already_monitored',
        lidarrArtistId: artist.id,
        message: `Already following ${artist.artistName}. New releases download automatically.`,
      };
    }
    await updateArtist(artist, {
      monitored: true,
      monitorNewItems: artist.monitorNewItems === 'all' ? 'all' : 'new',
    });
    return {
      outcome: 'monitored',
      lidarrArtistId: artist.id,
      message: `Following ${artist.artistName}. New releases will download. Pick a release to get older music.`,
    };
  }

  if (!input.releaseGroupId) {
    return { outcome: 'not_found', message: 'No release picked.' };
  }
  return requestRelease(artist, added, { ...input, releaseGroupId: input.releaseGroupId });
}

/** Live Lidarr state for the card: is the artist there, followed, and what's each release doing. */
export async function getArtistRequestStatus(mbid: string): Promise<ArtistRequestStatus> {
  const artist = await findArtistByMbid(mbid);
  if (!artist) return { inLidarr: false, artistMonitored: false, followingNewReleases: false, albums: {} };

  const albums: ArtistRequestStatus['albums'] = {};
  for (const album of await listArtistAlbums(artist.id)) {
    albums[album.foreignAlbumId] = {
      state: albumState(album, artist.monitored),
      title: album.title,
      trackFiles: album.statistics?.trackFileCount ?? 0,
      tracks: album.statistics?.totalTrackCount ?? album.statistics?.trackCount ?? 0,
    };
  }
  return {
    inLidarr: true,
    lidarrArtistId: artist.id,
    artistMonitored: artist.monitored,
    followingNewReleases: artist.monitored && (artist.monitorNewItems === 'new' || artist.monitorNewItems === 'all'),
    albums,
  };
}
