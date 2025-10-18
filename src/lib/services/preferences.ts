/**
 * User Preference Profile Service
 * Aggregates user feedback into actionable preference summaries for personalization
 */

import { db } from '../db';
import { recommendationFeedback } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface UserPreferenceProfile {
  userId: string;
  likedArtists: Array<{ artist: string; count: number }>;
  dislikedArtists: Array<{ artist: string; count: number }>;
  likedSongs: Array<{ songArtistTitle: string; timestamp: Date }>;
  dislikedSongs: Array<{ songArtistTitle: string; timestamp: Date }>;
  totalFeedbackCount: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
  feedbackRatio: number; // thumbsUp / total (0.0 - 1.0)
}

export interface ListeningPatterns {
  hasEnoughData: boolean; // At least 5 feedback entries
  preferredArtists: string[]; // Top 3 liked artists
  avoidedArtists: string[]; // Top 2 disliked artists
  insights: string[]; // Human-readable insights
}

// In-memory cache for preference profiles (30-minute TTL)
interface CachedProfile {
  profile: UserPreferenceProfile;
  timestamp: number;
}

const preferenceCache = new Map<string, CachedProfile>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Extract artist name from "Artist - Title" format
 */
function extractArtist(songArtistTitle: string): string {
  const parts = songArtistTitle.split(' - ');
  return parts[0]?.trim() || songArtistTitle;
}

/**
 * Build comprehensive user preference profile from feedback data
 */
export async function buildUserPreferenceProfile(userId: string): Promise<UserPreferenceProfile> {
  // Check cache first
  const cached = preferenceCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.profile;
  }

  // Fetch all user feedback
  const allFeedback = await db
    .select()
    .from(recommendationFeedback)
    .where(eq(recommendationFeedback.userId, userId))
    .orderBy(desc(recommendationFeedback.timestamp));

  // Separate into liked/disliked
  const likedFeedback = allFeedback.filter(f => f.feedbackType === 'thumbs_up');
  const dislikedFeedback = allFeedback.filter(f => f.feedbackType === 'thumbs_down');

  // Aggregate artists
  const likedArtistCounts = new Map<string, number>();
  const dislikedArtistCounts = new Map<string, number>();

  for (const feedback of likedFeedback) {
    const artist = extractArtist(feedback.songArtistTitle);
    likedArtistCounts.set(artist, (likedArtistCounts.get(artist) || 0) + 1);
  }

  for (const feedback of dislikedFeedback) {
    const artist = extractArtist(feedback.songArtistTitle);
    dislikedArtistCounts.set(artist, (dislikedArtistCounts.get(artist) || 0) + 1);
  }

  // Convert to sorted arrays
  const likedArtists = Array.from(likedArtistCounts.entries())
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count);

  const dislikedArtists = Array.from(dislikedArtistCounts.entries())
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count);

  const profile: UserPreferenceProfile = {
    userId,
    likedArtists,
    dislikedArtists,
    likedSongs: likedFeedback.map(f => ({
      songArtistTitle: f.songArtistTitle,
      timestamp: f.timestamp,
    })),
    dislikedSongs: dislikedFeedback.map(f => ({
      songArtistTitle: f.songArtistTitle,
      timestamp: f.timestamp,
    })),
    totalFeedbackCount: allFeedback.length,
    thumbsUpCount: likedFeedback.length,
    thumbsDownCount: dislikedFeedback.length,
    feedbackRatio: allFeedback.length > 0 ? likedFeedback.length / allFeedback.length : 0,
  };

  // Cache the profile
  preferenceCache.set(userId, {
    profile,
    timestamp: Date.now(),
  });

  return profile;
}

/**
 * Get top liked artists for a user
 */
export async function getLikedArtists(userId: string, limit = 10): Promise<Array<{ artist: string; count: number }>> {
  const profile = await buildUserPreferenceProfile(userId);
  return profile.likedArtists.slice(0, limit);
}

/**
 * Get top disliked artists for a user
 */
export async function getDislikedArtists(userId: string, limit = 5): Promise<Array<{ artist: string; count: number }>> {
  const profile = await buildUserPreferenceProfile(userId);
  return profile.dislikedArtists.slice(0, limit);
}

/**
 * Analyze listening patterns and generate insights
 */
export async function getListeningPatterns(userId: string): Promise<ListeningPatterns> {
  const profile = await buildUserPreferenceProfile(userId);

  const hasEnoughData = profile.totalFeedbackCount >= 5;

  const preferredArtists = profile.likedArtists.slice(0, 3).map(a => a.artist);
  const avoidedArtists = profile.dislikedArtists.slice(0, 2).map(a => a.artist);

  const insights: string[] = [];

  if (!hasEnoughData) {
    insights.push('Not enough feedback data yet. Keep rating songs to improve recommendations!');
  } else {
    // Generate insights based on data
    if (profile.feedbackRatio > 0.7) {
      insights.push('You have positive taste! Most songs get a thumbs up.');
    } else if (profile.feedbackRatio < 0.3) {
      insights.push('You have selective taste. Looking for very specific music.');
    }

    if (preferredArtists.length > 0) {
      insights.push(`You love ${preferredArtists.slice(0, 2).join(' and ')}`);
    }

    if (avoidedArtists.length > 0) {
      insights.push(`You tend to avoid ${avoidedArtists[0]}`);
    }

    // Check for recent preference changes
    const recentFeedback = profile.likedSongs.slice(0, 5);
    const recentArtists = new Set(recentFeedback.map(s => extractArtist(s.songArtistTitle)));
    if (recentArtists.size === 1 && profile.totalFeedbackCount > 10) {
      insights.push(`Recently focused on ${Array.from(recentArtists)[0]}`);
    }
  }

  return {
    hasEnoughData,
    preferredArtists,
    avoidedArtists,
    insights,
  };
}

/**
 * Clear preference cache for a user (call after new feedback submitted)
 */
export function clearPreferenceCache(userId: string): void {
  preferenceCache.delete(userId);
}

/**
 * Clear all preference caches (for testing or maintenance)
 */
export function clearAllPreferenceCaches(): void {
  preferenceCache.clear();
}
