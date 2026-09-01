/**
 * Playlist → Navidrome mirror
 *
 * Basic (non-smart) playlists are edited in AIDJ's own DB. Historically those
 * edits never reached Navidrome, so a "custom playlist" only ever existed
 * locally (navidromeId = null) and never showed up as a real Navidrome playlist
 * or survived a sync. These helpers mirror local playlist mutations to Navidrome
 * using the user's own Subsonic creds (the same context sync uses).
 *
 * Philosophy: the LOCAL write is the source of truth for the request's success.
 * Mirroring is BEST-EFFORT — a Navidrome failure is logged but never fails the
 * user's edit. Anything that doesn't get a navidromeId here is picked up later by
 * `ensurePlaylistOnNavidrome` (lazy, on the next edit) or the back-fill script,
 * so local-only playlists heal forward rather than getting stuck.
 *
 * Smart playlists and the canonical Liked Songs list are intentionally excluded
 * (they are managed by their own code paths / are a mirror of stars).
 */
import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { userPlaylists, playlistSongs } from '../db/schema/playlists.schema';
import {
  createPlaylist,
  addSongsToPlaylist,
  getPlaylist,
  getPlaylists,
  removeSongsFromPlaylistByIndex,
} from './navidrome';
import { getNavidromeUserCreds, type SubsonicCreds } from './navidrome-users';
import { hasDeletedFromNavidromeMarker } from './playlist-deleted-marker';

type PlaylistRow = typeof userPlaylists.$inferSelect;

/**
 * Basic playlists only. Skip smart playlists (their own path) and the canonical
 * Liked Songs list (a mirror of Navidrome stars — intentionally navidromeId=null
 * and must never be pushed as a standalone Navidrome playlist).
 *
 * The canonical-liked check uses the explicit `isLikedSongs` flag, NOT a name
 * match: a name fallback (e.g. /liked/i) would misclassify ordinary user
 * playlists like "Songs I Liked in 2020" and silently never mirror them.
 */
function isMirrorable(pl: PlaylistRow): boolean {
  if (pl.smartPlaylistCriteria) return false;
  if (pl.isLikedSongs) return false;
  return true;
}

/**
 * Serializes `ensurePlaylistOnNavidrome` calls per playlist within this process.
 * Two concurrent edits to a still-local-only playlist would otherwise each run
 * the create path and produce a duplicate Navidrome playlist with the same name.
 *
 * NOTE (multi-instance deploys): this map is in-memory and per process, so it
 * only dedups within one instance. The `findRemotePlaylistIdByName` adopt guard
 * below narrows the cross-process window but does not close it — two instances
 * can both read "no remote playlist" before either `createPlaylist` returns and
 * still produce a duplicate (TOCTOU). Safe while we run a single instance; if we
 * ever scale out, move this serialization to a shared lock (e.g. a Postgres
 * advisory lock keyed on playlistId) or a unique constraint on the remote side.
 */
const ensureInFlight = new Map<string, Promise<string | null>>();

/** Find an existing Navidrome playlist id with this exact name, or null. */
async function findRemotePlaylistIdByName(
  name: string,
  creds: SubsonicCreds,
): Promise<string | null> {
  const remote = await getPlaylists(creds);
  return remote.find((p) => p.name === name)?.id ?? null;
}

async function orderedSongIds(playlistId: string): Promise<string[]> {
  const rows = await db
    .select({ songId: playlistSongs.songId })
    .from(playlistSongs)
    .where(eq(playlistSongs.playlistId, playlistId))
    .orderBy(asc(playlistSongs.position));
  return rows.map((r) => r.songId);
}

async function resolveCreds(
  userId: string,
  creds?: SubsonicCreds | null,
): Promise<SubsonicCreds | null> {
  return creds ?? (await getNavidromeUserCreds(userId));
}

/**
 * Ensure a local basic playlist exists on Navidrome. If it has no navidromeId
 * yet, create it there with its current songs (in local order) and persist the
 * returned id back onto the row. Returns the navidromeId, or null if it could
 * not be created (no creds, smart playlist, deliberately deleted, or a Navidrome
 * error). Never throws.
 *
 * Guards:
 *  - Deleted playlists are NOT resurrected. A row soft-deleted by sync (navidromeId
 *    nulled + "[Deleted from Navidrome]" marker) is left alone — healing it forward
 *    would recreate a list the user intentionally deleted (PR #175 / #160).
 *  - Duplicates are avoided. Before creating, we adopt any existing same-name
 *    Navidrome playlist (the unique-name dedup that #127/#163 enforce in sync),
 *    and concurrent calls for one playlist are serialized so they can't both create.
 */
export async function ensurePlaylistOnNavidrome(
  playlistId: string,
  userId: string,
  creds?: SubsonicCreds | null,
): Promise<string | null> {
  const inFlight = ensureInFlight.get(playlistId);
  if (inFlight) return inFlight;

  const run = ensurePlaylistOnNavidromeInner(playlistId, userId, creds).finally(() => {
    ensureInFlight.delete(playlistId);
  });
  ensureInFlight.set(playlistId, run);
  return run;
}

async function ensurePlaylistOnNavidromeInner(
  playlistId: string,
  userId: string,
  creds?: SubsonicCreds | null,
): Promise<string | null> {
  try {
    const pl = await db
      .select()
      .from(userPlaylists)
      .where(eq(userPlaylists.id, playlistId))
      .limit(1)
      .then((r) => r[0]);
    if (!pl || !isMirrorable(pl)) return null;
    if (pl.navidromeId) return pl.navidromeId;

    // Do not resurrect a deliberately-deleted playlist. Sync soft-deletes such
    // rows (navidromeId=null + marker); both a deleted list and a never-synced
    // local-only list have navidromeId=null, so the marker is the only signal.
    if (hasDeletedFromNavidromeMarker(pl.description)) {
      console.log(`[playlist-mirror] "${pl.name}" was deleted on Navidrome; not resurrecting`);
      return null;
    }

    const c = await resolveCreds(userId, creds);
    if (!c) {
      console.warn(`[playlist-mirror] no Navidrome creds for user ${userId}; leaving "${pl.name}" local-only (will back-fill later)`);
      return null;
    }

    const songIds = await orderedSongIds(playlistId);

    // Dedup: adopt an existing same-name Navidrome playlist rather than creating
    // a second one. Push only the local songs it is missing (Subsonic appends
    // songIdToAdd unconditionally, so blindly re-adding would duplicate entries).
    let navidromeId = await findRemotePlaylistIdByName(pl.name, c);
    if (navidromeId) {
      if (songIds.length) {
        const remote = await getPlaylist(navidromeId, c);
        const present = new Set((remote.entry ?? []).map((s) => s.id));
        const missing = songIds.filter((id) => !present.has(id));
        if (missing.length) await addSongsToPlaylist(navidromeId, missing, c);
      }
      console.log(`🔗 [playlist-mirror] adopted existing Navidrome playlist "${pl.name}" (${navidromeId})`);
    } else {
      const created = await createPlaylist(pl.name, songIds.length ? songIds : undefined, c);
      navidromeId = created.id;
      console.log(`✅ [playlist-mirror] created "${pl.name}" on Navidrome (${navidromeId}) with ${songIds.length} songs`);
    }

    await db
      .update(userPlaylists)
      .set({ navidromeId, lastSynced: new Date(), updatedAt: new Date() })
      .where(eq(userPlaylists.id, playlistId));

    return navidromeId;
  } catch (err) {
    console.warn(`[playlist-mirror] ensurePlaylistOnNavidrome failed for ${playlistId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Mirror a single song ADD to Navidrome. Back-fills the playlist first if it has
 * no navidromeId yet (the create includes the freshly-added song, so we're done).
 * Best-effort; never throws.
 */
export async function mirrorAddSong(
  playlistId: string,
  userId: string,
  songId: string,
  creds?: SubsonicCreds | null,
): Promise<void> {
  try {
    const pl = await db
      .select()
      .from(userPlaylists)
      .where(eq(userPlaylists.id, playlistId))
      .limit(1)
      .then((r) => r[0]);
    if (!pl || !isMirrorable(pl)) return;

    const c = await resolveCreds(userId, creds);
    if (!c) return;

    if (!pl.navidromeId) {
      // Back-fill: createPlaylist uses the full current song list, which already
      // includes the song we just inserted locally — nothing more to add.
      await ensurePlaylistOnNavidrome(playlistId, userId, c);
      return;
    }

    await addSongsToPlaylist(pl.navidromeId, [songId], c);
  } catch (err) {
    console.warn(`[playlist-mirror] mirrorAddSong failed for ${playlistId}/${songId}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Mirror a single song REMOVE to Navidrome. Resolves the song's current index in
 * the Navidrome playlist (order can differ from local) and removes by index.
 * A song that isn't on the server is already consistent — treated as success.
 * Best-effort; never throws.
 */
export async function mirrorRemoveSong(
  navidromeId: string,
  songId: string,
  creds: SubsonicCreds,
): Promise<void> {
  try {
    const remote = await getPlaylist(navidromeId, creds);
    // Subsonic omits `entry` for an empty playlist (the type declares it
    // non-optional but the wire format leaves it out), so default to [].
    const indices = (remote.entry ?? [])
      .map((s, i) => (s.id === songId ? i : -1))
      .filter((i) => i >= 0);
    if (indices.length === 0) return; // not on server = already consistent
    await removeSongsFromPlaylistByIndex(navidromeId, indices, creds);
  } catch (err) {
    console.warn(`[playlist-mirror] mirrorRemoveSong failed for ${navidromeId}/${songId}:`, err instanceof Error ? err.message : err);
  }
}
