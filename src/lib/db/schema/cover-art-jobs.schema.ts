import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/**
 * Cover Art Fetch Job Status
 */
export type CoverArtJobStatus = 'processing' | 'completed' | 'failed';

/**
 * Cover Art Fetch Jobs Table
 * Tracks background auto-fetch operations with progress for client polling.
 */
export const coverArtFetchJobs = pgTable("cover_art_fetch_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // What type of art we're fetching
  type: text("type").notNull(), // 'albums' | 'artists'

  // Status
  status: text("status").$type<CoverArtJobStatus>().notNull().default('processing'),

  // Progress
  total: integer("total").notNull().default(0),
  processed: integer("processed").notNull().default(0),
  found: integer("found").notNull().default(0),
  notFound: integer("not_found").notNull().default(0),
  errors: integer("errors").notNull().default(0),

  // Error info
  errorMessage: text("error_message"),

  // Timestamps
  startedAt: timestamp("started_at").$defaultFn(() => new Date()).notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  userIdIdx: index("cover_art_fetch_jobs_user_id_idx").on(table.userId),
  statusIdx: index("cover_art_fetch_jobs_status_idx").on(table.status),
}));

export type CoverArtFetchJob = typeof coverArtFetchJobs.$inferSelect;
export type CoverArtFetchJobInsert = typeof coverArtFetchJobs.$inferInsert;
