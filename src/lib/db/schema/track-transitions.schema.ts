import { pgTable, text, timestamp, integer, real, index, unique } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/**
 * Track Transitions Table
 *
 * Per-user DIRECTED transition graph: how often B was played immediately
 * after A within the same listening session (a contiguous run of plays with
 * no gap > 30 minutes). This is the ordered, skip-aware sibling of the
 * UNDIRECTED artist_cooccurrence table — co-occurrence answers "are A and B
 * played together?", transitions answer "does B work as the NEXT track after A?".
 *
 * Used as ONE re-ranking signal in blended-recommendation-scorer.ts. It never
 * generates candidates — it only re-weights songs the pipeline already found.
 * See docs/design/transition-learning-plan.md.
 *
 * Granularity: 'artist' | 'genre' only. Song→song was dropped after the Phase 0
 * probe found it 98.5% single-observation noise (1.5% of cells reach support >= 3).
 *
 * Score formula (computed at lookup time, not stored):
 *   raw   = (posWeight - negWeight) / (posWeight + negWeight + K)   // K = 2, Laplace-ish
 *   score = clamp01(raw * 0.5 + 0.5)                                // 0.5 = neutral / no data
 * gated by totalCount >= minSupport (default 3).
 */
export const trackTransitions = pgTable("track_transitions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // 'artist' → lower(artist); 'genre' → normalized genre. Song-level intentionally absent.
  granularity: text("granularity", { enum: ["artist", "genre"] }).notNull(),

  fromKey: text("from_key").notNull(),
  toKey: text("to_key").notNull(),

  // RAW count of observed A→B adjacencies. Drives the support gate (must stay an
  // integer count, undecayed — the gate asks "did this happen enough times to trust").
  totalCount: integer("total_count").notNull().default(0),

  // Decayed, source-weighted mass. Drives the SCORE (recency-decayed so old scrobbles
  // don't outvote current taste). posWeight discounts recommender-chosen follows;
  // negWeight (skips) is source-agnostic because a skip is always a real negative.
  posWeight: real("pos_weight").notNull().default(0),
  negWeight: real("neg_weight").notNull().default(0),

  lastObserved: timestamp("last_observed").notNull(),
  calculatedAt: timestamp("calculated_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  uniqueUserEdge: unique("track_transitions_unique").on(
    table.userId,
    table.granularity,
    table.fromKey,
    table.toKey,
  ),

  // Lookup shape: all outgoing edges of a seed at a given granularity.
  userGranFromIdx: index("track_transitions_user_gran_from_idx").on(
    table.userId,
    table.granularity,
    table.fromKey,
  ),

  userIdIdx: index("track_transitions_user_id_idx").on(table.userId),
}));

export type TrackTransition = typeof trackTransitions.$inferSelect;
export type TrackTransitionInsert = typeof trackTransitions.$inferInsert;
