import { db } from '@/lib/db';
import { listeningHistory, listeningSessions } from '@/lib/db/schema';
import { eq, and, gte, lte, isNull, sql, desc } from 'drizzle-orm';
import { getSeason } from '@/lib/utils/temporal';
import type { TopSessionItem, ListeningSessionInsert } from '@/lib/db/schema/listening-sessions.schema';

const GAP_MINUTES = 15;
const GAP_MS = GAP_MINUTES * 60 * 1000;
const MIN_SESSION_SONGS = 3;

interface RawPlay {
  id: string;
  playedAt: Date;
  playDuration: number | null;
  songDuration: number | null;
  artist: string;
  title: string;
  genre: string | null;
  completed: number | null;
  skipDetected: number | null;
  source: string | null;
  sessionId: string | null;
}

interface SessionGroup {
  plays: RawPlay[];
  startedAt: Date;
  endedAt: Date;
}

export interface MaterializeResult {
  created: number;
  updated: number;
  backfilledPlays: number;
}

function groupIntoSessions(plays: RawPlay[]): SessionGroup[] {
  if (plays.length === 0) return [];

  const groups: SessionGroup[] = [];
  let current: RawPlay[] = [plays[0]];
  let currentEnd = plays[0].playedAt.getTime() + (plays[0].playDuration || 0) * 1000;

  for (let i = 1; i < plays.length; i++) {
    const play = plays[i];
    const gap = play.playedAt.getTime() - currentEnd;

    if (gap <= GAP_MS) {
      current.push(play);
      const playEnd = play.playedAt.getTime() + (play.playDuration || 0) * 1000;
      if (playEnd > currentEnd) currentEnd = playEnd;
    } else {
      if (current.length >= MIN_SESSION_SONGS) {
        groups.push({
          plays: current,
          startedAt: current[0].playedAt,
          endedAt: new Date(currentEnd),
        });
      }
      current = [play];
      currentEnd = play.playedAt.getTime() + (play.playDuration || 0) * 1000;
    }
  }

  if (current.length >= MIN_SESSION_SONGS) {
    groups.push({
      plays: current,
      startedAt: current[0].playedAt,
      endedAt: new Date(currentEnd),
    });
  }

  return groups;
}

function computeSessionStats(group: SessionGroup): Omit<ListeningSessionInsert, 'id' | 'userId' | 'rating' | 'ratedAt' | 'createdAt' | 'updatedAt'> {
  const { plays, startedAt, endedAt } = group;

  const durationMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);

  const artistCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const sourceCounts: Record<string, number> = {};
  let completedCount = 0;
  let skipCount = 0;
  let totalPlayPct = 0;
  let playPctCount = 0;

  for (const play of plays) {
    artistCounts.set(play.artist, (artistCounts.get(play.artist) || 0) + 1);
    if (play.genre) {
      genreCounts.set(play.genre, (genreCounts.get(play.genre) || 0) + 1);
    }
    const src = play.source || 'manual';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    if (play.completed === 1) completedCount++;
    if (play.skipDetected === 1) skipCount++;
    if (play.playDuration != null && play.songDuration != null && play.songDuration > 0) {
      totalPlayPct += play.playDuration / play.songDuration;
      playPctCount++;
    }
  }

  const topArtists: TopSessionItem[] = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const topGenres: TopSessionItem[] = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  let dominantSource: string | null = null;
  const sourceEntries = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
  if (sourceEntries.length === 1) {
    dominantSource = sourceEntries[0][0];
  } else if (sourceEntries.length > 1) {
    const top = sourceEntries[0][1];
    const total = sourceEntries.reduce((s, e) => s + e[1], 0);
    dominantSource = top / total >= 0.6 ? sourceEntries[0][0] : 'mixed';
  }

  const month = startedAt.getMonth() + 1;

  return {
    startedAt,
    endedAt,
    durationMinutes,
    songCount: plays.length,
    uniqueArtistCount: artistCounts.size,
    uniqueGenreCount: genreCounts.size,
    completionRate: plays.length > 0 ? completedCount / plays.length : 0,
    skipRate: plays.length > 0 ? skipCount / plays.length : 0,
    avgPlayPercentage: playPctCount > 0 ? totalPlayPct / playPctCount : 0,
    topArtists,
    topGenres,
    sourceMix: sourceCounts,
    dominantSource,
    dayOfWeek: startedAt.getDay() === 0 ? 7 : startedAt.getDay(),
    hourOfDay: startedAt.getHours(),
    season: getSeason(month),
  };
}

export async function materializeSessions(
  userId: string,
  fromDate?: Date,
  toDate?: Date,
): Promise<MaterializeResult> {
  const lookback = fromDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const until = toDate || new Date();

  const plays = await db
    .select({
      id: listeningHistory.id,
      playedAt: listeningHistory.playedAt,
      playDuration: listeningHistory.playDuration,
      songDuration: listeningHistory.songDuration,
      artist: listeningHistory.artist,
      title: listeningHistory.title,
      genre: listeningHistory.genre,
      completed: listeningHistory.completed,
      skipDetected: listeningHistory.skipDetected,
      source: listeningHistory.source,
      sessionId: listeningHistory.sessionId,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, lookback),
        lte(listeningHistory.playedAt, until),
      )
    )
    .orderBy(listeningHistory.playedAt);

  const groups = groupIntoSessions(plays as RawPlay[]);

  let created = 0;
  let updated = 0;
  let backfilledPlays = 0;

  for (const group of groups) {
    const stats = computeSessionStats(group);

    const existing = await db
      .select({ id: listeningSessions.id })
      .from(listeningSessions)
      .where(
        and(
          eq(listeningSessions.userId, userId),
          eq(listeningSessions.startedAt, group.startedAt),
        )
      )
      .limit(1);

    let sessionId: string;

    if (existing.length > 0) {
      sessionId = existing[0].id;
      await db
        .update(listeningSessions)
        .set({ ...stats, updatedAt: new Date() })
        .where(eq(listeningSessions.id, sessionId));
      updated++;
    } else {
      sessionId = crypto.randomUUID();
      await db.insert(listeningSessions).values({
        id: sessionId,
        userId,
        ...stats,
      });
      created++;
    }

    const unlinkedIds = group.plays
      .filter((p) => p.sessionId !== sessionId)
      .map((p) => p.id);

    if (unlinkedIds.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < unlinkedIds.length; i += CHUNK) {
        const chunk = unlinkedIds.slice(i, i + CHUNK);
        await db
          .update(listeningHistory)
          .set({ sessionId })
          .where(
            and(
              eq(listeningHistory.userId, userId),
              sql`${listeningHistory.id} IN (${sql.join(chunk.map(id => sql`${id}`), sql`, `)})`
            )
          );
      }
      backfilledPlays += unlinkedIds.length;
    }
  }

  console.log(
    `[SessionMaterializer] User ${userId}: ${created} created, ${updated} updated, ${backfilledPlays} plays backfilled`
  );

  return { created, updated, backfilledPlays };
}

export async function materializeRecentSessions(userId: string): Promise<MaterializeResult> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  return materializeSessions(userId, twoHoursAgo);
}

export async function getSessionById(sessionId: string, userId: string) {
  const [session] = await db
    .select()
    .from(listeningSessions)
    .where(
      and(
        eq(listeningSessions.id, sessionId),
        eq(listeningSessions.userId, userId),
      )
    )
    .limit(1);

  if (!session) return null;

  const tracks = await db
    .select({
      songId: listeningHistory.songId,
      artist: listeningHistory.artist,
      title: listeningHistory.title,
      album: listeningHistory.album,
      genre: listeningHistory.genre,
      playDuration: listeningHistory.playDuration,
      songDuration: listeningHistory.songDuration,
      completed: listeningHistory.completed,
      skipDetected: listeningHistory.skipDetected,
      source: listeningHistory.source,
      playedAt: listeningHistory.playedAt,
    })
    .from(listeningHistory)
    .where(eq(listeningHistory.sessionId, sessionId))
    .orderBy(listeningHistory.playedAt);

  return { session, tracks };
}

export async function rateSession(
  sessionId: string,
  userId: string,
  rating: number | null,
): Promise<boolean> {
  const result = await db
    .update(listeningSessions)
    .set({
      rating,
      ratedAt: rating !== null ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(listeningSessions.id, sessionId),
        eq(listeningSessions.userId, userId),
      )
    )
    .returning({ id: listeningSessions.id });

  return result.length > 0;
}

export async function getSessionInsights(userId: string) {
  const allSessions = await db
    .select()
    .from(listeningSessions)
    .where(eq(listeningSessions.userId, userId))
    .orderBy(desc(listeningSessions.startedAt));

  const rated = allSessions.filter((s) => s.rating !== null);
  const liked = allSessions.filter((s) => s.rating === 1);
  const unrated = allSessions.filter((s) => s.rating === null);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const likedSourceCounts: Record<string, number> = {};
  const likedGenreCounts: Record<string, number> = {};
  const likedArtistCounts: Record<string, number> = {};

  for (const s of liked) {
    const src = s.dominantSource || 'unknown';
    likedSourceCounts[src] = (likedSourceCounts[src] || 0) + 1;
    for (const g of (s.topGenres as { name: string; count: number }[] || [])) {
      likedGenreCounts[g.name] = (likedGenreCounts[g.name] || 0) + g.count;
    }
    for (const a of (s.topArtists as { name: string; count: number }[] || [])) {
      likedArtistCounts[a.name] = (likedArtistCounts[a.name] || 0) + a.count;
    }
  }

  const sortedGenres = Object.entries(likedGenreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const sortedArtists = Object.entries(likedArtistCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const dayVotes = new Map<number, number>();
  const hourVotes = new Map<number, number>();
  for (const s of liked) {
    if (s.dayOfWeek != null) dayVotes.set(s.dayOfWeek, (dayVotes.get(s.dayOfWeek) || 0) + 1);
    if (s.hourOfDay != null) hourVotes.set(s.hourOfDay, (hourVotes.get(s.hourOfDay) || 0) + 1);
  }

  const preferredDay = dayVotes.size > 0
    ? [...dayVotes.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : null;
  const preferredHour = hourVotes.size > 0
    ? [...hourVotes.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : null;

  return {
    totalSessions: allSessions.length,
    ratedSessions: rated.length,
    likedSessions: liked.length,
    insights: {
      likedAvgDuration: Math.round(avg(liked.map((s) => s.durationMinutes))),
      unratedAvgDuration: Math.round(avg(unrated.map((s) => s.durationMinutes))),
      likedAvgSkipRate: Number(avg(liked.map((s) => s.skipRate)).toFixed(3)),
      unratedAvgSkipRate: Number(avg(unrated.map((s) => s.skipRate)).toFixed(3)),
      likedAvgCompletionRate: Number(avg(liked.map((s) => s.completionRate)).toFixed(3)),
      unratedAvgCompletionRate: Number(avg(unrated.map((s) => s.completionRate)).toFixed(3)),
      likedTopSources: likedSourceCounts,
      likedTopGenres: sortedGenres,
      likedTopArtists: sortedArtists,
      likedAvgUniqueArtists: Math.round(avg(liked.map((s) => s.uniqueArtistCount))),
      unratedAvgUniqueArtists: Math.round(avg(unrated.map((s) => s.uniqueArtistCount))),
      preferredDayOfWeek: preferredDay,
      preferredHourOfDay: preferredHour,
    },
  };
}
