import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/**
 * Devices Schema
 *
 * Tracks user devices for cross-device sync and transfer playback.
 * Device IDs are client-generated (via getDeviceId() in device.ts).
 */
export const devices = pgTable("devices", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull(),
  deviceType: text("device_type").notNull(),
  userAgent: text("user_agent"),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("devices_user_id_idx").on(table.userId),
}));

export type Device = typeof devices.$inferSelect;
export type DeviceInsert = typeof devices.$inferInsert;
