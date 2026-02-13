import { pgTable, text, timestamp, integer, real, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import type { SyncSong } from "../../types/sync";

/**
 * Playback Sessions Schema
 *
 * Stores server-side playback state for cross-device sync.
 * One session per user (upsert model).
 *
 * Uses per-field timestamps for conflict resolution:
 * - queueUpdatedAt: covers queue, originalQueue, currentIndex, isShuffled
 * - positionUpdatedAt: covers currentPositionMs
 * - playStateUpdatedAt: covers isPlaying, activeDeviceId
 */
export const playbackSessions = pgTable("playback_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),

  // Active device
  activeDeviceId: text("active_device_id"),
  activeDeviceName: text("active_device_name"),
  activeDeviceType: text("active_device_type"),

  // Queue state (SyncSong[] stored as JSONB)
  queue: jsonb("queue").notNull().$type<SyncSong[]>().default([]),
  originalQueue: jsonb("original_queue").$type<SyncSong[]>().default([]),
  currentIndex: integer("current_index").notNull().default(0),

  // Playback state
  currentPositionMs: integer("current_position_ms").default(0),
  isPlaying: boolean("is_playing").default(false),
  volume: real("volume").default(0.5),
  isShuffled: boolean("is_shuffled").default(false),

  // Per-field timestamps for conflict resolution
  queueUpdatedAt: timestamp("queue_updated_at").notNull().defaultNow(),
  positionUpdatedAt: timestamp("position_updated_at").notNull().defaultNow(),
  playStateUpdatedAt: timestamp("play_state_updated_at").notNull().defaultNow(),

  // Overall timestamp
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("playback_sessions_user_id_idx").on(table.userId),
}));

export type PlaybackSession = typeof playbackSessions.$inferSelect;
export type PlaybackSessionInsert = typeof playbackSessions.$inferInsert;
