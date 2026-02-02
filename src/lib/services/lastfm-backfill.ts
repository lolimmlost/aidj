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
 * - Progress tracking for UI feedback
 * - Configurable date range
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 3.1
 */

import { db } from '../db';
import { listeningHistory } from '../db/schema';
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
