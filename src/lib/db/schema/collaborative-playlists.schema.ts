import { pgTable, text, timestamp, integer, unique, index, boolean, pgEnum } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { userPlaylists } from "./playlists.schema";

// Enum for playlist privacy settings
export const playlistPrivacyEnum = pgEnum("playlist_privacy", ["public", "private", "invite_only"]);

// Enum for collaborator roles
export const collaboratorRoleEnum = pgEnum("collaborator_role", ["owner", "editor", "viewer"]);

// Enum for suggestion status
export const suggestionStatusEnum = pgEnum("suggestion_status", ["pending", "approved", "rejected"]);

// Extended playlist settings for collaboration
export const playlistCollaborationSettings = pgTable("playlist_collaboration_settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => userPlaylists.id, { onDelete: "cascade" })
    .unique(),
  // Privacy settings
  privacy: playlistPrivacyEnum("privacy").notNull().default("private"),
  // Collaboration settings
  allowSuggestions: boolean("allow_suggestions").notNull().default(true),
  autoApproveThreshold: integer("auto_approve_threshold").default(3), // Votes needed for auto-approval (null = manual only)
  maxSuggestionsPerUser: integer("max_suggestions_per_user").default(10), // Max pending suggestions per user
  maxTotalSuggestions: integer("max_total_suggestions").default(50), // Max total pending suggestions
  // Notification settings
  notifyOnSuggestion: boolean("notify_on_suggestion").notNull().default(true),
  notifyOnVote: boolean("notify_on_vote").notNull().default(false),
  notifyOnApproval: boolean("notify_on_approval").notNull().default(true),
  // Share link
  shareCode: text("share_code").unique(), // Unique code for invite-only sharing
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  playlistIdIdx: index("collab_settings_playlist_id_idx").on(table.playlistId),
  shareCodeIdx: index("collab_settings_share_code_idx").on(table.shareCode),
}));

// Playlist collaborators
export const playlistCollaborators = pgTable("playlist_collaborators", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => userPlaylists.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: collaboratorRoleEnum("role").notNull().default("viewer"),
  // Invitation tracking
  invitedBy: text("invited_by")
    .references(() => user.id, { onDelete: "set null" }),
  invitedAt: timestamp("invited_at")
    .$defaultFn(() => new Date())
    .notNull(),
  acceptedAt: timestamp("accepted_at"), // Null if invitation pending
  // Activity tracking
  lastActiveAt: timestamp("last_active_at"),
  isOnline: boolean("is_online").notNull().default(false), // For presence indicators
}, (table) => ({
  playlistIdIdx: index("collaborators_playlist_id_idx").on(table.playlistId),
  userIdIdx: index("collaborators_user_id_idx").on(table.userId),
  uniqueCollaborator: unique("unique_playlist_collaborator").on(table.playlistId, table.userId),
}));

// Song suggestions
export const playlistSuggestions = pgTable("playlist_suggestions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => userPlaylists.id, { onDelete: "cascade" }),
  // Song metadata
  songId: text("song_id").notNull(),
  songTitle: text("song_title").notNull(),
  songArtist: text("song_artist").notNull(),
  songAlbum: text("song_album"),
  songDuration: integer("song_duration"), // in seconds
  // Suggestion info
  suggestedBy: text("suggested_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  suggestedAt: timestamp("suggested_at")
    .$defaultFn(() => new Date())
    .notNull(),
  // Status
  status: suggestionStatusEnum("status").notNull().default("pending"),
  // Vote tracking (denormalized for performance)
  upvotes: integer("upvotes").notNull().default(0),
  downvotes: integer("downvotes").notNull().default(0),
  score: integer("score").notNull().default(0), // upvotes - downvotes
  // Approval/Rejection info
  processedBy: text("processed_by")
    .references(() => user.id, { onDelete: "set null" }),
  processedAt: timestamp("processed_at"),
  rejectionReason: text("rejection_reason"),
  // Song availability
  isAvailable: boolean("is_available").notNull().default(true),
  availabilityCheckedAt: timestamp("availability_checked_at"),
}, (table) => ({
  playlistIdIdx: index("suggestions_playlist_id_idx").on(table.playlistId),
  suggestedByIdx: index("suggestions_suggested_by_idx").on(table.suggestedBy),
  statusIdx: index("suggestions_status_idx").on(table.status),
  scoreIdx: index("suggestions_score_idx").on(table.score.desc()),
  songIdPlaylistIdx: unique("unique_suggestion_song_playlist").on(table.playlistId, table.songId),
}));

// Suggestion votes
export const suggestionVotes = pgTable("suggestion_votes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  suggestionId: text("suggestion_id")
    .notNull()
    .references(() => playlistSuggestions.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  vote: integer("vote").notNull(), // 1 for upvote, -1 for downvote
  votedAt: timestamp("voted_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  suggestionIdIdx: index("votes_suggestion_id_idx").on(table.suggestionId),
  userIdIdx: index("votes_user_id_idx").on(table.userId),
  uniqueVote: unique("unique_suggestion_vote").on(table.suggestionId, table.userId),
}));

// Collaboration activity log
export const collaborationActivity = pgTable("collaboration_activity", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => userPlaylists.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Activity type
  activityType: text("activity_type").notNull(), // 'suggestion_added', 'vote', 'song_approved', 'song_rejected', 'collaborator_joined', etc.
  // Activity data (JSON for flexibility)
  metadata: text("metadata"), // JSON string with activity-specific data
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => ({
  playlistIdIdx: index("activity_playlist_id_idx").on(table.playlistId),
  userIdIdx: index("activity_user_id_idx").on(table.userId),
  createdAtIdx: index("activity_created_at_idx").on(table.createdAt.desc()),
}));

// Type exports
export type PlaylistCollaborationSettings = typeof playlistCollaborationSettings.$inferSelect;
export type PlaylistCollaborationSettingsInsert = typeof playlistCollaborationSettings.$inferInsert;
export type PlaylistCollaborator = typeof playlistCollaborators.$inferSelect;
export type PlaylistCollaboratorInsert = typeof playlistCollaborators.$inferInsert;
export type PlaylistSuggestion = typeof playlistSuggestions.$inferSelect;
export type PlaylistSuggestionInsert = typeof playlistSuggestions.$inferInsert;
export type SuggestionVote = typeof suggestionVotes.$inferSelect;
export type SuggestionVoteInsert = typeof suggestionVotes.$inferInsert;
export type CollaborationActivity = typeof collaborationActivity.$inferSelect;
export type CollaborationActivityInsert = typeof collaborationActivity.$inferInsert;

// Enum value types for TypeScript
export type PlaylistPrivacy = "public" | "private" | "invite_only";
export type CollaboratorRole = "owner" | "editor" | "viewer";
export type SuggestionStatus = "pending" | "approved" | "rejected";
