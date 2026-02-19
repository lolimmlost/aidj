import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/**
 * Per-user Navidrome credentials table.
 * Each AIDJ user gets their own Navidrome account so user-scoped operations
 * (stars, playlists, scrobbles) are isolated per-user.
 *
 * The admin account is still used for shared operations (library browsing,
 * search, streaming, cover art).
 */
export const navidromeUsers = pgTable("navidrome_users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  navidromeUsername: text("navidrome_username").notNull().unique(),
  navidromePassword: text("navidrome_password").notNull(),
  navidromeSalt: text("navidrome_salt").notNull(),
  navidromeToken: text("navidrome_token").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
});

export type NavidromeUser = typeof navidromeUsers.$inferSelect;
export type NavidromeUserInsert = typeof navidromeUsers.$inferInsert;
