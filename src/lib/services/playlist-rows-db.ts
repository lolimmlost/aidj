import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { playlistSongs } from '@/lib/db/schema/playlists.schema';
import { planPlaylistRows, type IncomingPlaylistSong, type PlaylistRowsPlan } from './playlist-rows';

/**
 * Replace a playlist's rows with `incoming`, keeping each surviving song's
 * `added_at` (#429). Leaves the rows untouched when nothing differs, and swaps
 * them in one transaction otherwise, so a failed insert can't empty the playlist.
 */
export async function syncPlaylistRows(
  playlistId: string,
  incoming: IncomingPlaylistSong[],
  options: { positionBase?: number } = {},
): Promise<PlaylistRowsPlan> {
  const existing = await db
    .select({
      songId: playlistSongs.songId,
      songArtistTitle: playlistSongs.songArtistTitle,
      position: playlistSongs.position,
      addedAt: playlistSongs.addedAt,
    })
    .from(playlistSongs)
    .where(eq(playlistSongs.playlistId, playlistId));

  const plan = planPlaylistRows(existing, incoming, options);
  if (!plan.needsWrite) return plan;

  await db.transaction(async (tx) => {
    await tx.delete(playlistSongs).where(eq(playlistSongs.playlistId, playlistId));
    // Chunked: a 4k-song playlist in one VALUES list is close to Postgres's
    // 65,535 bind-parameter cap once every column is counted.
    for (let i = 0; i < plan.rows.length; i += 1000) {
      await tx.insert(playlistSongs).values(
        plan.rows.slice(i, i + 1000).map((r) => ({ ...r, id: crypto.randomUUID(), playlistId })),
      );
    }
  });
  return plan;
}
