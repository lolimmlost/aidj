import { pgTable, text, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/**
 * Library Reconciliation Job State
 *
 * Persists the reconciliation scheduler's cadence so it survives process
 * restarts / redeploys (the in-memory setTimeout is wiped on every deploy).
 * One row per user (PK = userId). Mirrors `discovery_job_state`.
 *
 * `next_run_at` is the source of truth for when the job is due: on boot the
 * manager resumes from it instead of always waiting a fresh `frequency_hours`.
 */
export const libraryReconciliationState = pgTable("library_reconciliation_state", {
  // Primary key is userId (one job state per user)
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),

  // Job configuration
  enabled: boolean("enabled").default(true).notNull(),
  frequencyHours: integer("frequency_hours").default(6).notNull(),

  // Run tracking
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  isRunning: boolean("is_running").default(false).notNull(),

  // Failure handling
  lastError: text("last_error"),

  // Last run summary (checkedIds/deadIds/remapped/notFound/durationMs)
  lastResult: jsonb("last_result"),

  // Timestamps
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  // Index for finding jobs due to run
  nextRunAtIdx: index("library_reconciliation_state_next_run_at_idx").on(table.nextRunAt),
  enabledIdx: index("library_reconciliation_state_enabled_idx").on(table.enabled),
}));

export type LibraryReconciliationState = typeof libraryReconciliationState.$inferSelect;
