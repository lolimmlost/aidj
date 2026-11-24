/**
 * Plan a playlist's `playlist_songs` rows when a sync replaces its contents (#429).
 *
 * Syncs used to delete every row and re-insert them, so `added_at` fell back to
 * now() and every song looked freshly added. This works out the new rows while
 * keeping each surviving song's `added_at`, and says whether anything changed:
 *
 * - `contentChanged`: songs were added, removed or reordered. Only this should
 *   bump the playlist's `updated_at`.
 * - `needsWrite`: the rows on disk differ at all (content, a retagged
 *   "Artist - Title", or a corrected `added_at`). When false, leave the rows alone.
 *
 * Pure, so it can be unit-tested without a database.
 */

export interface ExistingPlaylistRow {
  songId: string;
  songArtistTitle: string;
  position: number;
  addedAt: Date | null;
}

export interface IncomingPlaylistSong {
  songId: string;
  songArtistTitle: string;
  /**
   * Authoritative add date from the source, e.g. when the song was starred in
   * Navidrome. When set it wins over the stored date (which also backfills rows
   * a previous sync stamped with the sync time).
   */
  addedAt?: Date | null;
}

export interface PlannedPlaylistRow {
  songId: string;
  songArtistTitle: string;
  position: number;
  addedAt: Date;
}

export interface PlaylistRowsPlan {
  rows: PlannedPlaylistRow[];
  contentChanged: boolean;
  needsWrite: boolean;
  /** Songs not in the playlist before this sync. */
  added: number;
  /** Songs that were in the playlist and are gone now. */
  removed: number;
}

export function planPlaylistRows(
  existing: ExistingPlaylistRow[],
  incoming: IncomingPlaylistSong[],
  options: { now?: Date; positionBase?: number } = {},
): PlaylistRowsPlan {
  const now = options.now ?? new Date();
  const base = options.positionBase ?? 0;

  const before = [...existing].sort((a, b) => a.position - b.position);
  const beforeById = new Map(before.map((r) => [r.songId, r]));

  // (playlist_id, song_id) is unique, so a song listed twice keeps its first spot.
  const seen = new Set<string>();
  const rows: PlannedPlaylistRow[] = [];
  for (const song of incoming) {
    if (seen.has(song.songId)) continue;
    seen.add(song.songId);
    const prev = beforeById.get(song.songId);
    const addedAt = validDate(song.addedAt) ?? validDate(prev?.addedAt) ?? now;
    rows.push({
      songId: song.songId,
      songArtistTitle: song.songArtistTitle,
      position: base + rows.length,
      addedAt,
    });
  }

  const added = rows.filter((r) => !beforeById.has(r.songId)).length;
  const removed = before.filter((r) => !seen.has(r.songId)).length;
  const contentChanged =
    added > 0 ||
    removed > 0 ||
    rows.length !== before.length ||
    rows.some((r, i) => before[i].songId !== r.songId);

  const needsWrite =
    contentChanged ||
    rows.some((r, i) => {
      const prev = before[i];
      return (
        prev.position !== r.position ||
        prev.songArtistTitle !== r.songArtistTitle ||
        prev.addedAt?.getTime() !== r.addedAt.getTime()
      );
    });

  return { rows, contentChanged, needsWrite, added, removed };
}

function validDate(d: Date | null | undefined): Date | null {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}
