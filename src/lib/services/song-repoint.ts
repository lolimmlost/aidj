/**
 * Song-id repoint (#221)
 *
 * When Picard retags a file, Lidarr moves it and Navidrome reindexes it under a
 * NEW song id; every row holding the old id now points at nothing. This module
 * is the single owner of moving a user's references from `oldId` to `newId`:
 *
 *   DB (one transaction)            liked_songs_sync, recommendation_feedback,
 *                                   playlist_songs (+ song_count), listening_history,
 *                                   compound_scores
 *   Navidrome (best-effort, after)  move the star, unstar a ghost old id, and
 *                                   rewrite each mirrored playlist from local order
 *                                   (#239 — otherwise the next sync undoes the heal)
 *
 * Collisions (the new id is already present) MERGE instead of throwing. They are
 * detected up front: inside a Postgres transaction a unique-violation aborts the
 * whole transaction, so the old "catch 23505, then delete" pattern cannot work here.
 *
 * Idempotent: a second call finds no rows under `oldId` and changes nothing.
 *
 * Behavior change vs. the pre-#221 inline reconciliation code: EVERY row of the
 * user's under `oldId` in the five tables moves — including thumbs-down/skip
 * feedback and inactive liked rows — not only the sources where reconciliation
 * found the dead id. listening_history and compound_scores are newly covered.
 */
import { db } from '@/lib/db';
import {
  likedSongsSync,
  recommendationFeedback,
  playlistSongs,
  userPlaylists,
  listeningHistory,
  compoundScores,
} from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { starSong, unstarSong, getStarredSongs, getMissingStarredSongs } from './navidrome';
import type { SubsonicCreds } from './navidrome-users';
import { getConfig } from '@/lib/config/config';
import { formatArtistTitle } from '@/lib/utils/song-artist-title';
import { mirrorReplaceSongs } from './playlist-navidrome-mirror';

export interface StarState {
  /** Song ids the user has starred, including ghost stars on missing files. */
  starred: Set<string>;
  /** Starred ids whose files are missing (admin-native only). */
  ghosts: Set<string>;
}

export interface RepointInput {
  userId: string;
  oldId: string;
  newId: string;
  /** Metadata of the NEW song, used to refresh cached artist/title text. */
  artist: string;
  title: string;
  /** Per-user Subsonic creds; null/undefined falls back to admin for stars. */
  creds?: SubsonicCreds | null;
  /** Pass when repointing many ids in one run; loaded on demand otherwise. */
  stars?: StarState;
  /** Run the real transaction, report what it would touch, then roll it back. No Navidrome calls. */
  dryRun?: boolean;
  /** false = DB only (no star/mirror calls). Default true. */
  navidrome?: boolean;
}

export interface RepointResult {
  /** Rows moved to newId, or merged into an existing newId row, per table. */
  liked: number;
  feedback: number;
  playlistRows: number;
  history: number;
  scores: number;
  /** Local playlists whose rows changed. */
  playlistIds: string[];
  /** Of those, Navidrome copies rewritten from local order. */
  playlistsMirrored: number;
  starMoved: boolean;
  ghostUnstarred: boolean;
}

/**
 * Starred ids for a user, unioning live stars with ghost stars. A starred song
 * whose file moved is exactly a ghost, and exactly the id being repointed, so a
 * live-only list would silently drop the user's like (GH #130). Ghosts are
 * admin-native only, so they're fetched only when this user IS the admin.
 */
export async function loadStarState(creds?: SubsonicCreds | null): Promise<StarState> {
  const isAdminUser = !creds || creds.username === getConfig().navidromeUsername;
  const [live, ghost] = await Promise.all([
    creds ? getStarredSongs(creds) : getStarredSongs(),
    isAdminUser ? getMissingStarredSongs().catch(() => []) : Promise.resolve([]),
  ]);
  return {
    starred: new Set([...live, ...ghost].map((s) => s.id)),
    ghosts: new Set(ghost.map((s) => s.id)),
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RowCounts = Awaited<ReturnType<typeof repointRows>>;

/** Thrown inside the transaction to roll back a dry run while carrying its counts out. */
export class DryRunRollback extends Error {
  constructor(readonly counts: RowCounts) {
    super('song-repoint dry run: rolled back');
  }
}

async function repointRows(tx: Tx, input: RepointInput) {
  const { userId, oldId, newId, artist, title } = input;
  const artistTitle = formatArtistTitle(artist, title);

  // liked_songs_sync — unique(user, song). Merge keeps the newId row, active if either was.
  let liked = 0;
  const [oldLiked] = await tx.select().from(likedSongsSync)
    .where(and(eq(likedSongsSync.userId, userId), eq(likedSongsSync.songId, oldId)));
  if (oldLiked) {
    const [newLiked] = await tx.select().from(likedSongsSync)
      .where(and(eq(likedSongsSync.userId, userId), eq(likedSongsSync.songId, newId)));
    if (newLiked) {
      await tx.update(likedSongsSync)
        .set({ isActive: Math.max(oldLiked.isActive, newLiked.isActive), artist, title, syncedAt: new Date() })
        .where(eq(likedSongsSync.id, newLiked.id));
      await tx.delete(likedSongsSync).where(eq(likedSongsSync.id, oldLiked.id));
    } else {
      await tx.update(likedSongsSync)
        .set({ songId: newId, artist, title, syncedAt: new Date() })
        .where(eq(likedSongsSync.id, oldLiked.id));
    }
    liked = 1;
  }

  // recommendation_feedback — unique(user, song). Merge keeps the more recent verdict.
  let feedback = 0;
  const [oldFb] = await tx.select().from(recommendationFeedback)
    .where(and(eq(recommendationFeedback.userId, userId), eq(recommendationFeedback.songId, oldId)));
  if (oldFb) {
    const [newFb] = await tx.select().from(recommendationFeedback)
      .where(and(eq(recommendationFeedback.userId, userId), eq(recommendationFeedback.songId, newId)));
    if (newFb && (newFb.timestamp?.getTime() ?? 0) >= (oldFb.timestamp?.getTime() ?? 0)) {
      // The newId verdict is at least as recent: it wins, the old one goes.
      await tx.delete(recommendationFeedback).where(eq(recommendationFeedback.id, oldFb.id));
      await tx.update(recommendationFeedback)
        .set({ songArtistTitle: artistTitle })
        .where(eq(recommendationFeedback.id, newFb.id));
    } else {
      if (newFb) await tx.delete(recommendationFeedback).where(eq(recommendationFeedback.id, newFb.id));
      await tx.update(recommendationFeedback)
        .set({ songId: newId, songArtistTitle: artistTitle })
        .where(eq(recommendationFeedback.id, oldFb.id));
    }
    feedback = 1;
  }

  // playlist_songs — unique(playlist, song), scoped to this user's playlists.
  const oldRows = await tx
    .select({ id: playlistSongs.id, playlistId: playlistSongs.playlistId })
    .from(playlistSongs)
    .innerJoin(userPlaylists, eq(playlistSongs.playlistId, userPlaylists.id))
    .where(and(eq(userPlaylists.userId, userId), eq(playlistSongs.songId, oldId)));
  const playlistIds = [...new Set(oldRows.map((r) => r.playlistId))];
  if (oldRows.length) {
    const alreadyHasNew = new Set(
      (await tx.select({ playlistId: playlistSongs.playlistId }).from(playlistSongs)
        .where(and(inArray(playlistSongs.playlistId, playlistIds), eq(playlistSongs.songId, newId))))
        .map((r) => r.playlistId),
    );
    for (const row of oldRows) {
      if (alreadyHasNew.has(row.playlistId)) {
        await tx.delete(playlistSongs).where(eq(playlistSongs.id, row.id));
      } else {
        await tx.update(playlistSongs)
          .set({ songId: newId, songArtistTitle: artistTitle })
          .where(eq(playlistSongs.id, row.id));
      }
    }
    // A merge removed a row, so the cached count must follow (sync compares counts).
    const merged = playlistIds.filter((id) => alreadyHasNew.has(id));
    if (merged.length) {
      await tx.update(userPlaylists)
        .set({
          songCount: sql`(select count(*) from ${playlistSongs} where ${playlistSongs.playlistId} = ${userPlaylists.id})`,
          updatedAt: new Date(),
        })
        .where(inArray(userPlaylists.id, merged));
    }
  }

  // listening_history — no uniqueness; every play of the song moves with it.
  const history = (await tx.update(listeningHistory)
    .set({ songId: newId })
    .where(and(eq(listeningHistory.userId, userId), eq(listeningHistory.songId, oldId)))
    .returning({ id: listeningHistory.id })).length;

  // compound_scores — derived and recomputed later; on collision keep the newId row.
  let scores = 0;
  const [oldScore] = await tx.select({ id: compoundScores.id }).from(compoundScores)
    .where(and(eq(compoundScores.userId, userId), eq(compoundScores.songId, oldId)));
  if (oldScore) {
    const [newScore] = await tx.select({ id: compoundScores.id }).from(compoundScores)
      .where(and(eq(compoundScores.userId, userId), eq(compoundScores.songId, newId)));
    if (newScore) {
      await tx.delete(compoundScores).where(eq(compoundScores.id, oldScore.id));
    } else {
      await tx.update(compoundScores).set({ songId: newId }).where(eq(compoundScores.id, oldScore.id));
    }
    scores = 1;
  }

  return { liked, feedback, playlistRows: oldRows.length, history, scores, playlistIds };
}

/**
 * Move every reference to `oldId` onto `newId` for one user. Throws only if the
 * DB transaction fails (nothing is written in that case); Navidrome follow-ups
 * are best-effort and reported in the result.
 */
export async function repointSongId(input: RepointInput): Promise<RepointResult> {
  const { userId, oldId, newId, creds } = input;
  if (!oldId || !newId || oldId === newId) {
    throw new Error(`repointSongId: invalid ids ${oldId} → ${newId}`);
  }

  let rows: RowCounts;
  try {
    rows = await db.transaction(async (tx) => {
      const counts = await repointRows(tx, input);
      if (input.dryRun) throw new DryRunRollback(counts);
      return counts;
    });
  } catch (err) {
    if (err instanceof DryRunRollback) {
      return { ...err.counts, playlistsMirrored: 0, starMoved: false, ghostUnstarred: false };
    }
    throw err;
  }

  if (input.navidrome === false) {
    return { ...rows, playlistsMirrored: 0, starMoved: false, ghostUnstarred: false };
  }

  const stars = input.stars ?? (await loadStarState(creds).catch(() => null));
  let starMoved = false;
  let ghostUnstarred = false;
  if (stars?.starred.has(oldId) && !stars.starred.has(newId)) {
    try {
      await starSong(newId, creds || undefined);
      stars.starred.add(newId);
      starMoved = true;
    } catch (err) {
      console.warn(`[song-repoint] failed to star ${newId}:`, err instanceof Error ? err.message : err);
    }
  }
  // Only a ghost (missing-file) star on oldId is safe to remove here (GH #130),
  // and only once the like is safe on newId — if starring newId failed, the ghost
  // is the user's only star, and liked sync (stars are the source of truth)
  // would otherwise drop the song from Liked.
  if (stars?.ghosts.has(oldId) && stars.starred.has(newId)) {
    try {
      await unstarSong(oldId, creds || undefined);
      stars.ghosts.delete(oldId);
      stars.starred.delete(oldId);
      ghostUnstarred = true;
    } catch (err) {
      console.warn(`[song-repoint] failed to unstar ghost ${oldId}:`, err instanceof Error ? err.message : err);
    }
  }

  let playlistsMirrored = 0;
  for (const playlistId of rows.playlistIds) {
    if (await mirrorReplaceSongs(playlistId, userId, creds)) playlistsMirrored++;
  }

  return { ...rows, playlistsMirrored, starMoved, ghostUnstarred };
}

/** Short labels for logs / reconciliation details, e.g. ["playlist_songs×4", "navidrome_star"]. */
export function describeRepoint(r: RepointResult): string[] {
  const parts: string[] = [];
  if (r.liked) parts.push('liked_songs_sync');
  if (r.feedback) parts.push('recommendation_feedback');
  if (r.playlistRows) parts.push(`playlist_songs×${r.playlistRows}`);
  if (r.history) parts.push(`listening_history×${r.history}`);
  if (r.scores) parts.push('compound_scores');
  if (r.playlistsMirrored) parts.push(`navidrome_playlist×${r.playlistsMirrored}`);
  if (r.starMoved) parts.push('navidrome_star');
  if (r.ghostUnstarred) parts.push('navidrome_unstar_ghost');
  return parts;
}
