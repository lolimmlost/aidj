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
  removeSongsFromPlaylistByIndex,
} from './navidrome';
import { getNavidromeUserCreds, type SubsonicCreds } from './navidrome-users';
import { isCanonicalLikedPlaylist } from './liked-songs-sync';

type PlaylistRow = typeof userPlaylists.$inferSelect;

/**
 * Basic playlists only. Skip smart playlists (their own path) and the canonical
 * Liked Songs list (a mirror of Navidrome stars — intentionally navidromeId=null
 * and must never be pushed as a standalone Navidrome playlist).
 */
function isMirrorable(pl: PlaylistRow): boolean {
  if (pl.smartPlaylistCriteria) return false;
  if (isCanonicalLikedPlaylist(pl)) return false;
  return true;
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
 * not be created (no creds, smart playlist, or a Navidrome error). Never throws.
 */
export async function ensurePlaylistOnNavidrome(
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

    const c = await resolveCreds(userId, creds);
    if (!c) {
      console.warn(`[playlist-mirror] no Navidrome creds for user ${userId}; leaving "${pl.name}" local-only (will back-fill later)`);
      return null;
    }

    const songIds = await orderedSongIds(playlistId);
    const created = await createPlaylist(pl.name, songIds.length ? songIds : undefined, c);

    await db
      .update(userPlaylists)
      .set({ navidromeId: created.id, lastSynced: new Date(), updatedAt: new Date() })
      .where(eq(userPlaylists.id, playlistId));

    console.log(`✅ [playlist-mirror] created "${pl.name}" on Navidrome (${created.id}) with ${songIds.length} songs`);
    return created.id;
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
    const indices = remote.entry
      .map((s, i) => (s.id === songId ? i : -1))
      .filter((i) => i >= 0);
    if (indices.length === 0) return; // not on server = already consistent
    await removeSongsFromPlaylistByIndex(navidromeId, indices, creds);
  } catch (err) {
    console.warn(`[playlist-mirror] mirrorRemoveSong failed for ${navidromeId}/${songId}:`, err instanceof Error ? err.message : err);
  }
}
