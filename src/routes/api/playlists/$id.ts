import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { userPlaylists, playlistSongs } from '../../../lib/db/schema/playlists.schema';
import { likedSongsSync } from '../../../lib/db/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { getSongsByIds, getPlaylists, deletePlaylist } from '../../../lib/services/navidrome';
import { deleteSmartPlaylist } from '../../../lib/services/navidrome-smart-playlists';
import { getNavidromeUserCreds, type SubsonicCreds } from '../../../lib/services/navidrome-users';
import { isCanonicalLikedPlaylist } from '../../../lib/services/liked-songs-sync';

/**
 * Whether a playlist with this Navidrome id still exists on the server, checked
 * from BOTH the user's Subsonic view (regular playlists are user-owned) and the
 * admin view (smart playlists are admin-owned). Used to make DELETE authoritative
 * so we never hard-delete locally while the server copy survives — that mismatch
 * is what makes deleted playlists resurrect on the next sync (#160).
 *
 * Fails CLOSED: if a view we need to consult cannot be fetched (Navidrome down,
 * transient error), we cannot prove the playlist is gone, so we report it as
 * still present. Treating an unverifiable server as "gone" is exactly what would
 * let a surviving server copy resurrect on the next sync.
 */
async function isPlaylistStillOnServer(
  navidromeId: string,
  userCreds?: SubsonicCreds,
): Promise<boolean> {
  // Each applicable view resolves to one of:
  //   'present' — the playlist is definitely still there
  //   'absent'  — the view loaded and did not contain it
  //   'unknown' — the view could not be read (fetch failed)
  const check = async (creds?: SubsonicCreds): Promise<'present' | 'absent' | 'unknown'> => {
    try {
      const lists = await getPlaylists(creds);
      return lists.some((p) => p.id === navidromeId) ? 'present' : 'absent';
    } catch (error) {
      console.warn(`[playlists] Could not read Navidrome playlist view while verifying delete of ${navidromeId}:`, error);
      return 'unknown';
    }
  };

  const results = await Promise.all([
    userCreds ? check(userCreds) : Promise.resolve('absent' as const),
    check(), // admin view
  ]);

  // Present anywhere → definitely still there. Any view we couldn't read →
  // cannot confirm deletion → fail closed (treat as still present).
  return results.some((r) => r === 'present' || r === 'unknown');
}

export const Route = createFileRoute("/api/playlists/$id")({
  server: {
    handlers: {
  // GET /api/playlists/[id] - Get playlist details
  GET: async ({ request, params }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true,
      },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { id } = params;

      // Fetch playlist
      const playlist = await db
        .select()
        .from(userPlaylists)
        .where(and(
          eq(userPlaylists.id, id),
          eq(userPlaylists.userId, session.user.id)
        ))
        .limit(1)
        .then(rows => rows[0]);

      if (!playlist) {
        return new Response(JSON.stringify({
          error: 'Playlist not found',
          code: 'PLAYLIST_NOT_FOUND'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch playlist songs
      const songs = await db
        .select()
        .from(playlistSongs)
        .where(eq(playlistSongs.playlistId, id))
        .orderBy(asc(playlistSongs.position));

      // Try to enrich songs with Navidrome metadata (duration, album, albumId, starred, etc.)
      const isLikedSongsPlaylist = isCanonicalLikedPlaylist(playlist);

      let enrichedSongs = songs.map(s => ({
        ...s,
        duration: null as number | null,
        album: null as string | null,
        albumId: null as string | null,
        artistId: null as string | null,
        starred: isLikedSongsPlaylist, // All songs in Liked Songs playlist are starred by definition
      }));

      try {
        const songIds = songs.map(s => s.songId);

        if (songIds.length > 0) {
          // Fetch song details from Navidrome (admin account — for duration/album metadata)
          const songDetails = await getSongsByIds(songIds);
          const songMap = new Map(songDetails.map(s => [s.id, s]));

          // For non-liked playlists, check which songs the current user has starred
          let likedSet: Set<string>;
          if (isLikedSongsPlaylist) {
            // All songs in this playlist are starred by definition
            likedSet = new Set(songIds);
          } else {
            const likedRecords = await db
              .select({ songId: likedSongsSync.songId })
              .from(likedSongsSync)
              .where(
                and(
                  eq(likedSongsSync.userId, session.user.id),
                  eq(likedSongsSync.isActive, 1),
                  inArray(likedSongsSync.songId, songIds)
                )
              );
            likedSet = new Set(likedRecords.map(r => r.songId));
          }

          enrichedSongs = songs.map(s => {
            const details = songMap.get(s.songId);
            return {
              ...s,
              duration: details?.duration ?? null,
              album: details?.album ?? null,
              albumId: details?.albumId ?? null,
              artistId: (details as { artistId?: string })?.artistId ?? null,
              starred: likedSet.has(s.songId),
            };
          });
        }
      } catch (navidromeError) {
        // If Navidrome is unavailable, continue with basic song data
        console.warn('Could not fetch song details from Navidrome:', navidromeError);
      }

      return new Response(JSON.stringify({
        data: {
          ...playlist,
          // Lets the client reliably detect the canonical Liked Songs playlist
          // (its id is a UUID, so a literal id check can't) and trigger the
          // reconcile-on-open backstop.
          isLikedSongs: isLikedSongsPlaylist,
          songs: enrichedSongs,
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to fetch playlist:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch playlist';
      return new Response(JSON.stringify({
        code: 'PLAYLIST_FETCH_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  // DELETE /api/playlists/[id] - Delete playlist
  DELETE: async ({ request, params }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true,
      },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { id } = params;

      // Verify ownership
      const playlist = await db
        .select()
        .from(userPlaylists)
        .where(and(
          eq(userPlaylists.id, id),
          eq(userPlaylists.userId, session.user.id)
        ))
        .limit(1)
        .then(rows => rows[0]);

      if (!playlist) {
        return new Response(JSON.stringify({
          error: 'Playlist not found',
          code: 'PLAYLIST_NOT_FOUND'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Delete from Navidrome AUTHORITATIVELY before removing locally. If the
      // server copy survives, the next sync re-imports it as a "new" playlist
      // (#160) — so we attempt every applicable delete path, then verify the
      // playlist is actually gone from the server and only THEN hard-delete the
      // local row. Regular synced playlists are user-owned (delete with per-user
      // creds, same context sync uses); smart playlists are admin-owned (delete
      // with admin creds). We judge success by the end state, treating an
      // "already gone" playlist as a successful delete.
      if (playlist.navidromeId) {
        const navId = playlist.navidromeId;
        // `userCreds` is null when the user has no per-user Navidrome account.
        // That is safe here ONLY because of an invariant: `navidromeUsers` rows
        // are never deleted, so a null-creds user has never had an account, which
        // means all of their navidromeId-bearing rows were imported by sync via
        // the ADMIN view (syncNavidromePlaylists resolves creds the same way) —
        // so those playlists are admin-visible and both the admin delete path and
        // the admin-view verification below can see them. If a path that DELETES
        // navidromeUsers rows is ever added, a formerly-provisioned user's private
        // (user-owned) playlists become invisible to the admin view and this
        // handler could hard-delete locally while the server copy survives (#160).
        const userCreds = await getNavidromeUserCreds(session.user.id);

        // Attempt all paths; a failure on any single path is expected (a 404
        // just means the playlist doesn't live there) so we don't abort — but we
        // DO log each failure. Without this, a refused delete (502 below) is a
        // blind "try again" that can't distinguish an auth failure (wrong creds)
        // from a 404 from Navidrome being unreachable — the difference between
        // "your password is stale" and "the server is down".
        const tryDelete = (label: string, p: Promise<unknown>) =>
          p.catch((err) => console.warn(`[playlists] delete path '${label}' failed for ${navId}:`, err instanceof Error ? err.message : err));
        await tryDelete('user-subsonic', deletePlaylist(navId, userCreds ?? undefined)); // user-owned (Subsonic)
        await tryDelete('admin-subsonic', deletePlaylist(navId));                         // admin (Subsonic)
        await tryDelete('admin-nd-rest', deleteSmartPlaylist(navId));                     // admin smart (ND REST)

        if (await isPlaylistStillOnServer(navId, userCreds ?? undefined)) {
          console.warn(`[playlists] Refusing local delete: ${navId} still on Navidrome after delete attempts`);
          return new Response(JSON.stringify({
            code: 'PLAYLIST_REMOTE_DELETE_FAILED',
            message: 'Could not remove this playlist from the music server, so it was kept to prevent it reappearing on the next sync. Please try again.',
          }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Server copy is gone (or the playlist was never synced) — safe to
      // hard-delete locally (cascade removes songs).
      await db
        .delete(userPlaylists)
        .where(eq(userPlaylists.id, id));

      return new Response(JSON.stringify({ data: { success: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      console.error('Failed to delete playlist:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete playlist';
      return new Response(JSON.stringify({
        code: 'PLAYLIST_DELETE_ERROR',
        message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
    },
  },
});
