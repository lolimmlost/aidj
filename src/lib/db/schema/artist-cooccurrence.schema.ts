import { pgTable, text, timestamp, integer, real, index, unique } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/**
 * Artist Co-Occurrence Table
 *
 * Per-user graph of which artists the user plays together in the same
 * listening session. A session is a contiguous run of plays with no gap
 * > 30 minutes. Pairs are stored bidirectionally ((A,B) and (B,A)) so
 * lookups can use a single indexed `artistA` filter.
 *
 * Score formula:
 *   raw_weight   = Σ exp(-0.05 * days_ago)  over co-occurrences
 *   cooccurrence = raw_weight / sqrt(plays(A) * plays(B))   // cosine-like
 *
 * Used by seeded-radio's artist seed to surface "adjacent" artists the
 * user actually plays together, independent of Last.fm similarity.
 */
export const artistCoOccurrence = pgTable("artist_cooccurrence", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  artistA: text("artist_a").notNull(),
  artistB: text("artist_b").notNull(),

  cooccurrenceScore: real("cooccurrence_score").notNull().default(0),
  coplayCount: integer("coplay_count").notNull().default(0),

  lastCoplayedAt: timestamp("last_coplayed_at"),
  calculatedAt: timestamp("calculated_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  uniqueUserPair: unique("artist_cooccurrence_unique").on(
    table.userId,
    table.artistA,
    table.artistB,
  ),

  userArtistScoreIdx: index("artist_cooccurrence_user_artist_score_idx").on(
    table.userId,
    table.artistA,
    table.cooccurrenceScore,
  ),

  userIdIdx: index("artist_cooccurrence_user_id_idx").on(table.userId),
}));

export type ArtistCoOccurrence = typeof artistCoOccurrence.$inferSelect;
export type ArtistCoOccurrenceInsert = typeof artistCoOccurrence.$inferInsert;
