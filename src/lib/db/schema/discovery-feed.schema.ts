/**
 * Discovery Feed Schema
 *
 * Stores time-based listening patterns and personalized discovery feed data.
 * Supports the Personalized Music Discovery Feed with Time-Based Recommendations feature.
 *
 * Features:
 * - Time-based listening pattern analysis (morning, afternoon, evening, night)
 * - Day of week pattern tracking
 * - Context-based recommendations (workout, focus, relaxation, commute)
 * - Smart notification scheduling
 * - Feed item tracking with interaction analytics
 */

import { pgTable, text, timestamp, integer, real, index, unique, jsonb, boolean } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/**
 * Time slots for pattern analysis
 */
export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * Listening context types
 */
export type ListeningContext = 'workout' | 'focus' | 'relaxation' | 'commute' | 'social' | 'general';

/**
 * Time-based listening patterns
 * Tracks aggregated listening patterns per user for each time slot and day
 */
export const listeningPatterns = pgTable("listening_patterns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Time slot (morning: 5-11, afternoon: 11-17, evening: 17-21, night: 21-5)
  timeSlot: text("time_slot", { enum: ['morning', 'afternoon', 'evening', 'night'] }).notNull(),

  // Day of week (0 = Sunday, 6 = Saturday)
  dayOfWeek: integer("day_of_week").notNull(),

  // Aggregated genre preferences for this time slot
  topGenres: jsonb("top_genres").$type<{ genre: string; count: number; avgRating: number }[]>().default([]).notNull(),

  // Aggregated mood preferences
  topMoods: jsonb("top_moods").$type<{ mood: string; count: number }[]>().default([]).notNull(),

  // Average energy level for this time slot (0-1)
  avgEnergy: real("avg_energy").default(0.5),

  // Average tempo preference
  avgBpm: integer("avg_bpm"),

  // Listening context detected for this time slot
  primaryContext: text("primary_context", {
    enum: ['workout', 'focus', 'relaxation', 'commute', 'social', 'general']
  }).default('general'),

  // Number of listening sessions used to calculate this pattern
  sampleCount: integer("sample_count").default(0).notNull(),

  // Last time this pattern was updated
  lastUpdated: timestamp("last_updated")
    .$defaultFn(() => new Date())
    .notNull(),

  // When this pattern was first created
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  // Unique constraint: one pattern per user-timeslot-day combination
  uniquePattern: unique("listening_patterns_unique").on(
    table.userId,
    table.timeSlot,
    table.dayOfWeek
  ),

  // Index for user pattern lookups
  userIdIdx: index("listening_patterns_user_id_idx").on(table.userId),

  // Index for time-based queries
  timeSlotIdx: index("listening_patterns_time_slot_idx").on(table.timeSlot),

  // Compound index for current context lookup
  userTimeSlotDayIdx: index("listening_patterns_user_time_day_idx").on(
    table.userId,
    table.timeSlot,
    table.dayOfWeek
  ),
}));

/**
 * Discovery Feed Items
 * Individual recommendations shown to users in their personalized feed
 */
export const discoveryFeedItems = pgTable("discovery_feed_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Feed item type
  itemType: text("item_type", {
    enum: ['song', 'playlist', 'artist', 'album', 'mood_playlist']
  }).notNull(),

  // Reference to the content (songId, playlistId, artistId, etc.)
  contentId: text("content_id").notNull(),

  // Display information (cached for performance)
  title: text("title").notNull(),
  subtitle: text("subtitle"), // e.g., artist name, playlist description
  imageUrl: text("image_url"),

  // Why this was recommended (shown to user)
  explanation: text("explanation"),

  // Internal recommendation metadata
  recommendationSource: text("recommendation_source", {
    enum: ['time_pattern', 'compound_score', 'mood_match', 'genre_match', 'discovery', 'trending', 'personalized']
  }).notNull(),

  // Recommendation score (for ranking)
  score: real("score").default(0).notNull(),

  // Time slot this recommendation is targeted for
  targetTimeSlot: text("target_time_slot", {
    enum: ['morning', 'afternoon', 'evening', 'night', 'any']
  }).default('any'),

  // Context this recommendation is for
  targetContext: text("target_context", {
    enum: ['workout', 'focus', 'relaxation', 'commute', 'social', 'general']
  }).default('general'),

  // User interaction tracking
  shown: boolean("shown").default(false).notNull(),
  shownAt: timestamp("shown_at"),
  clicked: boolean("clicked").default(false).notNull(),
  clickedAt: timestamp("clicked_at"),
  played: boolean("played").default(false).notNull(),
  playedAt: timestamp("played_at"),
  playDuration: integer("play_duration"), // seconds
  saved: boolean("saved").default(false).notNull(),
  savedAt: timestamp("saved_at"),
  skipped: boolean("skipped").default(false).notNull(),
  dismissed: boolean("dismissed").default(false).notNull(),

  // User feedback
  feedback: text("feedback", { enum: ['liked', 'disliked', 'not_interested'] }),
  feedbackAt: timestamp("feedback_at"),

  // Timestamps
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),

  // Expiration for feed items (to keep feed fresh)
  expiresAt: timestamp("expires_at")
    .$defaultFn(() => {
      const date = new Date();
      date.setDate(date.getDate() + 7); // Expire after 7 days
      return date;
    })
    .notNull(),
}, (table) => ({
  // Index for user feed queries
  userIdIdx: index("discovery_feed_items_user_id_idx").on(table.userId),

  // Index for time-based feed filtering
  userTimeSlotIdx: index("discovery_feed_items_user_time_slot_idx").on(
    table.userId,
    table.targetTimeSlot
  ),

  // Index for analytics queries
  shownAtIdx: index("discovery_feed_items_shown_at_idx").on(table.shownAt),

  // Index for cleanup queries
  expiresAtIdx: index("discovery_feed_items_expires_at_idx").on(table.expiresAt),

  // Index for content deduplication
  userContentIdx: index("discovery_feed_items_user_content_idx").on(
    table.userId,
    table.contentId,
    table.itemType
  ),
}));

/**
 * Notification Preferences for Discovery Feed
 * User-specific notification timing and preferences
 */
export const discoveryNotificationPreferences = pgTable("discovery_notification_preferences", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),

  // Master toggle
  enabled: boolean("enabled").default(true).notNull(),

  // Notification frequency
  frequency: text("frequency", {
    enum: ['realtime', 'hourly', 'daily', 'weekly']
  }).default('daily').notNull(),

  // Preferred notification times (24-hour format)
  preferredTimes: jsonb("preferred_times").$type<string[]>().default(['09:00', '17:00']).notNull(),

  // Quiet hours (don't notify between these times)
  quietHoursStart: text("quiet_hours_start").default('22:00'),
  quietHoursEnd: text("quiet_hours_end").default('08:00'),

  // Day preferences (which days to notify)
  activeDays: jsonb("active_days").$type<number[]>().default([0, 1, 2, 3, 4, 5, 6]).notNull(),

  // Notification content preferences
  includeNewReleases: boolean("include_new_releases").default(true).notNull(),
  includePersonalized: boolean("include_personalized").default(true).notNull(),
  includeTimeBasedSuggestions: boolean("include_time_based_suggestions").default(true).notNull(),
  includeTrending: boolean("include_trending").default(false).notNull(),

  // Maximum notifications per day
  maxNotificationsPerDay: integer("max_notifications_per_day").default(3).notNull(),

  // Computed optimal notification time based on engagement patterns
  computedOptimalTime: text("computed_optimal_time"),

  // A/B testing group for notification optimization
  abTestGroup: text("ab_test_group", { enum: ['control', 'optimal_time', 'context_aware'] }).default('control'),

  // Timestamps
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),

  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  // User lookup index
  userIdIdx: index("discovery_notification_prefs_user_id_idx").on(table.userId),
}));

/**
 * Scheduled Notifications
 * Queue of notifications to be sent
 */
export const scheduledNotifications = pgTable("scheduled_notifications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Notification content
  title: text("title").notNull(),
  body: text("body").notNull(),

  // Action when clicked
  actionUrl: text("action_url"),

  // Reference to feed item if applicable
  feedItemId: text("feed_item_id"),

  // Notification type for analytics
  notificationType: text("notification_type", {
    enum: ['time_based', 'new_release', 'personalized', 'trending', 'reminder']
  }).notNull(),

  // Scheduled time
  scheduledFor: timestamp("scheduled_for").notNull(),

  // Status tracking
  status: text("status", {
    enum: ['pending', 'sent', 'delivered', 'clicked', 'dismissed', 'failed']
  }).default('pending').notNull(),

  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  clickedAt: timestamp("clicked_at"),

  // Error tracking
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0).notNull(),

  // A/B test tracking
  abTestVariant: text("ab_test_variant"),

  // Timestamps
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  // Index for pending notification processing
  statusScheduledIdx: index("scheduled_notifications_status_scheduled_idx").on(
    table.status,
    table.scheduledFor
  ),

  // Index for user notification history
  userIdIdx: index("scheduled_notifications_user_id_idx").on(table.userId),

  // Index for analytics
  typeStatusIdx: index("scheduled_notifications_type_status_idx").on(
    table.notificationType,
    table.status
  ),
}));

/**
 * Discovery Feed Analytics
 * Aggregated analytics for recommendation quality tracking
 */
export const discoveryFeedAnalytics = pgTable("discovery_feed_analytics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Analytics period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  // Aggregation level (daily, weekly, monthly)
  aggregationLevel: text("aggregation_level", {
    enum: ['daily', 'weekly', 'monthly']
  }).notNull(),

  // Optional user ID (null for global analytics)
  userId: text("user_id")
    .references(() => user.id, { onDelete: "cascade" }),

  // Engagement metrics
  totalItemsShown: integer("total_items_shown").default(0).notNull(),
  totalClicks: integer("total_clicks").default(0).notNull(),
  totalPlays: integer("total_plays").default(0).notNull(),
  totalPlayDuration: integer("total_play_duration").default(0).notNull(), // seconds
  totalSaves: integer("total_saves").default(0).notNull(),
  totalSkips: integer("total_skips").default(0).notNull(),
  totalDismissals: integer("total_dismissals").default(0).notNull(),

  // Feedback metrics
  totalLikes: integer("total_likes").default(0).notNull(),
  totalDislikes: integer("total_dislikes").default(0).notNull(),
  totalNotInterested: integer("total_not_interested").default(0).notNull(),

  // Calculated rates
  clickThroughRate: real("click_through_rate").default(0),
  playRate: real("play_rate").default(0),
  saveRate: real("save_rate").default(0),
  skipRate: real("skip_rate").default(0),
  dismissalRate: real("dismissal_rate").default(0),

  // Recommendation source breakdown
  sourceBreakdown: jsonb("source_breakdown").$type<{
    source: string;
    count: number;
    clickRate: number;
    playRate: number;
  }[]>().default([]),

  // Time slot performance
  timeSlotBreakdown: jsonb("time_slot_breakdown").$type<{
    timeSlot: string;
    count: number;
    clickRate: number;
    playRate: number;
  }[]>().default([]),

  // Notification metrics
  notificationsSent: integer("notifications_sent").default(0).notNull(),
  notificationsOpened: integer("notifications_opened").default(0).notNull(),
  notificationOpenRate: real("notification_open_rate").default(0),

  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  // Index for period queries
  periodIdx: index("discovery_feed_analytics_period_idx").on(
    table.periodStart,
    table.periodEnd
  ),

  // Index for user analytics
  userIdIdx: index("discovery_feed_analytics_user_id_idx").on(table.userId),

  // Unique constraint for analytics period
  uniqueAnalytics: unique("discovery_feed_analytics_unique").on(
    table.periodStart,
    table.aggregationLevel,
    table.userId
  ),
}));

// Type exports
export type ListeningPattern = typeof listeningPatterns.$inferSelect;
export type ListeningPatternInsert = typeof listeningPatterns.$inferInsert;

export type DiscoveryFeedItem = typeof discoveryFeedItems.$inferSelect;
export type DiscoveryFeedItemInsert = typeof discoveryFeedItems.$inferInsert;

export type DiscoveryNotificationPreferences = typeof discoveryNotificationPreferences.$inferSelect;
export type DiscoveryNotificationPreferencesInsert = typeof discoveryNotificationPreferences.$inferInsert;

export type ScheduledNotification = typeof scheduledNotifications.$inferSelect;
export type ScheduledNotificationInsert = typeof scheduledNotifications.$inferInsert;

export type DiscoveryFeedAnalytics = typeof discoveryFeedAnalytics.$inferSelect;
export type DiscoveryFeedAnalyticsInsert = typeof discoveryFeedAnalytics.$inferInsert;
