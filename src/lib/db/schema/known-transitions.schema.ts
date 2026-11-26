import { pgTable, text, timestamp, integer, real, jsonb, index, unique } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/** One way a pair was mixed in the Lab: technique + length, how often, and its most used cue bars. */
export interface KnownTechnique {
  /** Lab transition kind: swap | cut | chain | playout | intro | … */
  kind: string;
  bars: number;
  count: number;
  /** bar of A where the transition starts, and the bar of B it lands on (most used for this technique) */
  entryA: number | null;
  cueB: number | null;
}

/** One technique the DJ picked as the best way to mix a pair (Set prep preselects it). */
export type KnownTechniquePick = Pick<KnownTechnique, "kind" | "bars" | "entryA" | "cueB">;

/** The DJ's role for a pair: what it does to the night. */
export const TRANSITION_ROLES = ["stable", "build", "plateau", "breather", "cooldown"] as const;
export type TransitionRole = (typeof TRANSITION_ROLES)[number];
/** lab = seen in saved Lab sets, not yet judged; proven = the DJ vouches for it; needs_work = close, not
 *  there yet; idea = worth trying. (A text column: adding a status needs no migration.) */
export const TRANSITION_STATUSES = ["lab", "proven", "needs_work", "idea"] as const;
export type TransitionStatus = (typeof TRANSITION_STATUSES)[number];

/**
 * Known transitions: song → song pairs the DJ has actually mixed (DJ tab "Set prep").
 *
 * Unlike track_transitions (listening adjacency at artist/genre level, a recommender signal), these
 * are DJ-curated, song-level and carry HOW the pair was mixed. Imported from the saved Lab sets
 * (LAB_SETS_DIR, every transition with technique, bars and cue bars), then tagged by the DJ with a
 * role and a status. Re-importing refreshes plays / techniques / tempo and never touches the DJ's
 * role, status or note.
 */
export const knownTransitions = pgTable("known_transitions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),

  // canonical Navidrome song ids (post-0.64)
  fromSongId: text("from_song_id").notNull(),
  toSongId: text("to_song_id").notNull(),
  // display copies, so the list renders without a Navidrome round trip
  fromTitle: text("from_title").notNull(),
  fromArtist: text("from_artist").notNull().default(""),
  toTitle: text("to_title").notNull(),
  toArtist: text("to_artist").notNull().default(""),

  /** times this pair appears in saved Lab sets */
  plays: integer("plays").notNull().default(0),
  /** techniques used, most played first */
  techniques: jsonb("techniques").$type<KnownTechnique[]>().notNull().default([]),
  /** the DJ's pick among `techniques`: the take the role and status describe; kept across re-imports */
  preferred: jsonb("preferred").$type<KnownTechniquePick>(),
  /** set tempo of the most recent Lab set with this pair (beat-matched BPM) */
  setBpm: real("set_bpm"),
  lastPlayedAt: timestamp("last_played_at"),

  role: text("role", { enum: TRANSITION_ROLES }),
  status: text("status", { enum: TRANSITION_STATUSES }).notNull().default("lab"),
  note: text("note"),
  source: text("source", { enum: ["lab", "manual"] }).notNull().default("lab"),

  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniquePair: unique("known_transitions_unique").on(t.userId, t.fromSongId, t.toSongId),
  userFromIdx: index("known_transitions_user_from_idx").on(t.userId, t.fromSongId),
}));

export type KnownTransition = typeof knownTransitions.$inferSelect;
export type KnownTransitionInsert = typeof knownTransitions.$inferInsert;
