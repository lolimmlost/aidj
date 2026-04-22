/**
 * Artist Co-Occurrence Service
 *
 * Builds a per-user graph of which artists are played together in the same
 * listening session. Used by seeded-radio's artist seed to surface
 * "adjacent" artists the user actually plays together — independent of
 * Last.fm similarity. Captures the long tail Last.fm misses.
 *
 * Algorithm:
 *   1. Read listening_history for user, last 90 days, sorted by playedAt.
 *   2. Group into sessions — contiguous plays with no gap > 30 minutes.
 *   3. For each session, enumerate all distinct artist pairs (A, B).
 *   4. Accumulate raw weight with recency decay: exp(-0.05 * days_ago).
 *   5. Normalize by cosine: score = raw / sqrt(plays(A) * plays(B)).
 *   6. Upsert bidirectionally — both (A,B) and (B,A) rows.
 *
 * Lookup is a cheap indexed scan by (userId, artistA).
 */

import { db } from '../db';
import {
  artistCoOccurrence,
  listeningHistory,
  type ArtistCoOccurrenceInsert,
} from '../db/schema';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

const LOOKBACK_DAYS = 90;
const SESSION_GAP_MS = 30 * 60 * 1000;
const RECENCY_DECAY_RATE = 0.05;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const INSERT_BATCH_SIZE = 500;

export interface RelatedArtist {
  artist: string;
  score: number;
  coplayCount: number;
}

interface PlayRow {
  artist: string;
  playedAt: Date;
}

/**
 * Slice a timeline of plays into sessions by gap threshold.
 * Exported for testing.
 */
export function splitIntoSessions(plays: PlayRow[], gapMs = SESSION_GAP_MS): PlayRow[][] {
  if (plays.length === 0) return [];
  const sessions: PlayRow[][] = [];
  let current: PlayRow[] = [plays[0]];
  for (let i = 1; i < plays.length; i++) {
    const prev = plays[i - 1].playedAt.getTime();
    const curr = plays[i].playedAt.getTime();
    if (curr - prev > gapMs) {
      sessions.push(current);
      current = [plays[i]];
    } else {
      current.push(plays[i]);
    }
  }
  sessions.push(current);
  return sessions;
}

interface PairAccumulator {
  weight: number;
  coplayCount: number;
  lastCoplayedAt: Date;
}

/**
 * Build pair accumulator map from sessions. Exported for testing.
 *
 * For each session, emit every unordered distinct-artist pair once
 * (sessions with many plays of the same artist don't inflate self-pairs).
 * Pairs are keyed by `"A|B"` with A < B alphabetically for dedupe, then
 * expanded bidirectionally at upsert time.
 */
export function accumulatePairs(
  sessions: PlayRow[][],
  now: Date = new Date(),
): Map<string, PairAccumulator> {
  const pairs = new Map<string, PairAccumulator>();

  for (const session of sessions) {
    const uniqueArtists = new Map<string, Date>();
    for (const play of session) {
      const existing = uniqueArtists.get(play.artist);
      if (!existing || play.playedAt > existing) {
        uniqueArtists.set(play.artist, play.playedAt);
      }
    }
    const artistList = Array.from(uniqueArtists.entries());
    if (artistList.length < 2) continue;

    for (let i = 0; i < artistList.length; i++) {
      for (let j = i + 1; j < artistList.length; j++) {
        const [artistI, timeI] = artistList[i];
        const [artistJ, timeJ] = artistList[j];
        const [a, b] = artistI < artistJ ? [artistI, artistJ] : [artistJ, artistI];
        const mostRecent = timeI > timeJ ? timeI : timeJ;
        const daysAgo = Math.max(0, (now.getTime() - mostRecent.getTime()) / MS_PER_DAY);
        const weight = Math.exp(-RECENCY_DECAY_RATE * daysAgo);

        const key = `${a}|${b}`;
        const acc = pairs.get(key);
        if (acc) {
          acc.weight += weight;
          acc.coplayCount += 1;
          if (mostRecent > acc.lastCoplayedAt) acc.lastCoplayedAt = mostRecent;
        } else {
          pairs.set(key, {
            weight,
            coplayCount: 1,
            lastCoplayedAt: mostRecent,
          });
        }
      }
    }
  }

  return pairs;
}

/**
 * Recompute the co-occurrence graph for a user from scratch.
 * Returns the number of directional rows written (each pair = 2 rows).
 */
export async function computeForUser(
  userId: string,
  daysBack: number = LOOKBACK_DAYS,
): Promise<number> {
  console.log(`🔗 [ArtistCoOccurrence] Computing for user ${userId} (${daysBack} days)`);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  const rows = await db
    .select({
      artist: listeningHistory.artist,
      playedAt: listeningHistory.playedAt,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, cutoff),
      ),
    )
    .orderBy(listeningHistory.playedAt);

  if (rows.length === 0) {
    console.log(`🔗 [ArtistCoOccurrence] No listening history for user ${userId}`);
    return 0;
  }

  const plays: PlayRow[] = rows
    .filter((r) => r.artist && r.artist.trim().length > 0)
    .map((r) => ({
      artist: r.artist.toLowerCase().trim(),
      playedAt: r.playedAt,
    }));

  const playsPerArtist = new Map<string, number>();
  for (const play of plays) {
    playsPerArtist.set(play.artist, (playsPerArtist.get(play.artist) ?? 0) + 1);
  }

  const sessions = splitIntoSessions(plays);
  const pairs = accumulatePairs(sessions);

  if (pairs.size === 0) {
    console.log(`🔗 [ArtistCoOccurrence] No co-occurring pairs for user ${userId}`);
    return 0;
  }

  const insertRows: ArtistCoOccurrenceInsert[] = [];
  for (const [key, acc] of pairs) {
    const [a, b] = key.split('|');
    const playsA = playsPerArtist.get(a) ?? 1;
    const playsB = playsPerArtist.get(b) ?? 1;
    const normalized = acc.weight / Math.sqrt(playsA * playsB);

    insertRows.push(
      {
        userId,
        artistA: a,
        artistB: b,
        cooccurrenceScore: normalized,
        coplayCount: acc.coplayCount,
        lastCoplayedAt: acc.lastCoplayedAt,
      },
      {
        userId,
        artistA: b,
        artistB: a,
        cooccurrenceScore: normalized,
        coplayCount: acc.coplayCount,
        lastCoplayedAt: acc.lastCoplayedAt,
      },
    );
  }

  // Atomic swap: wipe + rewrite in a single transaction. If any insert fails
  // we roll back so the user keeps their existing graph rather than ending up
  // with a partial one.
  await db.transaction(async (tx) => {
    await tx
      .delete(artistCoOccurrence)
      .where(eq(artistCoOccurrence.userId, userId));

    for (let i = 0; i < insertRows.length; i += INSERT_BATCH_SIZE) {
      const chunk = insertRows.slice(i, i + INSERT_BATCH_SIZE);
      await tx
        .insert(artistCoOccurrence)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            artistCoOccurrence.userId,
            artistCoOccurrence.artistA,
            artistCoOccurrence.artistB,
          ],
          set: {
            cooccurrenceScore: sql`excluded.cooccurrence_score`,
            coplayCount: sql`excluded.coplay_count`,
            lastCoplayedAt: sql`excluded.last_coplayed_at`,
            calculatedAt: new Date(),
          },
        });
    }
  });

  const stored = insertRows.length;
  console.log(`🔗 [ArtistCoOccurrence] Stored ${stored} rows (${pairs.size} pairs) for user ${userId}`);
  return stored;
}

/**
 * Look up the top N artists that co-occur with `artist` for this user,
 * ranked by cooccurrenceScore.
 */
export async function getRelatedArtists(
  userId: string,
  artist: string,
  limit: number = 10,
): Promise<RelatedArtist[]> {
  const normalized = artist.toLowerCase().trim();
  if (normalized.length === 0) return [];

  const rows = await db
    .select({
      artist: artistCoOccurrence.artistB,
      score: artistCoOccurrence.cooccurrenceScore,
      coplayCount: artistCoOccurrence.coplayCount,
    })
    .from(artistCoOccurrence)
    .where(
      and(
        eq(artistCoOccurrence.userId, userId),
        eq(artistCoOccurrence.artistA, normalized),
      ),
    )
    .orderBy(desc(artistCoOccurrence.cooccurrenceScore))
    .limit(limit);

  return rows.map((r) => ({
    artist: r.artist,
    score: r.score,
    coplayCount: r.coplayCount,
  }));
}

export const __internal = {
  splitIntoSessions,
  accumulatePairs,
  SESSION_GAP_MS,
  RECENCY_DECAY_RATE,
  LOOKBACK_DAYS,
};
