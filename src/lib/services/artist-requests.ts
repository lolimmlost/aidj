/**
 * DB side of artist requests (#436): the demand log, and keeping the
 * artist_metadata_cache Lidarr fields in step after a request (#435: they stayed
 * null/false after an add, so the card kept offering to add an artist that was
 * already in Lidarr).
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { artistMetadataCache } from '@/lib/db/schema/artist-metadata.schema';
import { artistRequests } from '@/lib/db/schema/artist-requests.schema';
import type { ReleaseGroupRef, RequestInput, RequestResult } from './lidarr-request';

/** MusicBrainz release groups cached for this artist (server-side source of truth). */
export async function getCachedReleaseGroups(mbid: string): Promise<ReleaseGroupRef[]> {
  const row = await db
    .select({ releaseGroups: artistMetadataCache.releaseGroups })
    .from(artistMetadataCache)
    .where(eq(artistMetadataCache.mbid, mbid))
    .orderBy(desc(artistMetadataCache.fetchedAt))
    .limit(1)
    .then(rows => rows[0]);
  return row?.releaseGroups ?? [];
}

export async function recordRequest(userId: string, input: RequestInput, result: RequestResult): Promise<void> {
  const releaseGroupId = result.releaseGroupId ?? input.releaseGroupId ?? null;

  // A recheck after 'pending' updates the row it follows up on instead of adding one.
  if (input.recheck) {
    const prior = await db
      .select({ id: artistRequests.id })
      .from(artistRequests)
      .where(and(
        eq(artistRequests.userId, userId),
        eq(artistRequests.artistMbid, input.mbid),
        releaseGroupId ? eq(artistRequests.releaseGroupId, releaseGroupId) : isNull(artistRequests.releaseGroupId),
        eq(artistRequests.outcome, 'pending'),
      ))
      .orderBy(desc(artistRequests.requestedAt))
      .limit(1)
      .then(rows => rows[0]);
    if (prior) {
      await db.update(artistRequests)
        .set({ outcome: result.outcome, lidarrAlbumId: result.lidarrAlbumId ?? null })
        .where(eq(artistRequests.id, prior.id));
      return;
    }
  }

  await db.insert(artistRequests).values({
    userId,
    artistMbid: input.mbid,
    artistName: input.artistName,
    mode: input.mode,
    releaseGroupId,
    releaseTitle: result.releaseTitle ?? input.releaseTitle ?? null,
    songTitle: input.songTitle ?? null,
    outcome: result.outcome,
    lidarrArtistId: result.lidarrArtistId ?? null,
    lidarrAlbumId: result.lidarrAlbumId ?? null,
  });
}

/** Write the live Lidarr id / monitored flag back into the metadata cache. */
export async function refreshCachedLidarrState(mbid: string, lidarrArtistId: number | undefined, monitored: boolean): Promise<void> {
  if (lidarrArtistId === undefined) return;
  await db.update(artistMetadataCache)
    .set({ lidarrId: String(lidarrArtistId), lidarrMonitored: monitored, updatedAt: new Date() })
    .where(eq(artistMetadataCache.mbid, mbid));
}

export interface RequestSummary {
  /** Key: 'artist' for follows, else the release-group id. */
  [key: string]: { users: number; byMe: boolean };
}

/** Who asked for what on this artist: distinct users per follow / release. */
export async function getRequestSummary(mbid: string, userId: string): Promise<RequestSummary> {
  const rows = await db
    .select({ userId: artistRequests.userId, mode: artistRequests.mode, releaseGroupId: artistRequests.releaseGroupId })
    .from(artistRequests)
    .where(eq(artistRequests.artistMbid, mbid));

  const users = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = r.mode === 'artist' ? 'artist' : r.releaseGroupId;
    if (!key) continue;
    if (!users.has(key)) users.set(key, new Set());
    users.get(key)!.add(r.userId);
  }
  const summary: RequestSummary = {};
  for (const [key, set] of users) summary[key] = { users: set.size, byMe: set.has(userId) };
  return summary;
}
