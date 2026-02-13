/**
 * Music Identity Schema
 *
 * Stores yearly/monthly music identity summaries similar to Spotify Wrapped.
 * Includes AI-powered insights, mood classifications, artist affinities, and trend analysis.
 *
 * Story: Music Identity System - AI-Powered Yearly/Monthly Summaries
 */

import { pgTable, text, timestamp, integer, index, jsonb } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import type { MoodDistribution, TopItem } from "./mood-history.schema";

// ============================================================================
// Music Identity Summaries Table
// ============================================================================

/**
 * Stores generated yearly/monthly music identity summaries
 * These are pre-computed summaries that can be shared as visual cards
 */
export const musicIdentitySummaries = pgTable("music_identity_summaries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Period this summary covers
  periodType: text("period_type", { enum: ['month', 'year'] }).notNull(),
  year: integer("year").notNull(),
  month: integer("month"), // 1-12, null for yearly summaries

  // AI-generated title for this period (e.g., "Your Melodic Journey 2024")
  title: text("title").notNull(),

  // AI-generated insights/narrative about the listening patterns
  aiInsights: jsonb("ai_insights").$type<AIInsights>().notNull(),

  // Mood classification for the period
  moodProfile: jsonb("mood_profile").$type<MoodProfile>().notNull(),

  // Artist affinity data
  artistAffinities: jsonb("artist_affinities").$type<ArtistAffinity[]>().notNull(),

  // Trend analysis: who you're getting into vs moving away from
  trendAnalysis: jsonb("trend_analysis").$type<TrendAnalysis>().notNull(),

  // Top content for this period
  topArtists: jsonb("top_artists").$type<TopItem[]>().notNull(),
  topTracks: jsonb("top_tracks").$type<TopItem[]>().notNull(),
  topGenres: jsonb("top_genres").$type<TopItem[]>().notNull(),

  // Listening statistics
  stats: jsonb("stats").$type<ListeningStats>().notNull(),

  // Visual card customization
  cardTheme: text("card_theme").default('default'),
  cardData: jsonb("card_data").$type<CardData>(),

  // Sharing
  shareToken: text("share_token"), // Public share token
  isPublic: integer("is_public").default(0), // 0 = private, 1 = public

  // Timestamps
  generatedAt: timestamp("generated_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  // Index for user's summaries
  userIdIdx: index("music_identity_user_id_idx").on(table.userId),

  // Index for period lookups
  userPeriodIdx: index("music_identity_user_period_idx").on(table.userId, table.year, table.month),

  // Index for public share lookups
  shareTokenIdx: index("music_identity_share_token_idx").on(table.shareToken),
}));

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * AI-generated insights about listening patterns
 */
export interface AIInsights {
  // Main narrative/story about the user's music journey
  narrative: string;

  // Key highlights (3-5 bullet points)
  highlights: string[];

  // Personality-based music taste description
  musicPersonality: {
    type: string; // e.g., "The Explorer", "The Nostalgic", "The Genre-Hopper"
    description: string;
    traits: string[];
  };

  // Fun facts about listening habits
  funFacts: string[];

  // Prediction or recommendation for next period
  prediction?: string;
}

/**
 * Mood classification with distribution and dominant moods
 */
export interface MoodProfile {
  // Overall mood distribution for the period
  distribution: MoodDistribution;

  // Dominant mood(s) for this period
  dominantMoods: Array<{
    mood: keyof MoodDistribution;
    percentage: number;
    trend: 'rising' | 'falling' | 'stable';
  }>;

  // Mood by time of day
  moodByTimeOfDay?: {
    morning: keyof MoodDistribution;
    afternoon: keyof MoodDistribution;
    evening: keyof MoodDistribution;
    night: keyof MoodDistribution;
  };

  // Mood variation score (0-1, higher = more varied)
  variationScore: number;

  // Emotional range description
  emotionalRange: string;
}

/**
 * Artist affinity with context
 */
export interface ArtistAffinity {
  artist: string;
  affinityScore: number; // 0-100
  playCount: number;
  firstListened?: string; // ISO date when first heard in library
  peakPeriod?: string; // When they were listened to most
  relatedGenres: string[];
  status: 'top' | 'rising' | 'consistent' | 'fading';
}

/**
 * Trend analysis showing music taste evolution
 */
export interface TrendAnalysis {
  // Artists/genres you're getting into
  gettingInto: Array<{
    type: 'artist' | 'genre';
    name: string;
    growthRate: number; // percentage increase
    startedListening?: string; // ISO date
  }>;

  // Artists/genres you're moving away from
  movingAwayFrom: Array<{
    type: 'artist' | 'genre';
    name: string;
    declineRate: number; // percentage decrease
    peakPeriod?: string; // When they were at their peak
  }>;

  // Overall taste evolution summary
  evolutionSummary: string;

  // Diversity trend
  diversityTrend: 'expanding' | 'narrowing' | 'stable';
  diversityScore: number; // 0-1

  // New discoveries count
  newDiscoveriesCount: number;
}

/**
 * Listening statistics for the period
 */
export interface ListeningStats {
  totalListens: number;
  totalMinutesListened: number;
  uniqueArtists: number;
  uniqueTracks: number;
  uniqueGenres: number;
  averageSessionLength: number; // in minutes
  longestListeningStreak: number; // in days
  mostActiveDay: string; // e.g., "Saturday"
  mostActiveHour: number; // 0-23
  completionRate: number; // percentage of songs completed vs skipped
  feedbackCount: number;
  acceptanceRate: number; // percentage
}

/**
 * Card customization data for shareable visuals
 */
export interface CardData {
  // Primary gradient colors
  primaryColor: string;
  secondaryColor: string;

  // Featured image (could be album art or generated visual)
  featuredImage?: string;

  // Layout type
  layout: 'classic' | 'minimal' | 'vibrant' | 'dark';

  // Elements to show/hide
  showStats: boolean;
  showTopArtists: boolean;
  showMoodProfile: boolean;
  showTrends: boolean;

  // Custom text (user can add their own message)
  customMessage?: string;
}

// ============================================================================
// Type Exports for Database Operations
// ============================================================================

export type MusicIdentitySummary = typeof musicIdentitySummaries.$inferSelect;
export type MusicIdentitySummaryInsert = typeof musicIdentitySummaries.$inferInsert;
