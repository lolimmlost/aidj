/**
 * Time-Based Discovery Service
 *
 * Provides personalized music recommendations based on:
 * - Time of day patterns (morning, afternoon, evening, night)
 * - Day of week patterns (weekday vs weekend listening)
 * - User listening history and preferences
 * - Context detection (workout, focus, relaxation, etc.)
 *
 * @see docs/features/personalized-music-discovery-feed.md
 */

import { db } from '@/lib/db';
import { eq, and, desc, sql, gte, lte, isNull, or } from 'drizzle-orm';
import {
  listeningPatterns,
  discoveryFeedItems,
  type TimeSlot,
  type ListeningContext,
  type ListeningPattern,
  type DiscoveryFeedItem,
  type DiscoveryFeedItemInsert,
} from '@/lib/db/schema/discovery-feed.schema';
import { listeningHistory } from '@/lib/db/schema/listening-history.schema';
import { getRecommendations, type RecommendationResult } from './recommendations';
import { getCompoundScoredRecommendations } from './compound-scoring';
import type { Song } from '@/lib/types/song';

// ============================================================================
// Types
// ============================================================================

export interface TimeContext {
  timeSlot: TimeSlot;
  dayOfWeek: number; // 0-6 (Sunday = 0)
  hour: number;
  isWeekend: boolean;
}

export interface DiscoveryFeedRequest {
  userId: string;
  limit?: number;
  includeExisting?: boolean; // Whether to include already-shown items
  timeContext?: TimeContext; // Override current time context
  context?: ListeningContext; // Specific context to filter for
}

export interface DiscoveryFeedResponse {
  items: DiscoveryFeedItem[];
  timeContext: TimeContext;
  pattern?: ListeningPattern | null;
  hasMore: boolean;
}

export interface PatternUpdateResult {
  pattern: ListeningPattern;
  isNew: boolean;
}

// ============================================================================
// Time Context Utilities
// ============================================================================

/**
 * Get the current time slot based on hour of day
 * - Morning: 5:00 - 10:59
 * - Afternoon: 11:00 - 16:59
 * - Evening: 17:00 - 20:59
 * - Night: 21:00 - 4:59
 */
export function getTimeSlot(hour: number): TimeSlot {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Get the current time context
 */
export function getCurrentTimeContext(): TimeContext {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  return {
    timeSlot: getTimeSlot(hour),
    dayOfWeek,
    hour,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
  };
}

/**
 * Detect listening context based on various signals
 * This is a simplified version - in production, you'd use more sophisticated signals
 */
export function detectListeningContext(
  avgBpm?: number,
  avgEnergy?: number,
  timeSlot?: TimeSlot
): ListeningContext {
  // High energy + high BPM likely workout
  if (avgBpm && avgBpm > 120 && avgEnergy && avgEnergy > 0.7) {
    return 'workout';
  }

  // Low energy + moderate BPM likely focus
  if (avgEnergy && avgEnergy < 0.5 && avgBpm && avgBpm > 60 && avgBpm < 120) {
    return 'focus';
  }

  // Low energy + low BPM likely relaxation
  if (avgEnergy && avgEnergy < 0.4 && avgBpm && avgBpm < 80) {
    return 'relaxation';
  }

  // Morning time slot often correlates with commute
  if (timeSlot === 'morning') {
    return 'commute';
  }

  return 'general';
}

// ============================================================================
// Pattern Analysis
// ============================================================================

/**
 * Analyze and update listening patterns for a user
 * Called after each listening session to update time-based preferences
 */
export async function updateListeningPattern(
  userId: string,
  songData: {
    genre?: string;
    bpm?: number;
    energy?: number;
    mood?: string;
  },
  timeContext?: TimeContext
): Promise<PatternUpdateResult> {
  const context = timeContext || getCurrentTimeContext();

  // Find existing pattern
  const existingPattern = await db
    .select()
    .from(listeningPatterns)
    .where(
      and(
        eq(listeningPatterns.userId, userId),
        eq(listeningPatterns.timeSlot, context.timeSlot),
        eq(listeningPatterns.dayOfWeek, context.dayOfWeek)
      )
    )
    .limit(1)
    .then(rows => rows[0]);

  if (existingPattern) {
    // Update existing pattern
    const newSampleCount = existingPattern.sampleCount + 1;

    // Update genre preferences
    const topGenres = [...(existingPattern.topGenres || [])];
    if (songData.genre) {
      const existingGenre = topGenres.find(g => g.genre === songData.genre);
      if (existingGenre) {
        existingGenre.count += 1;
      } else {
        topGenres.push({ genre: songData.genre, count: 1, avgRating: 0 });
      }
      // Sort by count and keep top 10
      topGenres.sort((a, b) => b.count - a.count);
      topGenres.splice(10);
    }

    // Update mood preferences
    const topMoods = [...(existingPattern.topMoods || [])];
    if (songData.mood) {
      const existingMood = topMoods.find(m => m.mood === songData.mood);
      if (existingMood) {
        existingMood.count += 1;
      } else {
        topMoods.push({ mood: songData.mood, count: 1 });
      }
      topMoods.sort((a, b) => b.count - a.count);
      topMoods.splice(5);
    }

    // Update averages using incremental average formula
    let avgBpm = existingPattern.avgBpm || 0;
    if (songData.bpm) {
      avgBpm = avgBpm + (songData.bpm - avgBpm) / newSampleCount;
    }

    let avgEnergy = existingPattern.avgEnergy || 0.5;
    if (songData.energy !== undefined) {
      avgEnergy = avgEnergy + (songData.energy - avgEnergy) / newSampleCount;
    }

    // Detect context
    const primaryContext = detectListeningContext(avgBpm, avgEnergy, context.timeSlot);

    // Update the pattern
    await db
      .update(listeningPatterns)
      .set({
        topGenres,
        topMoods,
        avgBpm: Math.round(avgBpm),
        avgEnergy,
        primaryContext,
        sampleCount: newSampleCount,
        lastUpdated: new Date(),
      })
      .where(eq(listeningPatterns.id, existingPattern.id));

    const updatedPattern = await db
      .select()
      .from(listeningPatterns)
      .where(eq(listeningPatterns.id, existingPattern.id))
      .then(rows => rows[0]);

    return { pattern: updatedPattern, isNew: false };
  } else {
    // Create new pattern
    const topGenres = songData.genre
      ? [{ genre: songData.genre, count: 1, avgRating: 0 }]
      : [];

    const topMoods = songData.mood
      ? [{ mood: songData.mood, count: 1 }]
      : [];

    const primaryContext = detectListeningContext(
      songData.bpm,
      songData.energy,
      context.timeSlot
    );

    const newPatternId = crypto.randomUUID();

    await db.insert(listeningPatterns).values({
      id: newPatternId,
      userId,
      timeSlot: context.timeSlot,
      dayOfWeek: context.dayOfWeek,
      topGenres,
      topMoods,
      avgBpm: songData.bpm ? Math.round(songData.bpm) : null,
      avgEnergy: songData.energy ?? 0.5,
      primaryContext,
      sampleCount: 1,
    });

    const newPattern = await db
      .select()
      .from(listeningPatterns)
      .where(eq(listeningPatterns.id, newPatternId))
      .then(rows => rows[0]);

    return { pattern: newPattern, isNew: true };
  }
}

/**
 * Get listening pattern for current time context
 * Falls back to any pattern for the same time slot if no exact day match exists
 */
export async function getCurrentPattern(
  userId: string,
  timeContext?: TimeContext
): Promise<ListeningPattern | null> {
  const context = timeContext || getCurrentTimeContext();

  // First try to find an exact match for this time slot + day of week
  const exactPattern = await db
    .select()
    .from(listeningPatterns)
    .where(
      and(
        eq(listeningPatterns.userId, userId),
        eq(listeningPatterns.timeSlot, context.timeSlot),
        eq(listeningPatterns.dayOfWeek, context.dayOfWeek)
      )
    )
    .limit(1)
    .then(rows => rows[0] || null);

  if (exactPattern) {
    return exactPattern;
  }

  // Fallback: get the pattern with highest sample count for this time slot
  // This allows recommendations even on days where user hasn't listened at this time
  const fallbackPattern = await db
    .select()
    .from(listeningPatterns)
    .where(
      and(
        eq(listeningPatterns.userId, userId),
        eq(listeningPatterns.timeSlot, context.timeSlot)
      )
    )
    .orderBy(desc(listeningPatterns.sampleCount))
    .limit(1)
    .then(rows => rows[0] || null);

  if (fallbackPattern) {
    console.log(`📊 [TimeBasedDiscovery] Using fallback pattern from day ${fallbackPattern.dayOfWeek} for ${context.timeSlot}`);
  }

  return fallbackPattern;
}

/**
 * Get all patterns for a user (for analytics/visualization)
 */
export async function getUserPatterns(userId: string): Promise<ListeningPattern[]> {
  const patterns = await db
    .select()
    .from(listeningPatterns)
    .where(eq(listeningPatterns.userId, userId))
    .orderBy(listeningPatterns.dayOfWeek, listeningPatterns.timeSlot);

  return patterns;
}

// ============================================================================
// Discovery Feed Generation
// ============================================================================

/**
 * Generate personalized discovery feed based on time patterns
 */
export async function generateDiscoveryFeed(
  request: DiscoveryFeedRequest
): Promise<DiscoveryFeedResponse> {
  const { userId, limit = 20, includeExisting = false, context } = request;
  const timeContext = request.timeContext || getCurrentTimeContext();

  console.log(`🕐 [TimeBasedDiscovery] Generating feed for user ${userId}`);
  console.log(`📅 Time context: ${timeContext.timeSlot}, day ${timeContext.dayOfWeek}`);

  // Get current listening pattern
  const pattern = await getCurrentPattern(userId, timeContext);

  if (pattern) {
    console.log(`📊 Found pattern with ${pattern.sampleCount} samples`);
    console.log(`🎵 Top genres: ${pattern.topGenres?.map(g => g.genre).join(', ') || 'none'}`);
  }

  // Check for existing unexpired feed items
  if (includeExisting) {
    const existingItems = await db
      .select()
      .from(discoveryFeedItems)
      .where(
        and(
          eq(discoveryFeedItems.userId, userId),
          gte(discoveryFeedItems.expiresAt, new Date()),
          or(
            eq(discoveryFeedItems.targetTimeSlot, timeContext.timeSlot),
            eq(discoveryFeedItems.targetTimeSlot, 'any')
          )
        )
      )
      .orderBy(desc(discoveryFeedItems.score))
      .limit(limit);

    if (existingItems.length >= limit) {
      console.log(`✅ Using ${existingItems.length} cached feed items`);
      return {
        items: existingItems,
        timeContext,
        pattern,
        hasMore: true,
      };
    }
  }

  // Generate new recommendations
  const feedItems: DiscoveryFeedItemInsert[] = [];

  try {
    // Strategy 1: Get compound-scored recommendations from listening history
    if (pattern && pattern.sampleCount >= 5) {
      console.log(`📈 Getting compound-scored recommendations`);
      const compoundRecs = await getCompoundScoredRecommendations(userId, {
        limit: Math.ceil(limit * 0.4),
        minSourceCount: 2,
      });

      for (const rec of compoundRecs) {
        feedItems.push(createFeedItem({
          userId,
          itemType: 'song',
          contentId: rec.songId,
          title: rec.title,
          subtitle: rec.artist,
          explanation: `Based on ${rec.sourceCount} songs you've enjoyed`,
          recommendationSource: 'compound_score',
          score: rec.score,
          targetTimeSlot: timeContext.timeSlot,
          targetContext: context || pattern?.primaryContext || 'general',
        }));
      }
    }

    // Strategy 2: Get time-pattern based recommendations
    if (pattern && pattern.topGenres && pattern.topGenres.length > 0) {
      console.log(`🎯 Getting pattern-based recommendations`);
      const topGenre = pattern.topGenres[0].genre;

      const moodResult = await getRecommendations({
        mode: 'mood',
        moodDescription: `${topGenre} music for ${timeContext.timeSlot}`,
        limit: Math.ceil(limit * 0.3),
        userId,
      });

      for (const song of moodResult.songs) {
        // Avoid duplicates
        if (feedItems.some(item => item.contentId === song.id)) continue;

        feedItems.push(createFeedItem({
          userId,
          itemType: 'song',
          contentId: song.id,
          title: song.title || song.name,
          subtitle: song.artist,
          explanation: `Perfect for your ${timeContext.timeSlot} ${topGenre} mood`,
          recommendationSource: 'time_pattern',
          score: 0.7,
          targetTimeSlot: timeContext.timeSlot,
          targetContext: context || pattern.primaryContext || 'general',
        }));
      }
    }

    // Strategy 3: Get personalized recommendations
    console.log(`✨ Getting personalized recommendations`);
    const personalizedResult = await getRecommendations({
      mode: 'personalized',
      userId,
      limit: Math.ceil(limit * 0.3),
    });

    for (const song of personalizedResult.songs) {
      // Avoid duplicates
      if (feedItems.some(item => item.contentId === song.id)) continue;

      feedItems.push(createFeedItem({
        userId,
        itemType: 'song',
        contentId: song.id,
        title: song.title || song.name,
        subtitle: song.artist,
        explanation: `Personalized recommendation just for you`,
        recommendationSource: 'personalized',
        score: 0.6,
        targetTimeSlot: 'any',
        targetContext: 'general',
      }));
    }

    // Insert feed items if we have any
    if (feedItems.length > 0) {
      await db.insert(discoveryFeedItems).values(feedItems);
    }

    // Fetch the inserted items
    const insertedItems = await db
      .select()
      .from(discoveryFeedItems)
      .where(
        and(
          eq(discoveryFeedItems.userId, userId),
          gte(discoveryFeedItems.expiresAt, new Date())
        )
      )
      .orderBy(desc(discoveryFeedItems.score))
      .limit(limit);

    console.log(`✅ Generated ${insertedItems.length} feed items`);

    return {
      items: insertedItems,
      timeContext,
      pattern,
      hasMore: feedItems.length >= limit,
    };
  } catch (error) {
    console.error('❌ [TimeBasedDiscovery] Error generating feed:', error);

    // Return empty feed on error
    return {
      items: [],
      timeContext,
      pattern,
      hasMore: false,
    };
  }
}

/**
 * Helper to create a feed item with defaults
 */
function createFeedItem(
  data: Partial<DiscoveryFeedItemInsert> & {
    userId: string;
    itemType: DiscoveryFeedItemInsert['itemType'];
    contentId: string;
    title: string;
    recommendationSource: DiscoveryFeedItemInsert['recommendationSource'];
  }
): DiscoveryFeedItemInsert {
  return {
    id: crypto.randomUUID(),
    userId: data.userId,
    itemType: data.itemType,
    contentId: data.contentId,
    title: data.title,
    subtitle: data.subtitle,
    imageUrl: data.imageUrl,
    explanation: data.explanation,
    recommendationSource: data.recommendationSource,
    score: data.score ?? 0.5,
    targetTimeSlot: data.targetTimeSlot ?? 'any',
    targetContext: data.targetContext ?? 'general',
    shown: false,
    clicked: false,
    played: false,
    saved: false,
    skipped: false,
    dismissed: false,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  };
}

// ============================================================================
// Feed Item Interactions
// ============================================================================

/**
 * Record that a feed item was shown to the user
 */
export async function recordFeedItemShown(itemId: string): Promise<void> {
  await db
    .update(discoveryFeedItems)
    .set({
      shown: true,
      shownAt: new Date(),
    })
    .where(eq(discoveryFeedItems.id, itemId));
}

/**
 * Record that a feed item was clicked
 */
export async function recordFeedItemClicked(itemId: string): Promise<void> {
  await db
    .update(discoveryFeedItems)
    .set({
      clicked: true,
      clickedAt: new Date(),
    })
    .where(eq(discoveryFeedItems.id, itemId));
}

/**
 * Record that a feed item was played
 */
export async function recordFeedItemPlayed(
  itemId: string,
  playDuration?: number
): Promise<void> {
  await db
    .update(discoveryFeedItems)
    .set({
      played: true,
      playedAt: new Date(),
      playDuration: playDuration ?? null,
    })
    .where(eq(discoveryFeedItems.id, itemId));
}

/**
 * Record that a feed item was saved
 */
export async function recordFeedItemSaved(itemId: string): Promise<void> {
  await db
    .update(discoveryFeedItems)
    .set({
      saved: true,
      savedAt: new Date(),
    })
    .where(eq(discoveryFeedItems.id, itemId));
}

/**
 * Record that a feed item was skipped
 */
export async function recordFeedItemSkipped(itemId: string): Promise<void> {
  await db
    .update(discoveryFeedItems)
    .set({
      skipped: true,
    })
    .where(eq(discoveryFeedItems.id, itemId));
}

/**
 * Record user feedback on a feed item
 */
export async function recordFeedItemFeedback(
  itemId: string,
  feedback: 'liked' | 'disliked' | 'not_interested'
): Promise<void> {
  await db
    .update(discoveryFeedItems)
    .set({
      feedback,
      feedbackAt: new Date(),
      // Auto-dismiss if not interested
      dismissed: feedback === 'not_interested',
    })
    .where(eq(discoveryFeedItems.id, itemId));
}

/**
 * Dismiss a feed item
 */
export async function dismissFeedItem(itemId: string): Promise<void> {
  await db
    .update(discoveryFeedItems)
    .set({
      dismissed: true,
    })
    .where(eq(discoveryFeedItems.id, itemId));
}

// ============================================================================
// Feed Cleanup
// ============================================================================

/**
 * Clean up expired feed items
 * Should be called periodically (e.g., daily cron job)
 */
export async function cleanupExpiredFeedItems(): Promise<number> {
  const result = await db
    .delete(discoveryFeedItems)
    .where(lte(discoveryFeedItems.expiresAt, new Date()))
    .returning({ id: discoveryFeedItems.id });

  console.log(`🧹 Cleaned up ${result.length} expired feed items`);
  return result.length;
}

// ============================================================================
// New User Handling
// ============================================================================

/**
 * Generate a discovery feed for new users with no listening history
 * Uses trending and popular content as a starting point
 */
export async function generateNewUserFeed(
  userId: string,
  limit: number = 20
): Promise<DiscoveryFeedItem[]> {
  console.log(`👋 [TimeBasedDiscovery] Generating new user feed for ${userId}`);

  const timeContext = getCurrentTimeContext();
  const feedItems: DiscoveryFeedItemInsert[] = [];

  try {
    // Get general mood-based recommendations for new users
    const moodDescriptions = {
      morning: 'upbeat energizing music to start the day',
      afternoon: 'uplifting positive vibes for productivity',
      evening: 'relaxing wind-down music',
      night: 'calm ambient music for late night',
    };

    const moodResult = await getRecommendations({
      mode: 'mood',
      moodDescription: moodDescriptions[timeContext.timeSlot],
      limit,
      userId,
    });

    for (const song of moodResult.songs) {
      feedItems.push(createFeedItem({
        userId,
        itemType: 'song',
        contentId: song.id,
        title: song.title || song.name,
        subtitle: song.artist,
        explanation: `Great ${timeContext.timeSlot} music to get started`,
        recommendationSource: 'trending',
        score: 0.5,
        targetTimeSlot: timeContext.timeSlot,
        targetContext: 'general',
      }));
    }

    if (feedItems.length > 0) {
      await db.insert(discoveryFeedItems).values(feedItems);
    }

    const insertedItems = await db
      .select()
      .from(discoveryFeedItems)
      .where(eq(discoveryFeedItems.userId, userId))
      .orderBy(desc(discoveryFeedItems.score))
      .limit(limit);

    return insertedItems;
  } catch (error) {
    console.error('❌ [TimeBasedDiscovery] Error generating new user feed:', error);
    return [];
  }
}

/**
 * Check if user has enough listening history for personalized recommendations
 */
export async function hasEnoughHistory(userId: string): Promise<boolean> {
  const historyCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(listeningHistory)
    .where(eq(listeningHistory.userId, userId))
    .then(rows => Number(rows[0]?.count || 0));

  return historyCount >= 10;
}

// ============================================================================
// Exports
// ============================================================================

export {
  type TimeContext,
  type DiscoveryFeedRequest,
  type DiscoveryFeedResponse,
  type PatternUpdateResult,
};
