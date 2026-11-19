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
 *  - Verify every write by re-reading it. Lidarr's post-add actions (~1-3 s after an add) and
 *    RefreshArtist both save a stale copy of a just-added artist, which silently resets
 *    monitored=false and un-monitors every album. A single PUT "succeeds" and is then undone,
 *    which is exactly the #435 symptom (success shown, nothing downloads).
 *  - Never lower an artist's monitorNewItems ('all' stays 'all').
 *  - Lidarr files a release only under its FIRST credited artist. A collab led by someone else
 *    (RLGN's "SHEEPSTEP" is Ilya Gadaev's) never appears under the artist you searched, so before
 *    touching any profile we ask Lidarr's metadata server who owns the release, and get it under
 *    that lead artist instead (added with nothing else monitored).
 *  - Singles/EPs are invisible under the default "Standard" metadata profile
 *    (studio albums only). When someone asks for one, only THAT artist moves to a
 *    widened copy of its profile ("<name> + Singles/EPs"), then Lidarr refreshes it.
 *    The default profile is never touched: it would pull singles for every artist.
 */
import { ServiceError } from '../utils';
import {
  LIDARR_REQUEST_TIMEOUT_MS,
  addArtist,
  createMetadataProfile,
  findAlbumByForeignId,
  findArtistByMbid,
  getArtistRecord,
  getMetadataProfiles,
  listArtistAlbums,
  lookupArtistByMbid,
  lookupReleaseOwner,
  refreshArtist,
  searchForAlbum,
  setAlbumsMonitored,
  updateArtist,
  type LidarrAlbumRecord,
  type LidarrArtistRecord,
  type LidarrMetadataProfile,
  type ReleaseOwnerLookup,
} from './lidarr';

export type RequestMode = 'artist' | 'release' | 'song';

export type RequestOutcome =
  | 'monitored'          // we just set it to download
  | 'already_monitored'  // it was already wanted
  | 'in_library'         // Lidarr already has every track
  | 'pending'            // Lidarr is still loading the release, or its metadata server didn't answer; ask again shortly
  | 'unavailable'        // Lidarr's metadata server answered: it can't get this release (don't recheck)
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
  /** This (searched) artist's monitored flag after the request, for the metadata cache. */
  artistMonitored?: boolean;
  /** Set when Lidarr files the release under another, lead artist (a collab). */
  filedUnder?: { mbid: string; artistName: string; lidarrArtistId: number };
}

export type AlbumState = 'in_library' | 'partial' | 'wanted' | 'not_monitored';

export interface ArtistRequestStatus {
  inLidarr: boolean;
  lidarrArtistId?: number;
  artistMonitored: boolean;
  /** monitorNewItems is 'new' or 'all' and the artist is monitored. */
  followingNewReleases: boolean;
  /** Keyed by MusicBrainz release-group id. Only albums Lidarr knows about. */
  albums: Record<string, AlbumStatus>;
}

export interface AlbumStatus {
  state: AlbumState;
  title: string;
  trackFiles: number;
  tracks: number;
  /** The lead artist Lidarr files a collab under, when it isn't the artist on the card. */
  filedUnder?: string;
}

// Lidarr's primary album type ids (same in every install).
const PRIMARY_TYPE_IDS: Record<string, number> = { album: 0, ep: 1, single: 2, broadcast: 3, other: 4 };
const WIDEN_TYPES = ['album', 'ep', 'single'];

let sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
/** Tests swap the sleeper so polling doesn't wait. */
export function __setSleepForTests(fn: (ms: number) => Promise<void>) {
  sleep = fn;
}

const SETTLE_MS = 800;       // existing artist: let a concurrent refresh finish before re-reading
const SETTLE_NEW_MS = 1500;  // just added: Lidarr's post-add actions are still to come
const VERIFY_ATTEMPTS = 4;
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

const isTimeout = (err: unknown) => err instanceof ServiceError && err.code === 'LIDARR_TIMEOUT_ERROR';

/** Reads are idempotent: retry once when Lidarr stalls (it can for seconds right after an add). */
async function retryRead<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTimeout(err)) throw err;
    console.warn('[lidarr-request] Lidarr read timed out, retrying once');
    return fn();
  }
}

type ArtistChanges = Partial<Pick<LidarrArtistRecord, 'monitored' | 'monitorNewItems' | 'metadataProfileId'>>;

/**
 * PUT the changes, wait, re-read, and repeat until Lidarr is actually holding them.
 * Each retry PUTs the freshly read copy, never a stale one.
 */
async function applyArtistChanges(artist: LidarrArtistRecord, changes: ArtistChanges, settleMs: number): Promise<LidarrArtistRecord> {
  let current = artist;
  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++) {
    await updateArtist(current, changes);
    await sleep(settleMs);
    current = await retryRead(() => getArtistRecord(artist.id));
    if ((Object.keys(changes) as Array<keyof ArtistChanges>).every(k => current[k] === changes[k])) return current;
    console.warn(`[lidarr-request] "${artist.artistName}": Lidarr reverted ${Object.keys(changes).join('/')} (attempt ${attempt}/${VERIFY_ATTEMPTS})`);
  }
  throw new ServiceError('LIDARR_NOT_APPLIED', `Lidarr kept reverting the settings for ${artist.artistName}`);
}

/** Monitor one album and confirm it stayed monitored (the post-add actions un-monitor everything). */
async function monitorAlbumVerified(artistId: number, albumId: number, settleMs: number): Promise<LidarrAlbumRecord> {
  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++) {
    await setAlbumsMonitored([albumId], true);
    await sleep(settleMs);
    const album = (await retryRead(() => listArtistAlbums(artistId))).find(a => a.id === albumId);
    if (album?.monitored) return album;
    console.warn(`[lidarr-request] album ${albumId}: Lidarr reverted monitored (attempt ${attempt}/${VERIFY_ATTEMPTS})`);
  }
  throw new ServiceError('LIDARR_NOT_APPLIED', 'Lidarr kept reverting the album to unmonitored');
}

/** Find (or add) the artist in Lidarr. Adds it monitored with nothing else monitored. */
async function ensureArtist(mbid: string, artistName: string): Promise<{ artist: LidarrArtistRecord; added: boolean } | null> {
  const existing = await retryRead(() => findArtistByMbid(mbid));
  if (existing) return { artist: existing, added: false };

  const lookedUp = await lookupArtistByMbid(mbid);
  if (!lookedUp) return null;
  console.log(`[lidarr-request] adding "${artistName}" (${mbid}) to Lidarr`);
  const created = await addArtist(lookedUp, { monitorAll: false, timeoutMs: LIDARR_REQUEST_TIMEOUT_MS });

  // Use the record the add returned and re-read it by id. Listing the whole library right
  // after an add is what timed out on prod (a 10 MB read while Lidarr was refreshing).
  let id = created?.id;
  for (let i = 0; id === undefined && i < 3; i++) {
    id = (await retryRead(() => findArtistByMbid(mbid)))?.id;
    if (id === undefined) await sleep(POLL_INTERVAL_MS);
  }
  if (id === undefined) return null;
  return { artist: await retryRead(() => getArtistRecord(id)), added: true };
}

async function pollForAlbum(artistId: number, releaseGroupId: string, attempts: number): Promise<LidarrAlbumRecord | null> {
  for (let i = 0; i < attempts; i++) {
    await sleep(POLL_INTERVAL_MS);
    const album = (await retryRead(() => listArtistAlbums(artistId))).find(a => a.foreignAlbumId === releaseGroupId);
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
async function widenProfileFor(artist: LidarrArtistRecord, releaseType: string, settleMs: number): Promise<boolean> {
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

  await applyArtistChanges(artist, { metadataProfileId: widened.id }, settleMs);
  console.log(`[lidarr-request] "${artist.artistName}" → metadata profile "${widenedName}"`);
  return true;
}

const settleFor = (justAdded: boolean) => (justAdded ? SETTLE_NEW_MS : SETTLE_MS);

/** Secondary types (Live, Compilation, Mixtape/Street…) the artist's current profile filters out. */
async function blockedSecondaryTypes(holderId: number, secondaryTypes: string[]): Promise<string[]> {
  if (secondaryTypes.length === 0) return [];
  const [profiles, holder] = await Promise.all([getMetadataProfiles(), retryRead(() => getArtistRecord(holderId))]);
  const profile = profiles.find(p => p.id === holder.metadataProfileId);
  if (!profile) return [];
  const allowed = new Set(profile.secondaryAlbumTypes.filter(t => t.allowed).map(t => t.albumType.name.toLowerCase()));
  return secondaryTypes.filter(t => !allowed.has(t.toLowerCase()));
}

/**
 * The release belongs to `holder` but isn't listed: widen the holder's profile if its type is
 * hidden, refresh, and poll. A recheck refreshes only if the profile had to change (a refresh
 * already ran otherwise).
 */
async function revealAlbum(
  holder: LidarrArtistRecord,
  releaseGroupId: string,
  albumType: string,
  recheck: boolean,
  settleMs: number,
): Promise<LidarrAlbumRecord | null> {
  const latest = await retryRead(() => getArtistRecord(holder.id));
  const widened = await widenProfileFor(latest, albumType, settleMs);
  if (recheck && !widened) return pollForAlbum(holder.id, releaseGroupId, 1);
  await refreshArtist(holder.id);
  return pollForAlbum(holder.id, releaseGroupId, POLL_AFTER_REFRESH);
}

/** Monitor an album that is listed under `holder` (this artist, or the collab's lead), verified. */
async function monitorListedAlbum(
  holder: LidarrArtistRecord,
  album: LidarrAlbumRecord,
  settleMs: number,
  result: Omit<RequestResult, 'outcome' | 'message'>,
  lead: { name: string; added: boolean } | null,
): Promise<RequestResult> {
  const fresh = await retryRead(() => getArtistRecord(holder.id));
  const state = albumState(album, fresh.monitored);
  const t = `"${album.title}"`;
  const under = lead ? ` (filed under ${lead.name})` : '';
  const done = { ...result, lidarrAlbumId: album.id, releaseTitle: album.title };

  if (state === 'in_library') return { ...done, outcome: 'in_library', message: `${t}${under} is already in the library.` };
  if (state === 'wanted' || state === 'partial') {
    return { ...done, outcome: 'already_monitored', message: `${t}${under} is already waiting to download.` };
  }

  if (!fresh.monitored) await applyArtistChanges(fresh, { monitored: true }, settleMs);
  await monitorAlbumVerified(holder.id, album.id, settleMs);
  await searchForAlbum(album.id);
  const message = !lead
    ? `${t} is monitored and waiting for download.`
    : lead.added
      ? `${t} is filed under ${lead.name} in Lidarr. Added ${lead.name} (nothing else) and queued it.`
      : `${t} is filed under ${lead.name} in Lidarr. Queued it there.`;
  return {
    ...done,
    // the searched artist only turns monitored when the album is its own
    ...(lead ? {} : { artistMonitored: true }),
    outcome: 'monitored',
    message,
  };
}

/** A collab Lidarr files under another artist: get it there, adding the lead with nothing else monitored. */
async function requestUnderLead(
  artist: LidarrArtistRecord,
  owner: Extract<ReleaseOwnerLookup, { kind: 'found' }>,
  input: RequestInput & { releaseGroupId: string },
): Promise<RequestResult> {
  const base = { lidarrArtistId: artist.id, releaseGroupId: input.releaseGroupId, artistMonitored: artist.monitored };
  console.log(`[lidarr-request] "${owner.title}" is filed under "${owner.artistName}" (${owner.artistMbid}), not "${artist.artistName}"`);

  const lead = await ensureArtist(owner.artistMbid, owner.artistName);
  if (!lead) {
    return {
      ...base,
      outcome: 'not_found',
      releaseTitle: owner.title,
      message: `"${owner.title}" is filed under ${owner.artistName} in Lidarr, but Lidarr couldn't add ${owner.artistName}.`,
    };
  }
  const leadName = lead.artist.artistName;
  const leadBase = { ...base, filedUnder: { mbid: owner.artistMbid, artistName: leadName, lidarrArtistId: lead.artist.id } };
  const settle = settleFor(lead.added);

  let album = (await retryRead(() => listArtistAlbums(lead.artist.id))).find(a => a.foreignAlbumId === input.releaseGroupId) ?? null;
  if (!album && lead.added) album = await pollForAlbum(lead.artist.id, input.releaseGroupId, POLL_NEW_ARTIST);
  if (!album) {
    album = await revealAlbum(lead.artist, input.releaseGroupId, owner.albumType ?? input.releaseType ?? 'album', !!input.recheck, settle);
  }
  if (!album) {
    const blocked = await blockedSecondaryTypes(lead.artist.id, owner.secondaryTypes);
    if (blocked.length) {
      return {
        ...leadBase,
        outcome: 'unavailable',
        releaseTitle: owner.title,
        message: `"${owner.title}" is filed under ${leadName} and is a ${blocked.join(' / ')} release, which their Lidarr profile skips.`,
      };
    }
    return {
      ...leadBase,
      outcome: 'pending',
      releaseTitle: owner.title,
      message: `"${owner.title}" is filed under ${leadName} in Lidarr. Still loading their releases; checking again shortly.`,
    };
  }
  return monitorListedAlbum(lead.artist, album, settle, leadBase, { name: leadName, added: lead.added });
}

async function requestRelease(
  artist: LidarrArtistRecord,
  added: boolean,
  input: RequestInput & { releaseGroupId: string },
): Promise<RequestResult> {
  const base = { lidarrArtistId: artist.id, releaseGroupId: input.releaseGroupId, artistMonitored: artist.monitored };
  const title = input.releaseTitle ?? 'this release';
  const settle = settleFor(added);

  let album = (await retryRead(() => listArtistAlbums(artist.id))).find(a => a.foreignAlbumId === input.releaseGroupId) ?? null;
  if (album) return monitorListedAlbum(artist, album, settle, base, null);

  // Not listed under this artist. Before touching any profile, ask who the release belongs to.
  const owner = await lookupReleaseOwner(input.releaseGroupId);
  if (owner.kind === 'none') {
    return {
      ...base,
      outcome: 'unavailable',
      releaseTitle: input.releaseTitle,
      message: `Lidarr's database doesn't have "${title}", so it can't download it.`,
    };
  }
  if (owner.kind === 'found' && owner.artistMbid !== input.mbid) {
    return requestUnderLead(artist, owner, input);
  }

  // It's this artist's (or the metadata server didn't answer and we can't tell yet).
  if (added) album = await pollForAlbum(artist.id, input.releaseGroupId, POLL_NEW_ARTIST);
  if (!album && owner.kind === 'unknown') {
    console.warn(`[lidarr-request] owner lookup failed for "${title}" (${input.releaseGroupId}): ${owner.reason}`);
    return {
      ...base,
      outcome: 'pending',
      releaseTitle: input.releaseTitle,
      message: `Lidarr's metadata server isn't answering about "${title}" right now. Checking again shortly.`,
    };
  }
  if (!album && owner.kind === 'found') {
    // Hidden by the metadata profile (singles/EPs), or Lidarr hasn't refreshed yet.
    album = await revealAlbum(artist, input.releaseGroupId, owner.albumType ?? input.releaseType ?? 'album', !!input.recheck, settle);
    if (!album) {
      const blocked = await blockedSecondaryTypes(artist.id, owner.secondaryTypes);
      if (blocked.length) {
        return {
          ...base,
          outcome: 'unavailable',
          releaseTitle: owner.title,
          message: `"${owner.title}" is a ${blocked.join(' / ')} release, which ${artist.artistName}'s Lidarr profile skips.`,
        };
      }
    }
  }
  if (!album) {
    return {
      ...base,
      outcome: 'pending',
      releaseTitle: input.releaseTitle,
      message: `Lidarr is still loading ${input.artistName}'s releases. "${title}" will be checked again shortly.`,
    };
  }
  return monitorListedAlbum(artist, album, settle, base, null);
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
        artistMonitored: true,
        message: `Already following ${artist.artistName}. New releases download automatically.`,
      };
    }
    await applyArtistChanges(
      artist,
      { monitored: true, monitorNewItems: artist.monitorNewItems === 'all' ? 'all' : 'new' },
      added ? SETTLE_NEW_MS : SETTLE_MS,
    );
    return {
      outcome: 'monitored',
      lidarrArtistId: artist.id,
      artistMonitored: true,
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

const MAX_FILED_ELSEWHERE = 25;

/**
 * State of releases requested from this artist's card that Lidarr files under another (lead)
 * artist: GET /album?foreignAlbumId= finds them wherever they live (verified on prod 2026-11-19).
 */
export async function getAlbumsFiledElsewhere(releaseGroupIds: string[]): Promise<Record<string, AlbumStatus>> {
  const found = await Promise.all(
    releaseGroupIds.slice(0, MAX_FILED_ELSEWHERE).map(rg => findAlbumByForeignId(rg).catch(() => null)),
  );
  const albums: Record<string, AlbumStatus> = {};
  for (const album of found) {
    if (!album) continue;
    albums[album.foreignAlbumId] = {
      state: albumState(album, album.artist?.monitored ?? false),
      title: album.title,
      trackFiles: album.statistics?.trackFileCount ?? 0,
      tracks: album.statistics?.totalTrackCount ?? album.statistics?.trackCount ?? 0,
      filedUnder: album.artist?.artistName,
    };
  }
  return albums;
}
