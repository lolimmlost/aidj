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
  libraryReconciliationState,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  getSongsByIds,
  search as navidromeSearch,
  buildSubsonicUrl,
  apiFetch,
} from './navidrome';
import type { LibraryReconciliationState } from '@/lib/db/schema';
import { getNavidromeUserCreds } from './navidrome-users';
import type { SubsonicCreds } from './navidrome-users';
import { repointSongId, describeRepoint, loadStarState } from './song-repoint';
import {
  parseArtistTitle,
  parseRealArtistTitle,
} from '@/lib/utils/song-artist-title';

/**
 * Delay before the first run after (re)initialization. Kept short so a fresh
 * deploy reconciles soon after boot rather than only after a full frequency
 * window — and so an overdue persisted schedule fires promptly without a
 * thundering-herd at the exact moment of boot.
 */
const FIRST_RUN_DELAY_MS = 3 * 60 * 1000; // 3 minutes

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
  /** Dead at detection but alive again on the pre-write re-check — left alone. */
  revived?: number;
  /** Set when the run wrote nothing (or stopped early) because Navidrome was scanning. */
  skipped?: 'scan_in_progress';
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
    // Idempotent: repeated calls (boot hook + status/trigger routes) must not
    // stack timers or reset the cadence.
    if (this.userId === userId && this.scheduledTimeoutId) {
      return;
    }

    this.userId = userId;
    if (frequencyHours !== undefined) this.frequencyHours = frequencyHours;

    // Resume cadence from persisted state so it survives restarts/redeploys.
    const state = await this.loadState();
    if (state) {
      this.enabled = state.enabled;
      this.frequencyHours = frequencyHours ?? state.frequencyHours;
      this.lastRunAt = state.lastRunAt ?? null;
      this.lastError = state.lastError ?? null;
      this.lastResult = (state.lastResult as ReconciliationResult | null) ?? null;
    }

    if (this.enabled) {
      // If we have a persisted next-run in the future, resume from it.
      // If it's overdue (or we've never run), kick a first run soon rather
      // than waiting a full frequency window — this also means a fresh deploy
      // reconciles shortly after boot instead of only `frequencyHours` later.
      let delay = FIRST_RUN_DELAY_MS;
      if (state?.nextRunAt) {
        const remaining = state.nextRunAt.getTime() - Date.now();
        delay = remaining > 0 ? remaining : FIRST_RUN_DELAY_MS;
      }
      this.scheduleNextRun(delay);
    }

    // Persist (creates the row on first ever init).
    await this.saveState();

    console.log(
      `[LibraryReconciliation] Initialized for user ${userId}, every ${this.frequencyHours}h` +
        (this.nextRunAt ? `, next run ${this.nextRunAt.toISOString()}` : ', disabled')
    );
  }

  private async loadState(): Promise<LibraryReconciliationState | null> {
    if (!this.userId) return null;
    try {
      const rows = await db
        .select()
        .from(libraryReconciliationState)
        .where(eq(libraryReconciliationState.userId, this.userId))
        .limit(1);
      return rows[0] ?? null;
    } catch (err) {
      console.error('[LibraryReconciliation] loadState failed:', err);
      return null;
    }
  }

  private async saveState(): Promise<void> {
    if (!this.userId) return;
    try {
      const values = {
        userId: this.userId,
        enabled: this.enabled,
        frequencyHours: this.frequencyHours,
        lastRunAt: this.lastRunAt,
        nextRunAt: this.nextRunAt,
        isRunning: this.isRunning,
        lastError: this.lastError,
        lastResult: this.lastResult,
        updatedAt: new Date(),
      };
      await db
        .insert(libraryReconciliationState)
        .values(values)
        .onConflictDoUpdate({
          target: libraryReconciliationState.userId,
          set: {
            enabled: values.enabled,
            frequencyHours: values.frequencyHours,
            lastRunAt: values.lastRunAt,
            nextRunAt: values.nextRunAt,
            isRunning: values.isRunning,
            lastError: values.lastError,
            lastResult: values.lastResult,
            updatedAt: values.updatedAt,
          },
        });
    } catch (err) {
      console.error('[LibraryReconciliation] saveState failed:', err);
    }
  }

  start(): void {
    this.enabled = true;
    this.scheduleNextRun();
    void this.saveState();
  }

  stop(): void {
    this.enabled = false;
    if (this.scheduledTimeoutId) {
      clearTimeout(this.scheduledTimeoutId);
      this.scheduledTimeoutId = null;
    }
    this.nextRunAt = null;
    void this.saveState();
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
    void this.saveState();
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
      // Persist run outcome + the freshly computed nextRunAt so cadence and
      // status survive a restart.
      await this.saveState();
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

/**
 * True while Navidrome is scanning — or when we can't tell. Mid-scan, files in a
 * rescanned folder briefly read as missing (stream HEAD fails), so a retagged
 * song whose id Navidrome is about to KEEP looks dead. Repointing it then moves
 * its likes/plays/playlists onto whatever the matcher found — a merge that
 * can't be undone. Seen live 2026-09-30: 165 "dead" mid-scan, 8 after.
 */
async function isScanRunning(): Promise<boolean> {
  try {
    const resp = await fetch(buildSubsonicUrl('getScanStatus').toString());
    const data = (await resp.json()) as { 'subsonic-response'?: { scanStatus?: { scanning?: boolean } } };
    const status = data['subsonic-response']?.scanStatus;
    return !status || status.scanning === true;
  } catch {
    return true;
  }
}

/** Re-check right before writing: the id resolves AND streams audio again. */
async function isAlive(songId: string): Promise<boolean> {
  try {
    const [song] = await getSongsByIds([songId]);
    return !!song && (await isStreamable(songId));
  } catch {
    return false;
  }
}

/**
 * Find dead song ids for a user and repoint each to its live replacement.
 * Skips the whole run while Navidrome is scanning, and re-verifies each dead id
 * (and the scan state) immediately before repointing it.
 * `dryRun`: detection and matching run for real (read-only), every repoint rolls
 * back, and nothing is written to Navidrome (no star, mirror or scan) — a preview.
 */
export async function reconcileLibrary(
  userId: string,
  options: { dryRun?: boolean } = {},
): Promise<ReconciliationResult> {
  const startMs = Date.now();
  const details: RemapDetail[] = [];
  const missingFromLibrary: MissingSong[] = [];

  if (await isScanRunning()) {
    console.log('[LibraryReconciliation] Navidrome is scanning — skipping this run');
    return {
      checkedIds: 0, deadIds: 0, remapped: 0, notFound: 0, scanTriggered: false,
      details, missingFromLibrary, durationMs: Date.now() - startMs,
      revived: 0, skipped: 'scan_in_progress',
    };
  }

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
        // Needed to remap: a dead Navidrome id can't be resolved via getSong, so
        // the cached "Artist - Title" on the row is the ONLY metadata we have to
        // search the library with. Omitting it made every playlist-only dead id
        // unremappable (see the loop below).
        songArtistTitle: playlistSongs.songArtistTitle,
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
      const { artist, title } = parseArtistTitle(row.songArtistTitle);
      idMeta.set(row.songId, { artist, title, sources: new Set(['recommendation_feedback']) });
    }
  }

  for (const row of playlistRows) {
    const existing = idMeta.get(row.songId);
    if (existing) {
      existing.sources.add('playlist_songs');
      // A feedback row may have registered this id first with empty metadata
      // (its own songArtistTitle was null); fill it in if the playlist row has it.
      if (!existing.artist && !existing.title) {
        const { artist, title } = parseArtistTitle(row.songArtistTitle);
        existing.artist = artist;
        existing.title = title;
      }
    } else {
      // Parse the cached "Artist - Title" exactly as the feedback branch does.
      // Leaving these empty made every playlist-only dead id fail the
      // "no artist+title to search with" guard below, so it was recorded as
      // notFound without a single library lookup ever being attempted — which is
      // why a real prod run reported 7 deadIds / 7 notFound / 0 remapped.
      const { artist, title } = parseArtistTitle(row.songArtistTitle);
      idMeta.set(row.songId, {
        artist,
        title,
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
    { artist: string; title: string; sources: Set<string>; duration?: number }
  >();
  // Cache duration from getSongsByIds for songs that pass metadata but fail stream
  const songDurations = new Map<string, number>();

  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH);
    try {
      const songs = await getSongsByIds(batch);
      const foundIds = new Set(songs.map((s) => s.id));
      for (const s of songs) {
        if (s.duration) songDurations.set(s.id, s.duration);
      }
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
          } else if (songs[0].duration) {
            songDurations.set(id, songs[0].duration);
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
          if (meta) {
            deadIds.set(id, { ...meta, duration: songDurations.get(id) });
          }
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
  let revived = 0;
  let skipped: ReconciliationResult['skipped'];

  // Get per-user Navidrome creds for star operations
  let userCreds: SubsonicCreds | null = null;
  try {
    userCreds = await getNavidromeUserCreds(userId);
  } catch {
    // Will fall back to admin creds for star operations
  }

  // Load stars once for the whole run (live + ghost, see loadStarState / GH #130);
  // repointSongId keeps the sets current as it moves stars.
  const stars = await loadStarState(userCreds);

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

    const cleanTitle = meta.title
      .replace(/\s*\((?:remaster|remastered|deluxe|anniversary|expanded|bonus|\d{4})[^)]*\)/gi, '')
      .replace(/\s*\[(?:remaster|remastered|deluxe|anniversary|expanded|bonus|\d{4})[^\]]*\]/gi, '')
      .replace(/\s*-\s*(?:.*\b(?:remaster|remastered)\b.*)$/gi, '')
      .trim() || meta.title;
    const query = `${meta.artist} ${cleanTitle}`;
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

      // Fallback: native API title search (bypasses search3 AND-matching)
      // Build candidate title variants: the cleanTitle, plus MeTube-parsed title
      // (strips embedded "Artist - " prefix and parenthetical tags like "(Chillsynth)")
      if (!match) {
        const titleVariants = new Set<string>();
        if (cleanTitle) titleVariants.add(cleanTitle);
        if (meta.title.includes(' - ')) {
          const parsed = parseRealArtistTitle(meta.artist, meta.title);
          const stripped = parsed.title.replace(/\s*\([^)]+\)\s*$/g, '').trim();
          if (stripped.length > 2) titleVariants.add(stripped);
          if (parsed.title !== stripped && parsed.title.length > 2) titleVariants.add(parsed.title);
        }

        for (const searchTitle of titleVariants) {
          if (match) break;
          try {
            const nativeSongs = await apiFetch<Array<{ id: string; title: string; artist: string; duration: number }>>(
              `/api/song?_start=0&_end=10&_order=ASC&_sort=title&title=${encodeURIComponent(searchTitle)}`
            );
            const candidates = nativeSongs.filter((r) => r.id !== deadId);
            for (const r of candidates) {
              if (
                isArtistMatch(r.artist || '', meta.artist) &&
                isTitleMatch(r.title || '', meta.title) &&
                (await isStreamable(r.id))
              ) {
                match = { id: r.id, artist: r.artist, title: r.title };
                break;
              }
            }
            // Picard/MusicBrainz can retag with a completely wrong artist.
            // If title matches and duration is within 3s, accept despite artist mismatch.
            if (!match && meta.duration) {
              for (const r of candidates) {
                if (
                  isTitleMatch(r.title || '', searchTitle) &&
                  r.duration && Math.abs(r.duration - meta.duration) < 3 &&
                  (await isStreamable(r.id))
                ) {
                  console.log(`[LibraryReconciliation] Duration match: "${meta.artist} - ${meta.title}" → "${r.artist} - ${r.title}" (${meta.duration}s ≈ ${r.duration}s)`);
                  match = { id: r.id, artist: r.artist, title: r.title };
                  break;
                }
              }
            }
          } catch {
            // native API not available, skip
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
      console.log(`[LibraryReconciliation] Missing: "${meta.artist} - ${meta.title}" (${deadId})`);
      missingFromLibrary.push({
        oldId: deadId,
        artist: meta.artist,
        title: meta.title,
        source: [...meta.sources].join(', '),
      });
      continue;
    }

    // ── 3b. Re-verify just before writing (a scan may have started) ────

    if (await isScanRunning()) {
      console.log('[LibraryReconciliation] Navidrome started scanning — stopping; the rest waits for the next run');
      skipped = 'scan_in_progress';
      break;
    }
    if (await isAlive(deadId)) {
      console.log(`[LibraryReconciliation] ${deadId} is alive again — not repointing`);
      revived++;
      continue;
    }

    // ── 4.  Remap references (single owner: song-repoint, #221) ────────

    let tablesUpdated: string[];
    try {
      const result = await repointSongId({
        userId,
        oldId: deadId,
        newId: match.id,
        artist: match.artist,
        title: match.title,
        creds: userCreds,
        stars,
        dryRun: options.dryRun,
      });
      tablesUpdated = describeRepoint(result);
    } catch (err) {
      // The transaction rolled back, so nothing was half-written; retry next run.
      console.warn(`[LibraryReconciliation] Repoint failed for ${deadId} → ${match.id}:`, err);
      continue;
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
  if (deadIds.size > 0 && !options.dryRun) {
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
    revived,
    skipped,
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
