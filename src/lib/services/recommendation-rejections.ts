import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db';
import { listeningHistory, recommendationFeedback } from '../db/schema';

/** What a user has turned down lately: songs they thumbed down, and artists they keep skipping. */
export interface Rejections {
  songIds: Set<string>;
  /** Lower-case artist names. */
  artists: Set<string>;
}

const WINDOW_DAYS = 30;
/** An artist is out once skipped this many times in the window, and more often skipped than finished. */
const ARTIST_SKIPS = 2;

export const NO_REJECTIONS: Rejections = { songIds: new Set(), artists: new Set() };

export function rejectionsFromRows(
  thumbsDown: { songId: string | null }[],
  artistPlays: { artist: string; skips: number; completes: number }[],
): Rejections {
  return {
    songIds: new Set(thumbsDown.map((r) => r.songId).filter((id): id is string => !!id)),
    artists: new Set(
      artistPlays
        .filter((a) => a.skips >= ARTIST_SKIPS && a.skips > a.completes)
        .map((a) => a.artist.trim().toLowerCase()),
    ),
  };
}

/** Thumbs-down songs (any time) and artists skipped more than finished in the last 30 days. */
export async function getRecentRejections(userId: string | undefined): Promise<Rejections> {
  if (!userId) return NO_REJECTIONS;
  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [thumbsDown, artistPlays] = await Promise.all([
      db
        .select({ songId: recommendationFeedback.songId })
        .from(recommendationFeedback)
        .where(and(eq(recommendationFeedback.userId, userId), eq(recommendationFeedback.feedbackType, 'thumbs_down'))),
      db
        .select({
          artist: listeningHistory.artist,
          skips: sql<number>`cast(sum(coalesce(${listeningHistory.skipDetected}, 0)) as int)`,
          completes: sql<number>`cast(sum(coalesce(${listeningHistory.completed}, 0)) as int)`,
        })
        .from(listeningHistory)
        .where(and(eq(listeningHistory.userId, userId), gte(listeningHistory.playedAt, since)))
        .groupBy(listeningHistory.artist),
    ]);
    return rejectionsFromRows(thumbsDown, artistPlays);
  } catch (error) {
    console.warn('⚠️ [Recommendations] Could not load skips / thumbs-down:', error);
    return NO_REJECTIONS;
  }
}

export function isRejected(song: { id: string; artist?: string }, r: Rejections): boolean {
  return r.songIds.has(song.id) || r.artists.has((song.artist || '').trim().toLowerCase());
}
