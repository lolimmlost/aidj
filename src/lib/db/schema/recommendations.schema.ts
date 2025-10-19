import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { recommendationsCache } from "./auth.schema";

/**
 * Stores user feedback on recommended songs (thumbs up/down)
 * Used to build preference profiles and improve personalization
 */
export const recommendationFeedback = pgTable("recommendation_feedback", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Optional reference to cached recommendation that generated this song
  recommendationCacheId: integer("recommendation_cache_id").references(() => recommendationsCache.id, { onDelete: "set null" }),

  // Song identifier (format: "Artist - Title")
  songArtistTitle: text("song_artist_title").notNull(),

  // Feedback type: thumbs up or thumbs down
  feedbackType: text("feedback_type", { enum: ['thumbs_up', 'thumbs_down'] }).notNull(),

  // Where the feedback came from
  source: text("source", { enum: ['recommendation', 'playlist'] }).default('recommendation').notNull(),

  timestamp: timestamp("timestamp")
    .$defaultFn(() => new Date())
    .notNull(),

  // Temporal metadata for seasonal pattern detection (Story 3.11)
  month: integer("month"), // 1-12
  season: text("season", { enum: ['spring', 'summer', 'fall', 'winter'] }),
  dayOfWeek: integer("day_of_week"), // 1-7 (1=Monday)
  hourOfDay: integer("hour_of_day"), // 0-23
}, (table) => ({
  // Index for user-scoped queries
  userIdIdx: index("recommendation_feedback_user_id_idx").on(table.userId),

  // Index for time-based queries (analytics)
  timestampIdx: index("recommendation_feedback_timestamp_idx").on(table.timestamp),

  // Index for feedback tracking per recommendation
  cacheIdIdx: index("recommendation_feedback_cache_id_idx").on(table.recommendationCacheId),

  // Compound index for analytics queries (user's feedback by type over time)
  userFeedbackTypeTimestampIdx: index("recommendation_feedback_user_type_time_idx")
    .on(table.userId, table.feedbackType, table.timestamp),

  // Temporal indexes for seasonal pattern queries (Story 3.11)
  monthIdx: index("recommendation_feedback_month_idx").on(table.month),
  seasonIdx: index("recommendation_feedback_season_idx").on(table.season),
  userSeasonIdx: index("recommendation_feedback_user_season_idx").on(table.userId, table.season),
  userMonthIdx: index("recommendation_feedback_user_month_idx").on(table.userId, table.month),
}));

export type RecommendationFeedback = typeof recommendationFeedback.$inferSelect;
export type RecommendationFeedbackInsert = typeof recommendationFeedback.$inferInsert;
