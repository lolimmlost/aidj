/**
 * Last.fm Scrobble Backfill Service
 *
 * Imports historical scrobble data from Last.fm into local listening history.
 * This gives the recommendation engine more data to work with, especially
 * for new users or those who've been scrobbling to Last.fm from other players.
 *
 * Features:
 * - Paginated fetching with rate limiting (respects Last.fm's 5 req/s)
 * - Deduplication against existing listening history
 * - Progress tracking for UI feedback via SSE
 * - Post-import similarity fetching + compound score recalculation
 * - In-memory concurrency lock (single backfill per user)
 * - Configurable date range
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 3.1
 */

import { db } from '../db';
import { listeningHistory, trackSimilarities } from '../db/schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { getLastFmClient } from './lastfm';
import { getConfigAsync } from '@/lib/config/config';

// ============================================================================
// Types
// ============================================================================

export interface BackfillProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  totalScrobbles: number;
  imported: number;
  skipped: number;
  currentPage: number;
  totalPages: number;
  error?: string;
}

export interface BackfillOptions {
  /** Last.fm username */
  username: string;
  /** User ID in our system */
  userId: string;
  /** Only import scrobbles after this date */
  fromDate?: Date;
  /** Only import scrobbles before this date */
  toDate?: Date;
  /** Max pages to fetch (safety limit, default: 50) */
  maxPages?: number;
  /** Progress callback */
  onProgress?: (progress: BackfillProgress) => void;
}

export type BackfillEvent =
  | { phase: 'import'; page: number; totalPages: number; imported: number; skipped: number; total: number }
  | { phase: 'import'; status: 'completed'; imported: number; skipped: number }
  | { phase: 'similarity'; processed: number; total: number; current: string }
  | { phase: 'similarity'; status: 'completed'; processed: number; cached: number; failed: number }
  | { phase: 'scoring'; status: 'running' }
  | { phase: 'scoring'; status: 'completed'; scores: number }
  | { phase: 'done' }
  | { phase: 'error'; error: string };

export interface BackfillJob {
  jobId: string;
  userId: string;
  progress: BackfillProgress;
  /** Latest event for polling — frontend GETs this */
  latestEvent: BackfillEvent | null;
  /** Keep completed jobs around briefly so the final status can be polled */
  completedAt?: number;
}

// ============================================================================
// In-memory job registry + concurrency lock
// ============================================================================

const activeBackfills = new Map<string, BackfillJob>();

export function getActiveBackfill(userId: string): BackfillJob | undefined {
  return activeBackfills.get(userId);
}

export function isBackfillActive(userId: string): boolean {
  const job = activeBackfills.get(userId);
  if (!job) return false;
  // Completed jobs are kept briefly for final poll — don't count as "active" for concurrency
  return !job.completedAt;
}

export function registerBackfillJob(userId: string, job: BackfillJob): void {
  activeBackfills.set(userId, job);
}

function finishBackfillJob(userId: string): void {
  const job = activeBackfills.get(userId);
  if (job) {
    job.completedAt = Date.now();
    // Clean up after 60s so frontend has time to poll the final status
    setTimeout(() => activeBackfills.delete(userId), 60_000);
  }
}

function updateJobEvent(job: BackfillJob, event: BackfillEvent): void {
  job.latestEvent = event;
}

const MAX_SIMILARITY_SONGS = 500;

// ============================================================================
// Backfill Implementation
// ============================================================================

/**
 * Run a Last.fm scrobble backfill for a user.
 * Fetches their recent tracks from Last.fm and inserts missing ones
 * into the local listening history.
 */
export async function runScrobbleBackfill(options: BackfillOptions): Promise<BackfillProgress> {
  const {
    username,
    userId,
    fromDate,
    toDate,
    maxPages = 50,
    onProgress,
  } = options;

  const progress: BackfillProgress = {
    status: 'running',
    totalScrobbles: 0,
    imported: 0,
    skipped: 0,
    currentPage: 0,
    totalPages: 0,
  };

  const notify = () => onProgress?.(progress);

  try {
    const config = await getConfigAsync();
    if (!config.lastfmApiKey) {
      throw new Error('Last.fm API key not configured');
    }

    const lastFm = getLastFmClient(config.lastfmApiKey);
    if (!lastFm) {
      throw new Error('Failed to initialize Last.fm client');
    }

    const from = fromDate ? Math.floor(fromDate.getTime() / 1000) : undefined;
    const to = toDate ? Math.floor(toDate.getTime() / 1000) : undefined;

    // First page to get total count
    const firstPage = await lastFm.getRecentTracks(username, 1, 200, from, to);
    progress.totalScrobbles = firstPage.total;
    progress.totalPages = Math.min(firstPage.totalPages, maxPages);
    notify();

    console.log(`📥 [Backfill] Starting backfill for ${username}: ${firstPage.total} scrobbles, ${firstPage.totalPages} pages (processing up to ${progress.totalPages})`);

    // Process all pages
    for (let page = 1; page <= progress.totalPages; page++) {
      progress.currentPage = page;
      notify();

      const pageData = page === 1 ? firstPage : await lastFm.getRecentTracks(username, page, 200, from, to);

      for (const track of pageData.tracks) {
        // Skip "now playing" tracks (they don't have a timestamp)
        if (track.nowPlaying || !track.playedAt) {
          progress.skipped++;
          continue;
        }

        // Check for existing record at the same timestamp (dedup)
        const existing = await db
          .select({ id: listeningHistory.id })
          .from(listeningHistory)
          .where(
            and(
              eq(listeningHistory.userId, userId),
              eq(listeningHistory.artist, track.artist),
              eq(listeningHistory.title, track.title),
              // Within 2-minute window to account for timing differences
              gte(listeningHistory.playedAt, new Date(track.playedAt.getTime() - 120000)),
              lte(listeningHistory.playedAt, new Date(track.playedAt.getTime() + 120000))
            )
          )
          .limit(1);

        if (existing.length > 0) {
          progress.skipped++;
          continue;
        }

        // Insert the scrobble
        await db.insert(listeningHistory).values({
          userId,
          songId: `lastfm:${track.artist}:${track.title}`.substring(0, 255),
          artist: track.artist,
          title: track.title,
          album: track.album || null,
          genre: null,
          playedAt: track.playedAt,
          playDuration: null,
          songDuration: null,
          completed: 1, // Scrobbled = completed (Last.fm requires 50%+ play)
          skipDetected: 0,
        });

        progress.imported++;
      }

      console.log(`📥 [Backfill] Page ${page}/${progress.totalPages}: +${pageData.tracks.length} tracks (${progress.imported} imported, ${progress.skipped} skipped)`);
    }

    progress.status = 'completed';
    notify();

    console.log(`📥 [Backfill] Complete: ${progress.imported} imported, ${progress.skipped} skipped out of ${progress.totalScrobbles} total`);
    return progress;

  } catch (error) {
    progress.status = 'error';
    progress.error = error instanceof Error ? error.message : 'Unknown error';
    notify();
    console.error('📥 [Backfill] Error:', error);
    return progress;
  }
}

// ============================================================================
// Similarity Backfill (Phase 2)
// ============================================================================

/**
 * Fetch similarity data for backfilled songs that don't have it yet.
 * Uses getSimilarTracksRaw() to avoid Navidrome enrichment (which causes rate limiting).
 * Processes songs sequentially with delays to respect Last.fm's rate limit.
 */
async function runSimilarityBackfill(
  userId: string,
  job: BackfillJob,
): Promise<{ processed: number; cached: number; failed: number }> {
  const config = await getConfigAsync();
  if (!config.lastfmApiKey) {
    console.log('📊 [Backfill] Phase 2: Skipped (no Last.fm API key)');
    updateJobEvent(job, { phase: 'similarity', status: 'completed', processed: 0, cached: 0, failed: 0 });
    return { processed: 0, cached: 0, failed: 0 };
  }

  const lastFm = getLastFmClient(config.lastfmApiKey);
  if (!lastFm) {
    updateJobEvent(job, { phase: 'similarity', status: 'completed', processed: 0, cached: 0, failed: 0 });
    return { processed: 0, cached: 0, failed: 0 };
  }

  // Get unique (artist, title) from backfilled songs
  const uniqueSongs = await db
    .selectDistinct({
      artist: listeningHistory.artist,
      title: listeningHistory.title,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        sql`${listeningHistory.songId} LIKE 'lastfm:%'`
      )
    )
    .limit(MAX_SIMILARITY_SONGS);

  const total = uniqueSongs.length;
  let processed = 0;
  let cached = 0;
  let failed = 0;

  console.log(`📊 [Backfill] Phase 2: Fetching similarities for ${total} unique songs (raw, no Navidrome enrichment)`);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30-day cache

  // Process one song at a time to respect Last.fm rate limits (5 req/s)
  for (let i = 0; i < total; i++) {
    const song = uniqueSongs[i];

    try {
      // Check if we already have fresh similarity data
      const existing = await db
        .select({ id: trackSimilarities.id })
        .from(trackSimilarities)
        .where(
          and(
            eq(trackSimilarities.sourceArtist, song.artist),
            eq(trackSimilarities.sourceTitle, song.title),
            gte(trackSimilarities.expiresAt, new Date())
          )
        )
        .limit(1);

      if (existing.length > 0) {
        cached++;
        processed++;
      } else {
        // Use raw variant - only calls Last.fm API, no Navidrome searches
        const similarTracks = await lastFm.getSimilarTracksRaw(song.artist, song.title, 20);

        if (similarTracks.length > 0) {
          for (const track of similarTracks) {
            await db
              .insert(trackSimilarities)
              .values({
                sourceArtist: song.artist,
                sourceTitle: song.title,
                targetArtist: track.artist,
                targetTitle: track.name,
                targetSongId: null,
                matchScore: track.match || 0,
                expiresAt,
              })
              .onConflictDoUpdate({
                target: [trackSimilarities.id],
                set: {
                  matchScore: track.match || 0,
                  expiresAt,
                },
              });
          }
        }
        processed++;

        // Small delay between songs to stay within Last.fm's 5 req/s
        if (i < total - 1) {
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }
    } catch (error) {
      failed++;
      console.warn(`📊 [Backfill] Similarity fetch failed for ${song.artist} - ${song.title}:`, error);
    }

    // Broadcast progress every song
    updateJobEvent(job, {
      phase: 'similarity',
      processed: processed + failed,
      total,
      current: song.artist + ' - ' + song.title,
    });
  }

  updateJobEvent(job, {
    phase: 'similarity',
    status: 'completed',
    processed,
    cached,
    failed,
  });

  console.log(`📊 [Backfill] Phase 2 complete: ${processed} processed (${cached} cached), ${failed} failed out of ${total}`);
  return { processed, cached, failed };
}

// ============================================================================
// Full Backfill Pipeline (Phases 1-3)
// ============================================================================

/**
 * Run the complete backfill pipeline:
 * Phase 1 - Import scrobbles from Last.fm
 * Phase 2 - Fetch similarity data for imported songs
 * Phase 3 - Recalculate compound scores
 */
export async function runFullBackfillPipeline(
  options: BackfillOptions,
  job: BackfillJob,
): Promise<void> {
  try {
    // Phase 1: Import scrobbles
    console.log(`📥 [Backfill] Pipeline Phase 1: Importing scrobbles...`);
    const importResult = await runScrobbleBackfill({
      ...options,
      onProgress: (progress) => {
        job.progress = progress;
        updateJobEvent(job, {
          phase: 'import',
          page: progress.currentPage,
          totalPages: progress.totalPages,
          imported: progress.imported,
          skipped: progress.skipped,
          total: progress.totalScrobbles,
        });
      },
    });

    if (importResult.status === 'error') {
      updateJobEvent(job, { phase: 'error', error: importResult.error || 'Import failed' });
      return;
    }

    updateJobEvent(job, {
      phase: 'import',
      status: 'completed',
      imported: importResult.imported,
      skipped: importResult.skipped,
    });

    // Phase 2: Fetch similarity data
    console.log(`📥 [Backfill] Pipeline Phase 2: Fetching similarities...`);
    await runSimilarityBackfill(options.userId, job);

    // Phase 3: Recalculate compound scores
    console.log(`📥 [Backfill] Pipeline Phase 3: Recalculating scores...`);
    updateJobEvent(job, { phase: 'scoring', status: 'running' });

    const { calculateFullUserProfile } = await import('./compound-scoring');
    const profileResult = await calculateFullUserProfile(options.userId);

    updateJobEvent(job, {
      phase: 'scoring',
      status: 'completed',
      scores: profileResult.compoundScores,
    });

    // Done
    updateJobEvent(job, { phase: 'done' });
    console.log(`📥 [Backfill] Pipeline complete for user ${options.userId}`);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown pipeline error';
    console.error('📥 [Backfill] Pipeline error:', error);
    updateJobEvent(job, { phase: 'error', error: message });
  } finally {
    finishBackfillJob(options.userId);
  }
}
