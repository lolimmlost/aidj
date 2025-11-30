/**
 * Artist Blocklist Service
 * Manages artists that should be excluded from recommendations
 *
 * This is a configurable service that replaces hardcoded artist exclusions.
 * Users can add/remove artists from their personal blocklist, and there's
 * a system-level list for known problematic patterns (e.g., test tracks).
 */

import { db } from '../db';
import { userPreferences } from '../db/schema';
import { eq } from 'drizzle-orm';

// Cache for user blocklists
const blocklistCache = new Map<string, { blocklist: Set<string>; timestamp: number }>();
const BLOCKLIST_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * System-level blocklist for known problematic patterns
 * These are typically test tracks, placeholder content, or artists
 * that consistently cause matching issues
 */
export const SYSTEM_BLOCKLIST_PATTERNS: string[] = [
  // Add known problematic patterns here
  // These should be lowercase for case-insensitive matching
];

/**
 * Get the user's artist blocklist from preferences
 */
export async function getUserBlocklist(userId: string): Promise<Set<string>> {
  // Check cache first
  const cached = blocklistCache.get(userId);
  if (cached && Date.now() - cached.timestamp < BLOCKLIST_CACHE_TTL_MS) {
    return cached.blocklist;
  }

  try {
    const prefs = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
      .then(rows => rows[0]);

    // Extract blocklist from preferences (stored as array in recommendationSettings)
    const blocklist = new Set<string>(
      (prefs?.recommendationSettings?.artistBlocklist || [])
        .map((a: string) => a.toLowerCase())
    );

    // Cache the result
    blocklistCache.set(userId, { blocklist, timestamp: Date.now() });

    return blocklist;
  } catch (error) {
    console.error('Failed to load user blocklist:', error);
    return new Set();
  }
}

/**
 * Check if an artist should be blocked from recommendations
 * @param artist - Artist name to check
 * @param userId - Optional user ID for personalized blocklist
 * @param userBlocklist - Optional pre-fetched user blocklist for performance
 */
export function isArtistBlocked(
  artist: string,
  userBlocklist?: Set<string>
): boolean {
  if (!artist) return false;

  const artistLower = artist.toLowerCase().trim();

  // Check system-level blocklist patterns
  for (const pattern of SYSTEM_BLOCKLIST_PATTERNS) {
    if (artistLower.includes(pattern)) {
      return true;
    }
  }

  // Check user blocklist if provided
  if (userBlocklist && userBlocklist.has(artistLower)) {
    return true;
  }

  return false;
}

/**
 * Add an artist to the user's blocklist
 */
export async function addToBlocklist(userId: string, artist: string): Promise<void> {
  try {
    const prefs = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
      .then(rows => rows[0]);

    const currentBlocklist: string[] = prefs?.recommendationSettings?.artistBlocklist || [];
    const artistLower = artist.toLowerCase().trim();

    if (!currentBlocklist.includes(artistLower)) {
      const updatedBlocklist = [...currentBlocklist, artistLower];

      await db
        .update(userPreferences)
        .set({
          recommendationSettings: {
            ...prefs?.recommendationSettings,
            artistBlocklist: updatedBlocklist,
          },
        })
        .where(eq(userPreferences.userId, userId));

      // Clear cache
      blocklistCache.delete(userId);
    }
  } catch (error) {
    console.error('Failed to add artist to blocklist:', error);
    throw error;
  }
}

/**
 * Remove an artist from the user's blocklist
 */
export async function removeFromBlocklist(userId: string, artist: string): Promise<void> {
  try {
    const prefs = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
      .then(rows => rows[0]);

    const currentBlocklist: string[] = prefs?.recommendationSettings?.artistBlocklist || [];
    const artistLower = artist.toLowerCase().trim();
    const updatedBlocklist = currentBlocklist.filter(a => a !== artistLower);

    await db
      .update(userPreferences)
      .set({
        recommendationSettings: {
          ...prefs?.recommendationSettings,
          artistBlocklist: updatedBlocklist,
        },
      })
      .where(eq(userPreferences.userId, userId));

    // Clear cache
    blocklistCache.delete(userId);
  } catch (error) {
    console.error('Failed to remove artist from blocklist:', error);
    throw error;
  }
}

/**
 * Clear the blocklist cache for a user
 */
export function clearBlocklistCache(userId?: string): void {
  if (userId) {
    blocklistCache.delete(userId);
  } else {
    blocklistCache.clear();
  }
}
