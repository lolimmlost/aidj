/**
 * Artist Fatigue Detection Service
 *
 * Prevents AIDJ from exhausting artist libraries by detecting when:
 * - A high percentage of an artist's songs have been played/queued recently
 * - The same artist appears too frequently in queue history
 *
 * Artists on cooldown are temporarily blocked from recommendations.
 */

import { db } from '@/lib/db';
import { listeningHistory } from '@/lib/db/schema/listening-history.schema';
import { and, eq, gte, sql } from 'drizzle-orm';

/**
 * Configuration constants
 */
const FATIGUE_THRESHOLD = 0.8;  // 80% of artist's songs played/queued
const COOLDOWN_HOURS = 48;      // 48-hour cooldown period
const LOOKBACK_HOURS = 72;      // Check last 72 hours of listening history

/**
 * Artist fatigue entry
 */
export interface ArtistFatigue {
  artist: string;
  totalSongs: number;
  playedSongs: number;
  fatiguePercentage: number;
  onCooldown: boolean;
  cooldownUntil?: number;  // Unix timestamp (ms)
  lastPlayed?: number;      // Unix timestamp (ms)
}

/**
 * Calculate artist fatigue for a user
 * Returns artists that are on cooldown or approaching fatigue
 *
 * Simplified approach: Uses play frequency instead of library percentage
 * If an artist has been played >8 unique songs in last 72 hours, they go on cooldown
 */
export async function calculateArtistFatigue(
  userId: string,
  artistsToCheck?: string[]
): Promise<Map<string, ArtistFatigue>> {
  const now = Date.now();
  const lookbackTime = new Date(now - LOOKBACK_HOURS * 60 * 60 * 1000);

  // Get recently played songs by artist from listening history
  const whereClause = and(
    eq(listeningHistory.userId, userId),
    gte(listeningHistory.playedAt, lookbackTime)
  );

  const recentPlays = await db
    .select({
      artist: listeningHistory.artist,
      playedSongs: sql<number>`COUNT(DISTINCT ${listeningHistory.songId})`.as('played_songs'),
      totalPlays: sql<number>`COUNT(*)`.as('total_plays'),
      lastPlayed: sql<Date>`MAX(${listeningHistory.playedAt})`.as('last_played'),
    })
    .from(listeningHistory)
    .where(whereClause)
    .groupBy(listeningHistory.artist);

  // Build fatigue map
  const fatigueMap = new Map<string, ArtistFatigue>();

  for (const play of recentPlays) {
    const artistName = play.artist;
    if (!artistName) continue;

    // Filter by specific artists if provided
    if (artistsToCheck && artistsToCheck.length > 0) {
      const matchesFilter = artistsToCheck.some(
        a => a.toLowerCase() === artistName.toLowerCase()
      );
      if (!matchesFilter) continue;
    }

    const playedSongs = play.playedSongs;
    // Convert Date to timestamp (ms) if it exists
    const lastPlayed = play.lastPlayed ? new Date(play.lastPlayed).getTime() : undefined;

    // Simplified fatigue: If >8 unique songs played in 72hrs, assume approaching exhaustion
    // This threshold works well for small artists (10-15 songs) and large artists (50+ songs)
    const FATIGUE_SONG_THRESHOLD = 8;
    const onCooldown = playedSongs >= FATIGUE_SONG_THRESHOLD;

    // For reporting, estimate total songs as playedSongs / 0.8 (assume we hit 80% threshold)
    const estimatedTotalSongs = onCooldown ? Math.ceil(playedSongs / FATIGUE_THRESHOLD) : playedSongs * 2;
    const fatiguePercentage = playedSongs / estimatedTotalSongs;

    // Calculate cooldown end time if on cooldown
    const cooldownUntil = onCooldown && lastPlayed
      ? lastPlayed + (COOLDOWN_HOURS * 60 * 60 * 1000)
      : undefined;

    // Check if cooldown has expired
    const isCooldownActive = cooldownUntil ? cooldownUntil > now : false;

    fatigueMap.set(artistName, {
      artist: artistName,
      totalSongs: estimatedTotalSongs,
      playedSongs,
      fatiguePercentage,
      onCooldown: isCooldownActive,
      cooldownUntil,
      lastPlayed,
    });
  }

  return fatigueMap;
}

/**
 * Check if a specific artist is on cooldown
 */
export async function isArtistOnCooldown(
  userId: string,
  artist: string
): Promise<boolean> {
  const fatigueMap = await calculateArtistFatigue(userId, [artist]);
  const fatigue = fatigueMap.get(artist);
  return fatigue?.onCooldown || false;
}

/**
 * Get all artists currently on cooldown for a user
 */
export async function getArtistsOnCooldown(
  userId: string
): Promise<string[]> {
  const fatigueMap = await calculateArtistFatigue(userId);
  return Array.from(fatigueMap.values())
    .filter(f => f.onCooldown)
    .map(f => f.artist);
}

/**
 * Filter out artists on cooldown from a list of songs
 * Used by recommendations to exclude fatigued artists
 */
export async function filterOutFatiguedArtists<T extends { artist: string }>(
  songs: T[],
  userId: string
): Promise<T[]> {
  if (songs.length === 0) return songs;

  // Get unique artists from songs
  const uniqueArtists = [...new Set(songs.map(s => s.artist))];

  // Calculate fatigue for these artists
  const fatigueMap = await calculateArtistFatigue(userId, uniqueArtists);

  // Filter out songs from fatigued artists
  return songs.filter(song => {
    const fatigue = fatigueMap.get(song.artist);
    return !fatigue || !fatigue.onCooldown;
  });
}

/**
 * Get artist fatigue statistics for display/debugging
 */
export async function getArtistFatigueStats(
  userId: string
): Promise<{
  onCooldown: ArtistFatigue[];
  approaching: ArtistFatigue[];
  healthy: ArtistFatigue[];
}> {
  const fatigueMap = await calculateArtistFatigue(userId);
  const allFatigue = Array.from(fatigueMap.values());

  return {
    onCooldown: allFatigue.filter(f => f.onCooldown),
    approaching: allFatigue.filter(
      f => !f.onCooldown && f.fatiguePercentage >= 0.6
    ),
    healthy: allFatigue.filter(f => f.fatiguePercentage < 0.6),
  };
}

/**
 * Get time remaining on cooldown for an artist (in ms)
 * Returns 0 if not on cooldown
 */
export function getCooldownRemaining(fatigue: ArtistFatigue): number {
  if (!fatigue.onCooldown || !fatigue.cooldownUntil) return 0;
  const remaining = fatigue.cooldownUntil - Date.now();
  return Math.max(0, remaining);
}

/**
 * Format cooldown time remaining as human-readable string
 */
export function formatCooldownRemaining(fatigue: ArtistFatigue): string {
  const ms = getCooldownRemaining(fatigue);
  if (ms === 0) return 'No cooldown';

  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}
