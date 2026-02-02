import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

export const userPreferences = pgTable("user_preferences", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),

  // Recommendation settings
  recommendationSettings: jsonb("recommendation_settings").$type<{
    aiEnabled: boolean;
    frequency: 'always' | 'daily' | 'weekly';
    styleBasedPlaylists: boolean;
    useFeedbackForPersonalization: boolean; // Privacy: Use feedback to improve recommendations
    enableSeasonalRecommendations: boolean; // Story 3.11: Seasonal adjustments
    syncFeedbackToNavidrome: boolean; // Story 3.9: Sync thumbs up/down to Navidrome star
    // Story 3.9: AI DJ Mode
    aiDJEnabled: boolean; // AI DJ specific toggle
    aiDJQueueThreshold: number; // Queue remaining songs trigger (1-5)
    aiDJBatchSize: number; // How many songs to add at a time (1-10)
    aiDJUseCurrentContext: boolean; // Use current song for context
    aiDJGenreExploration: number; // Phase 4.2: Genre exploration level 0-100 (0=strict, 100=adventurous)
    // Playlist Autoplay Queueing with Smart Transitions
    autoplayEnabled: boolean; // Master toggle for autoplay when playlist ends
    autoplayBlendMode: 'crossfade' | 'silence' | 'reverb_tail'; // Transition effect between songs
    autoplayTransitionDuration: number; // Duration in seconds (1-10)
    autoplaySmartTransitions: boolean; // Use AI to determine optimal transition type
    // DJ Matching Settings (BPM/Energy/Key)
    djMatchingEnabled?: boolean; // Enable BPM/energy/key scoring for AI DJ recommendations
    bpmAnalysisEnabled?: boolean; // Auto-analyze BPM during playback
    djMatchingMinScore?: number; // Minimum DJ score threshold (0-1)
    // Queue Seeding Settings
    aiDJSeedQueueEnabled?: boolean; // Seed recommendations throughout queue when AI DJ enabled
    aiDJSeedDensity?: number; // How many recommendations per 10 songs (1-5)
  }>().default({
    aiEnabled: true,
    frequency: 'always',
    styleBasedPlaylists: true,
    useFeedbackForPersonalization: true,
    enableSeasonalRecommendations: true,
    syncFeedbackToNavidrome: true,
    aiDJEnabled: false,
    aiDJQueueThreshold: 2,
    aiDJBatchSize: 3,
    aiDJUseCurrentContext: true,
    aiDJGenreExploration: 50, // Default to balanced (50% exploration)
    autoplayEnabled: false,
    autoplayBlendMode: 'crossfade',
    autoplayTransitionDuration: 4,
    autoplaySmartTransitions: true,
  }).notNull(),

  // Playback settings
  playbackSettings: jsonb("playback_settings").$type<{
    volume: number;
    autoplayNext: boolean;
    crossfadeDuration: number; // 0-10 seconds
    defaultQuality: 'low' | 'medium' | 'high';
  }>().default({
    volume: 0.5,
    autoplayNext: true,
    crossfadeDuration: 0,
    defaultQuality: 'high',
  }).notNull(),

  // Notification settings
  notificationSettings: jsonb("notification_settings").$type<{
    browserNotifications: boolean;
    downloadCompletion: boolean;
    recommendationUpdates: boolean;
  }>().default({
    browserNotifications: false,
    downloadCompletion: true,
    recommendationUpdates: true,
  }).notNull(),

  // Dashboard layout settings
  dashboardLayout: jsonb("dashboard_layout").$type<{
    showRecommendations: boolean;
    showRecentlyPlayed: boolean;
    widgetOrder: string[]; // Future: drag & drop
  }>().default({
    showRecommendations: true,
    showRecentlyPlayed: true,
    widgetOrder: ['recommendations', 'recentlyPlayed'],
  }).notNull(),

  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export type UserPreferences = typeof userPreferences.$inferSelect;
export type UserPreferencesInsert = typeof userPreferences.$inferInsert;
