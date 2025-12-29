/**
 * Mood History Schema
 *
 * Stores user mood history and preference snapshots for timeline visualization.
 * Enables tracking of mood/genre preference shifts over time.
 *
 * Story: Mood Timeline Visualization with Historical Music Preference Tracking
 */

import { pgTable, text, timestamp, integer, real, index, jsonb } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import type { Season } from "../../utils/temporal";

/**
 * Stores aggregated mood/preference snapshots at regular intervals
 * Used for timeline visualization and historical preference analysis
 */
export const moodSnapshots = pgTable("mood_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Time period this snapshot represents
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  periodType: text("period_type", { enum: ['day', 'week', 'month'] }).notNull(),

  // Mood distribution (percentage for each mood category)
  moodDistribution: jsonb("mood_distribution").$type<MoodDistribution>().notNull(),

  // Top genres for this period
  topGenres: jsonb("top_genres").$type<TopItem[]>().notNull(),

  // Top artists for this period
  topArtists: jsonb("top_artists").$type<TopItem[]>().notNull(),

  // Top tracks for this period
  topTracks: jsonb("top_tracks").$type<TopItem[]>().notNull(),

  // Listening statistics
  totalListens: integer("total_listens").notNull().default(0),
  totalFeedback: integer("total_feedback").notNull().default(0),
  thumbsUpCount: integer("thumbs_up_count").notNull().default(0),
  thumbsDownCount: integer("thumbs_down_count").notNull().default(0),

  // Acceptance rate for this period
  acceptanceRate: real("acceptance_rate").notNull().default(0),

  // Diversity score (0-1, higher = more varied taste)
  diversityScore: real("diversity_score").notNull().default(0),

  // Temporal metadata
  season: text("season", { enum: ['spring', 'summer', 'fall', 'winter'] }),
  month: integer("month"), // 1-12

  // When this snapshot was created
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  // Index for user's snapshots
  userIdIdx: index("mood_snapshots_user_id_idx").on(table.userId),

  // Index for time-based queries
  periodStartIdx: index("mood_snapshots_period_start_idx").on(table.periodStart),

  // Compound index for user's timeline queries
  userPeriodIdx: index("mood_snapshots_user_period_idx").on(table.userId, table.periodStart),

  // Index for period type filtering
  periodTypeIdx: index("mood_snapshots_period_type_idx").on(table.periodType),

  // Compound index for user + period type
  userPeriodTypeIdx: index("mood_snapshots_user_period_type_idx").on(table.userId, table.periodType),
}));

/**
 * Stores historical recommendations for replay functionality
 * Captures what recommendations were shown and user interactions
 */
export const recommendationHistory = pgTable("recommendation_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // When this recommendation batch was generated
  generatedAt: timestamp("generated_at")
    .$defaultFn(() => new Date())
    .notNull(),

  // The songs that were recommended
  recommendedSongs: jsonb("recommended_songs").$type<RecommendedSong[]>().notNull(),

  // Algorithm/source used for these recommendations
  source: text("source", {
    enum: ['ai_dj', 'similar_tracks', 'mood_based', 'seasonal', 'discovery', 'compound_scores']
  }).notNull(),

  // Mood/context that triggered this recommendation
  moodContext: text("mood_context"),

  // Factors that influenced the recommendation
  reasoningFactors: jsonb("reasoning_factors").$type<ReasoningFactor[]>(),

  // User's taste profile at the time (for comparison)
  tasteProfileSnapshot: jsonb("taste_profile_snapshot").$type<TasteProfileSnapshot>(),
}, (table) => ({
  // Index for user's recommendation history
  userIdIdx: index("recommendation_history_user_id_idx").on(table.userId),

  // Index for time-based queries
  generatedAtIdx: index("recommendation_history_generated_at_idx").on(table.generatedAt),

  // Compound index for user's timeline
  userGeneratedAtIdx: index("recommendation_history_user_generated_at_idx").on(table.userId, table.generatedAt),

  // Index for source filtering
  sourceIdx: index("recommendation_history_source_idx").on(table.source),
}));

/**
 * Stores exportable taste profile snapshots
 * Complete profile data for a specific point in time
 */
export const tasteSnapshots = pgTable("taste_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Name/label for this snapshot (user-defined or auto-generated)
  name: text("name").notNull(),

  // When this snapshot was captured
  capturedAt: timestamp("captured_at")
    .$defaultFn(() => new Date())
    .notNull(),

  // Period this snapshot represents
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  // Complete taste profile data
  profileData: jsonb("profile_data").$type<TasteProfileExport>().notNull(),

  // Export format history
  exportFormats: jsonb("export_formats").$type<ExportRecord[]>().default([]),

  // Optional description
  description: text("description"),

  // Whether this is auto-generated or user-created
  isAutoGenerated: integer("is_auto_generated").default(0), // 0 = false, 1 = true
}, (table) => ({
  // Index for user's snapshots
  userIdIdx: index("taste_snapshots_user_id_idx").on(table.userId),

  // Index for time-based queries
  capturedAtIdx: index("taste_snapshots_captured_at_idx").on(table.capturedAt),
}));

// ============================================================================
// Type Definitions
// ============================================================================

export interface MoodDistribution {
  chill: number;       // Relaxed, ambient, calm
  energetic: number;   // Upbeat, party, workout
  melancholic: number; // Sad, emotional, reflective
  happy: number;       // Joyful, positive, uplifting
  focused: number;     // Concentration, study, work
  romantic: number;    // Love songs, slow ballads
  aggressive: number;  // Intense, angry, heavy
  neutral: number;     // General/uncategorized
}

export interface TopItem {
  name: string;
  count: number;
  percentage: number;
}

export interface RecommendedSong {
  songId?: string;
  artist: string;
  title: string;
  status: 'accepted' | 'skipped' | 'saved' | 'pending';
  feedbackAt?: string; // ISO date
}

export interface ReasoningFactor {
  type: 'artist_affinity' | 'genre_match' | 'mood_match' | 'seasonal' | 'discovery' | 'similar_track' | 'compound_score';
  description: string;
  weight: number;
}

export interface TasteProfileSnapshot {
  topArtists: string[];
  topGenres: string[];
  acceptanceRate: number;
  diversityScore: number;
}

export interface TasteProfileExport {
  // Summary statistics
  summary: {
    totalListens: number;
    totalFeedback: number;
    thumbsUpCount: number;
    thumbsDownCount: number;
    acceptanceRate: number;
    diversityScore: number;
  };

  // Mood distribution
  moodDistribution: MoodDistribution;

  // Top items
  topGenres: TopItem[];
  topArtists: TopItem[];
  topTracks: TopItem[];

  // Seasonal preferences
  seasonalPatterns?: {
    season: Season;
    topArtists: string[];
    topGenres: string[];
    moodTendency: string;
  }[];

  // Listening patterns
  listeningPatterns?: {
    peakDayOfWeek?: string;
    peakHourOfDay?: number;
    weekdayVsWeekend?: 'weekday' | 'weekend' | 'balanced';
  };
}

export interface ExportRecord {
  format: 'json' | 'csv' | 'pdf';
  exportedAt: string; // ISO date
  fileName?: string;
}

// Type exports for database operations
export type MoodSnapshot = typeof moodSnapshots.$inferSelect;
export type MoodSnapshotInsert = typeof moodSnapshots.$inferInsert;

export type RecommendationHistoryEntry = typeof recommendationHistory.$inferSelect;
export type RecommendationHistoryInsert = typeof recommendationHistory.$inferInsert;

export type TasteSnapshot = typeof tasteSnapshots.$inferSelect;
export type TasteSnapshotInsert = typeof tasteSnapshots.$inferInsert;
