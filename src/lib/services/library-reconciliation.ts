/**
 * Library Reconciliation Service
 *
 * After Picard retags or Lidarr reorganizes files, Navidrome assigns new song
 * IDs.  Old IDs referenced by playlist_songs, liked_songs_sync, and
 * recommendation_feedback become "ghosts" — the DB row points at a song that
 * streams an error or a completely different track.
 *
 * This service:
 * 1. Collects every song ID referenced in user-facing tables
 * 2. Checks each against Navidrome (getSong + stream HEAD)
 * 3. For dead IDs, searches by artist+title to find the retagged version
 * 4. Remaps playlist_songs, liked_songs_sync, recommendation_feedback, and
 *    stars in Navidrome to the new ID
 * 5. Triggers a Navidrome startScan to purge ghost entries
 *
 * Runs as a singleton scheduled job (default: every 6 hours).
 */

import { db } from '@/lib/db';
import {
  likedSongsSync,
  recommendationFeedback,
  playlistSongs,
  userPlaylists,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  getSongsByIds,
  search as navidromeSearch,
  starSong,
  getStarredSongs,
  buildSubsonicUrl,
} from './navidrome';
import { getNavidromeUserCreds } from './navidrome-users';
import type { SubsonicCreds } from './navidrome-users';

// ============================================================================
// Types
// ============================================================================

export interface ReconciliationResult {
  checkedIds: number;
  deadIds: number;
  remapped: number;
  notFound: number;
  scanTriggered: boolean;
  details: RemapDetail[];
  missingFromLibrary: MissingSong[];
  durationMs: number;
}

interface RemapDetail {
  oldId: string;
  newId: string;
  artist: string;
  title: string;
  tables: string[];
}

interface MissingSong {
  oldId: string;
  artist: string;
  title: string;
  source: string;
}

export interface ReconciliationStatus {
  isRunning: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastResult: ReconciliationResult | null;
  lastError: string | null;
  frequencyHours: number;
}

// ============================================================================
// Singleton Manager
// ============================================================================

class LibraryReconciliationManager {
  private static instance: LibraryReconciliationManager | null = null;

  private userId: string | null = null;
  private scheduledTimeoutId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastRunAt: Date | null = null;
  private nextRunAt: Date | null = null;
  private lastResult: ReconciliationResult | null = null;
  private lastError: string | null = null;
  private frequencyHours = 6;
  private enabled = true;

  private constructor() {}

  static getInstance(): LibraryReconciliationManager {
    if (!LibraryReconciliationManager.instance) {
      LibraryReconciliationManager.instance = new LibraryReconciliationManager();
    }
    return LibraryReconciliationManager.instance;
  }

  async initialize(userId: string, frequencyHours?: number): Promise<void> {
    this.userId = userId;
    if (frequencyHours !== undefined) this.frequencyHours = frequencyHours;
    if (this.enabled) {
      this.scheduleNextRun();
    }
    console.log(
      `[LibraryReconciliation] Initialized for user ${userId}, every ${this.frequencyHours}h`
    );
  }

  start(): void {
    this.enabled = true;
    this.scheduleNextRun();
  }

  stop(): void {
    this.enabled = false;
    if (this.scheduledTimeoutId) {
      clearTimeout(this.scheduledTimeoutId);
      this.scheduledTimeoutId = null;
    }
    this.nextRunAt = null;
  }

  getStatus(): ReconciliationStatus {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      lastResult: this.lastResult,
      lastError: this.lastError,
      frequencyHours: this.frequencyHours,
    };
  }

  async triggerNow(): Promise<ReconciliationResult> {
    if (!this.userId) throw new Error('Not initialized');
    if (this.isRunning) throw new Error('Already running');

    if (this.scheduledTimeoutId) {
      clearTimeout(this.scheduledTimeoutId);
      this.scheduledTimeoutId = null;
    }

    this.isRunning = true;
    try {
      const result = await reconcileLibrary(this.userId);
      this.lastResult = result;
      this.lastRunAt = new Date();
      this.lastError = null;
      console.log(
        `[LibraryReconciliation] Done: ${result.checkedIds} checked, ` +
          `${result.deadIds} dead, ${result.remapped} remapped, ` +
          `${result.notFound} missing (${result.durationMs}ms)`
      );
      return result;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error('[LibraryReconciliation] Failed:', this.lastError);
      throw err;
    } finally {
      this.isRunning = false;
      if (this.enabled) this.scheduleNextRun();
    }
  }

  private scheduleNextRun(delayMs?: number): void {
    if (!this.enabled) return;
    if (this.scheduledTimeoutId) clearTimeout(this.scheduledTimeoutId);

    const delay = delayMs ?? this.frequencyHours * 60 * 60 * 1000;
    this.nextRunAt = new Date(Date.now() + delay);
    this.scheduledTimeoutId = setTimeout(() => {
      this.triggerNow().catch(() => {});
    }, delay);

    console.log(
      `[LibraryReconciliation] Next run at ${this.nextRunAt.toISOString()}`
    );
  }
}

// ============================================================================
// Core Reconciliation Logic
// ============================================================================

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\(ft\..*?\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[''`]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function isArtistMatch(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na === nb) return true;
  const primaryA = na.split(/[,;&]/)[0].trim();
  const primaryB = nb.split(/[,;&]/)[0].trim();
  if (primaryA === primaryB) return true;
  if (na.includes(primaryB) || nb.includes(primaryA)) return true;
  return false;
}

function isTitleMatch(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

// MeTube downloads often have "Channel Name" as the artist and
// "Real Artist - Real Title [Official Audio]" as the title.
function parseRealArtistTitle(artist: string, title: string): {
  artist: string;
  title: string;
} {
  const clean = title
    .replace(/\s*\[Official (?:Audio|Video|Music Video)\]/gi, '')
    .replace(/\s*\(Official (?:Audio|Video)\)/gi, '')
    .replace(/\s*\(Lyrics?\)/gi, '')
    .replace(/\s*\|.*$/g, '')
    .trim();
  const parts = clean.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist, title: clean };
}

async function isStreamable(songId: string): Promise<boolean> {
  try {
    const streamUrl = buildSubsonicUrl('stream');
    streamUrl.searchParams.set('id', songId);
    const resp = await fetch(streamUrl.toString(), { method: 'HEAD' });
    const ct = resp.headers.get('content-type') || '';
    return ct.includes('audio');
  } catch {
    return true;
  }
}

async function reconcileLibrary(userId: string): Promise<ReconciliationResult> {
  const startMs = Date.now();
  const details: RemapDetail[] = [];
  const missingFromLibrary: MissingSong[] = [];

  // ── 1.  Collect all referenced song IDs ──────────────────────────────

  const [likedRows, feedbackRows, playlistRows] = await Promise.all([
    db
      .select({
        songId: likedSongsSync.songId,
        artist: likedSongsSync.artist,
        title: likedSongsSync.title,
      })
      .from(likedSongsSync)
      .where(
        and(eq(likedSongsSync.userId, userId), eq(likedSongsSync.isActive, 1))
      ),

    db
      .select({
        songId: recommendationFeedback.songId,
        songArtistTitle: recommendationFeedback.songArtistTitle,
      })
      .from(recommendationFeedback)
      .where(
        and(
          eq(recommendationFeedback.userId, userId),
          eq(recommendationFeedback.feedbackType, 'thumbs_up')
        )
      ),

    db
      .select({
        songId: playlistSongs.songId,
        playlistId: playlistSongs.playlistId,
      })
      .from(playlistSongs)
      .innerJoin(userPlaylists, eq(playlistSongs.playlistId, userPlaylists.id))
      .where(eq(userPlaylists.userId, userId)),
  ]);

  // Build a unique set of IDs with their metadata
  const idMeta = new Map<
    string,
    { artist: string; title: string; sources: Set<string> }
  >();

  for (const row of likedRows) {
    const existing = idMeta.get(row.songId);
    if (existing) {
      existing.sources.add('liked_songs_sync');
    } else {
      idMeta.set(row.songId, {
        artist: row.artist,
        title: row.title,
        sources: new Set(['liked_songs_sync']),
      });
    }
  }

  for (const row of feedbackRows) {
    if (!row.songId) continue;
    const existing = idMeta.get(row.songId);
    if (existing) {
      existing.sources.add('recommendation_feedback');
    } else {
      const parts = (row.songArtistTitle || '').split(' - ');
      idMeta.set(row.songId, {
        artist: parts[0] || 'Unknown',
        title: parts.slice(1).join(' - ') || 'Unknown',
        sources: new Set(['recommendation_feedback']),
      });
    }
  }

  for (const row of playlistRows) {
    const existing = idMeta.get(row.songId);
    if (existing) {
      existing.sources.add('playlist_songs');
    } else {
      idMeta.set(row.songId, {
        artist: '',
        title: '',
        sources: new Set(['playlist_songs']),
      });
    }
  }

  const allIds = [...idMeta.keys()];
  console.log(
    `[LibraryReconciliation] Checking ${allIds.length} unique song IDs`
  );

  // ── 2.  Check each ID against Navidrome ──────────────────────────────

  const BATCH = 50;
  const deadIds = new Map<
    string,
    { artist: string; title: string; sources: Set<string> }
  >();

  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH);
    try {
      const songs = await getSongsByIds(batch);
      const foundIds = new Set(songs.map((s) => s.id));
      for (const id of batch) {
        if (!foundIds.has(id)) {
          const meta = idMeta.get(id);
          if (meta) deadIds.set(id, meta);
        }
      }
    } catch {
      for (const id of batch) {
        try {
          const songs = await getSongsByIds([id]);
          if (songs.length === 0) {
            const meta = idMeta.get(id);
            if (meta) deadIds.set(id, meta);
          }
        } catch {
          const meta = idMeta.get(id);
          if (meta) deadIds.set(id, meta);
        }
      }
    }
  }

  // Navidrome keeps metadata for songs whose files were moved/deleted.
  // getSong succeeds but the stream returns XML error instead of audio.
  // HEAD-check the stream for IDs that passed the metadata check.
  const liveIds = allIds.filter((id) => !deadIds.has(id));
  for (let i = 0; i < liveIds.length; i += BATCH) {
    const batch = liveIds.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (id) => {
        if (!(await isStreamable(id))) {
          const meta = idMeta.get(id);
          if (meta) deadIds.set(id, meta);
        }
      })
    );
  }

  console.log(
    `[LibraryReconciliation] Found ${deadIds.size} dead IDs out of ${allIds.length}`
  );

  if (deadIds.size === 0) {
    return {
      checkedIds: allIds.length,
      deadIds: 0,
      remapped: 0,
      notFound: 0,
      scanTriggered: false,
      details: [],
      missingFromLibrary: [],
      durationMs: Date.now() - startMs,
    };
  }

  // ── 3.  Search for replacements ──────────────────────────────────────

  let remapped = 0;
  let notFound = 0;

  // Get per-user Navidrome creds for star operations
  let userCreds: SubsonicCreds | null = null;
  try {
    userCreds = await getNavidromeUserCreds(userId);
  } catch {
    // Will fall back to admin creds for star operations
  }

  // Get currently starred songs to know if we need to re-star
  const starredSongs = userCreds
    ? await getStarredSongs(userCreds)
    : await getStarredSongs();
  const starredIds = new Set(starredSongs.map((s) => s.id));

  for (const [deadId, meta] of deadIds) {
    // Skip if we don't have artist+title to search with
    if (!meta.artist && !meta.title) {
      notFound++;
      missingFromLibrary.push({
        oldId: deadId,
        artist: 'Unknown',
        title: 'Unknown',
        source: [...meta.sources].join(', '),
      });
      continue;
    }

    const query = `${meta.artist} ${meta.title}`;
    let match: { id: string; artist: string; title: string } | null = null;

    try {
      const toMatch = (r: { id: string; artist?: string; title?: string; name: string }) => ({
        id: r.id,
        artist: r.artist || 'Unknown Artist',
        title: r.title || r.name,
      });

      // Search by artist + title
      const results = await navidromeSearch(query, 0, 15);
      const nonDead = results.filter((r) => r.id !== deadId);

      for (const r of nonDead) {
        if (
          isArtistMatch(r.artist || '', meta.artist) &&
          isTitleMatch(r.title || r.name || '', meta.title) &&
          (await isStreamable(r.id))
        ) {
          match = toMatch(r);
          break;
        }
      }

      // Fallback: title-only search
      if (!match && meta.title) {
        const titleResults = await navidromeSearch(meta.title, 0, 15);
        for (const r of titleResults.filter((r) => r.id !== deadId)) {
          if (
            isArtistMatch(r.artist || '', meta.artist) &&
            (await isStreamable(r.id))
          ) {
            match = toMatch(r);
            break;
          }
        }
      }

      // Fallback: MeTube titles often embed "Real Artist - Real Title"
      if (!match && meta.title.includes(' - ')) {
        const parsed = parseRealArtistTitle(meta.artist, meta.title);
        if (parsed.artist !== meta.artist || parsed.title !== meta.title) {
          const parsedQuery = `${parsed.artist} ${parsed.title}`;
          const parsedResults = await navidromeSearch(parsedQuery, 0, 15);
          for (const r of parsedResults.filter((r) => r.id !== deadId)) {
            if (
              isArtistMatch(r.artist || '', parsed.artist) &&
              isTitleMatch(r.title || r.name || '', parsed.title) &&
              (await isStreamable(r.id))
            ) {
              match = toMatch(r);
              break;
            }
          }
        }
      }
    } catch (err) {
      console.warn(
        `[LibraryReconciliation] Search failed for "${query}":`,
        err
      );
    }

    if (!match) {
      notFound++;
      missingFromLibrary.push({
        oldId: deadId,
        artist: meta.artist,
        title: meta.title,
        source: [...meta.sources].join(', '),
      });
      continue;
    }

    // ── 4.  Remap references ─────────────────────────────────────────

    const tablesUpdated: string[] = [];

    // Update liked_songs_sync (delete old if new ID already exists)
    if (meta.sources.has('liked_songs_sync')) {
      try {
        await db
          .update(likedSongsSync)
          .set({
            songId: match.id,
            artist: match.artist,
            title: match.title,
            syncedAt: new Date(),
          })
          .where(
            and(
              eq(likedSongsSync.userId, userId),
              eq(likedSongsSync.songId, deadId)
            )
          );
        tablesUpdated.push('liked_songs_sync');
      } catch (err: unknown) {
        if (err instanceof Error && (err as Error & { code?: string }).code === '23505') {
          await db
            .delete(likedSongsSync)
            .where(
              and(
                eq(likedSongsSync.userId, userId),
                eq(likedSongsSync.songId, deadId)
              )
            );
          tablesUpdated.push('liked_songs_sync(dedup)');
        } else {
          console.warn(
            `[LibraryReconciliation] Failed to update liked_songs_sync for ${deadId}:`,
            err
          );
        }
      }
    }

    // Update recommendation_feedback
    if (meta.sources.has('recommendation_feedback')) {
      try {
        await db
          .update(recommendationFeedback)
          .set({
            songId: match.id,
            songArtistTitle: `${match.artist} - ${match.title}`,
          })
          .where(
            and(
              eq(recommendationFeedback.userId, userId),
              eq(recommendationFeedback.songId, deadId)
            )
          );
        tablesUpdated.push('recommendation_feedback');
      } catch (err: unknown) {
        if (err instanceof Error && (err as Error & { code?: string }).code === '23505') {
          await db
            .delete(recommendationFeedback)
            .where(
              and(
                eq(recommendationFeedback.userId, userId),
                eq(recommendationFeedback.songId, deadId)
              )
            );
          tablesUpdated.push('recommendation_feedback(dedup)');
        } else {
          console.warn(
            `[LibraryReconciliation] Failed to update recommendation_feedback for ${deadId}:`,
            err
          );
        }
      }
    }

    // Update playlist_songs
    if (meta.sources.has('playlist_songs')) {
      try {
        const affectedPlaylists = playlistRows.filter(
          (r) => r.songId === deadId
        );
        for (const pl of affectedPlaylists) {
          try {
            await db
              .update(playlistSongs)
              .set({ songId: match.id })
              .where(
                and(
                  eq(playlistSongs.playlistId, pl.playlistId),
                  eq(playlistSongs.songId, deadId)
                )
              );
          } catch (dupErr: unknown) {
            if (dupErr instanceof Error && (dupErr as Error & { code?: string }).code === '23505') {
              await db
                .delete(playlistSongs)
                .where(
                  and(
                    eq(playlistSongs.playlistId, pl.playlistId),
                    eq(playlistSongs.songId, deadId)
                  )
                );
            } else throw dupErr;
          }
        }
        tablesUpdated.push('playlist_songs');
      } catch (err) {
        console.warn(
          `[LibraryReconciliation] Failed to update playlist_songs for ${deadId}:`,
          err
        );
      }
    }

    // Re-star if the old ID was starred
    if (starredIds.has(deadId) && !starredIds.has(match.id)) {
      try {
        await starSong(match.id, userCreds || undefined);
        tablesUpdated.push('navidrome_star');
      } catch (err) {
        console.warn(
          `[LibraryReconciliation] Failed to re-star ${match.id}:`,
          err
        );
      }
    }

    details.push({
      oldId: deadId,
      newId: match.id,
      artist: match.artist,
      title: match.title,
      tables: tablesUpdated,
    });
    remapped++;

    console.log(
      `[LibraryReconciliation] Remapped "${meta.artist} - ${meta.title}" ` +
        `${deadId} → ${match.id} (${tablesUpdated.join(', ')})`
    );
  }

  // ── 5.  Trigger Navidrome scan to clean ghost entries ────────────────

  let scanTriggered = false;
  if (deadIds.size > 0) {
    try {
      const url = buildSubsonicUrl('startScan');
      await fetch(url.toString());
      scanTriggered = true;
      console.log(
        '[LibraryReconciliation] Triggered Navidrome scan to purge ghost entries'
      );
    } catch (err) {
      console.warn(
        '[LibraryReconciliation] Failed to trigger Navidrome scan:',
        err
      );
    }
  }

  return {
    checkedIds: allIds.length,
    deadIds: deadIds.size,
    remapped,
    notFound,
    scanTriggered,
    details,
    missingFromLibrary,
    durationMs: Date.now() - startMs,
  };
}

// ============================================================================
// Exports
// ============================================================================

export function getReconciliationManager(): LibraryReconciliationManager {
  return LibraryReconciliationManager.getInstance();
}

export async function initializeReconciliation(
  userId: string,
  frequencyHours?: number
): Promise<LibraryReconciliationManager> {
  const manager = getReconciliationManager();
  await manager.initialize(userId, frequencyHours);
  return manager;
}
