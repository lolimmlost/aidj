/**
 * Collaborative Playlist Service
 *
 * Business logic for collaborative playlist features including:
 * - Playlist sharing & collaboration management
 * - Song suggestions and voting
 * - Real-time synchronization support
 * - Approval workflow
 */

import { db } from "../db";
import {
  userPlaylists,
  playlistSongs,
  playlistCollaborationSettings,
  playlistCollaborators,
  playlistSuggestions,
  suggestionVotes,
  collaborationActivity,
  user,
  type PlaylistPrivacy,
  type CollaboratorRole,
  type SuggestionStatus,
} from "../db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { ServiceError } from "../utils";

// Types for service operations
export interface CreateCollaborativePlaylistInput {
  userId: string;
  name: string;
  description?: string;
  privacy: PlaylistPrivacy;
  allowSuggestions?: boolean;
  autoApproveThreshold?: number | null;
}

export interface InviteCollaboratorInput {
  playlistId: string;
  inviterId: string;
  inviteeEmail?: string;
  inviteeId?: string;
  role: CollaboratorRole;
}

export interface SuggestSongInput {
  playlistId: string;
  userId: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  songAlbum?: string;
  songDuration?: number;
}

export interface VoteOnSuggestionInput {
  suggestionId: string;
  userId: string;
  vote: 1 | -1; // 1 = upvote, -1 = downvote
}

export interface ProcessSuggestionInput {
  suggestionId: string;
  processedBy: string;
  action: "approve" | "reject";
  rejectionReason?: string;
}

// Error codes
export const COLLAB_ERROR_CODES = {
  NOT_COLLABORATOR: "NOT_COLLABORATOR",
  NOT_OWNER: "NOT_OWNER",
  NOT_EDITOR: "NOT_EDITOR",
  PLAYLIST_NOT_FOUND: "PLAYLIST_NOT_FOUND",
  SUGGESTION_NOT_FOUND: "SUGGESTION_NOT_FOUND",
  ALREADY_COLLABORATOR: "ALREADY_COLLABORATOR",
  SUGGESTION_LIMIT_REACHED: "SUGGESTION_LIMIT_REACHED",
  SONG_ALREADY_SUGGESTED: "SONG_ALREADY_SUGGESTED",
  SONG_ALREADY_IN_PLAYLIST: "SONG_ALREADY_IN_PLAYLIST",
  CANNOT_VOTE_OWN_SUGGESTION: "CANNOT_VOTE_OWN_SUGGESTION",
  SUGGESTIONS_DISABLED: "SUGGESTIONS_DISABLED",
  INVALID_SHARE_CODE: "INVALID_SHARE_CODE",
} as const;

/**
 * Generate a unique share code for invite-only playlists
 */
function generateShareCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Check if a user has a specific role or higher for a playlist
 */
export async function checkCollaboratorRole(
  playlistId: string,
  userId: string,
  minimumRole: CollaboratorRole
): Promise<{ hasAccess: boolean; role: CollaboratorRole | null }> {
  const collaborator = await db
    .select({ role: playlistCollaborators.role })
    .from(playlistCollaborators)
    .where(
      and(
        eq(playlistCollaborators.playlistId, playlistId),
        eq(playlistCollaborators.userId, userId)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!collaborator) {
    return { hasAccess: false, role: null };
  }

  const roleHierarchy: CollaboratorRole[] = ["viewer", "editor", "owner"];
  const userRoleIndex = roleHierarchy.indexOf(collaborator.role);
  const minimumRoleIndex = roleHierarchy.indexOf(minimumRole);

  return {
    hasAccess: userRoleIndex >= minimumRoleIndex,
    role: collaborator.role,
  };
}

/**
 * Enable collaboration on an existing playlist
 */
export async function enablePlaylistCollaboration(
  playlistId: string,
  userId: string,
  settings: {
    privacy?: PlaylistPrivacy;
    allowSuggestions?: boolean;
    autoApproveThreshold?: number | null;
  }
): Promise<{ settings: typeof playlistCollaborationSettings.$inferSelect; shareCode?: string }> {
  // Verify ownership
  const playlist = await db
    .select()
    .from(userPlaylists)
    .where(
      and(eq(userPlaylists.id, playlistId), eq(userPlaylists.userId, userId))
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!playlist) {
    throw new ServiceError(
      COLLAB_ERROR_CODES.PLAYLIST_NOT_FOUND,
      "Playlist not found or you don't own it"
    );
  }

  // Check if settings already exist
  const existingSettings = await db
    .select()
    .from(playlistCollaborationSettings)
    .where(eq(playlistCollaborationSettings.playlistId, playlistId))
    .limit(1)
    .then((rows) => rows[0]);

  let shareCode: string | undefined;
  if (settings.privacy === "invite_only" && !existingSettings?.shareCode) {
    shareCode = generateShareCode();
  }

  if (existingSettings) {
    // Update existing settings
    const [updated] = await db
      .update(playlistCollaborationSettings)
      .set({
        privacy: settings.privacy ?? existingSettings.privacy,
        allowSuggestions: settings.allowSuggestions ?? existingSettings.allowSuggestions,
        autoApproveThreshold: settings.autoApproveThreshold !== undefined
          ? settings.autoApproveThreshold
          : existingSettings.autoApproveThreshold,
        shareCode: shareCode ?? existingSettings.shareCode,
        updatedAt: new Date(),
      })
      .where(eq(playlistCollaborationSettings.id, existingSettings.id))
      .returning();

    return { settings: updated, shareCode };
  }

  // Create new settings
  const [newSettings] = await db
    .insert(playlistCollaborationSettings)
    .values({
      playlistId,
      privacy: settings.privacy ?? "private",
      allowSuggestions: settings.allowSuggestions ?? true,
      autoApproveThreshold: settings.autoApproveThreshold ?? 3,
      shareCode,
    })
    .returning();

  // Add owner as collaborator
  await db.insert(playlistCollaborators).values({
    playlistId,
    userId,
    role: "owner",
    invitedBy: userId,
    acceptedAt: new Date(),
  }).onConflictDoNothing();

  return { settings: newSettings, shareCode };
}

/**
 * Get playlist with collaboration details
 */
export async function getCollaborativePlaylist(
  playlistId: string,
  userId: string
): Promise<{
  playlist: typeof userPlaylists.$inferSelect;
  settings: typeof playlistCollaborationSettings.$inferSelect | null;
  collaborators: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
    role: CollaboratorRole;
    isOnline: boolean;
    lastActiveAt: Date | null;
  }>;
  userRole: CollaboratorRole | null;
  canEdit: boolean;
  canSuggest: boolean;
}> {
  // Get playlist
  const playlist = await db
    .select()
    .from(userPlaylists)
    .where(eq(userPlaylists.id, playlistId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!playlist) {
    throw new ServiceError(COLLAB_ERROR_CODES.PLAYLIST_NOT_FOUND, "Playlist not found");
  }

  // Get settings
  const settings = await db
    .select()
    .from(playlistCollaborationSettings)
    .where(eq(playlistCollaborationSettings.playlistId, playlistId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  // Check user access
  const { role: userRole } = await checkCollaboratorRole(playlistId, userId);

  // If not a collaborator, check if public or if user is owner
  if (!userRole) {
    if (playlist.userId !== userId && settings?.privacy !== "public") {
      throw new ServiceError(
        COLLAB_ERROR_CODES.NOT_COLLABORATOR,
        "You don't have access to this playlist"
      );
    }
  }

  // Get collaborators
  const collaborators = await db
    .select({
      id: playlistCollaborators.id,
      odId: playlistCollaborators.userId,
      name: user.name,
      email: user.email,
      role: playlistCollaborators.role,
      isOnline: playlistCollaborators.isOnline,
      lastActiveAt: playlistCollaborators.lastActiveAt,
    })
    .from(playlistCollaborators)
    .innerJoin(user, eq(playlistCollaborators.userId, user.id))
    .where(eq(playlistCollaborators.playlistId, playlistId))
    .orderBy(
      desc(sql`CASE WHEN ${playlistCollaborators.role} = 'owner' THEN 0
                    WHEN ${playlistCollaborators.role} = 'editor' THEN 1
                    ELSE 2 END`),
      asc(user.name)
    );

  const effectiveRole = userRole ?? (playlist.userId === userId ? "owner" : null);
  const canEdit = effectiveRole === "owner" || effectiveRole === "editor";
  const canSuggest = settings?.allowSuggestions !== false && effectiveRole !== null;

  return {
    playlist,
    settings,
    collaborators: collaborators.map((c) => ({
      id: c.id,
      odId: c.odId,
      userId: c.odId,
      name: c.name,
      email: c.email,
      role: c.role,
      isOnline: c.isOnline,
      lastActiveAt: c.lastActiveAt,
    })),
    userRole: effectiveRole,
    canEdit,
    canSuggest,
  };
}

/**
 * Invite a collaborator to a playlist
 */
export async function inviteCollaborator(input: InviteCollaboratorInput): Promise<{
  collaborator: typeof playlistCollaborators.$inferSelect;
  inviteeInfo: { id: string; name: string; email: string };
}> {
  // Verify inviter is owner
  const { hasAccess } = await checkCollaboratorRole(input.playlistId, input.inviterId, "owner");
  if (!hasAccess) {
    throw new ServiceError(COLLAB_ERROR_CODES.NOT_OWNER, "Only the owner can invite collaborators");
  }

  // Find invitee
  let invitee: { id: string; name: string; email: string } | undefined;
  if (input.inviteeId) {
    invitee = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, input.inviteeId))
      .limit(1)
      .then((rows) => rows[0]);
  } else if (input.inviteeEmail) {
    invitee = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.email, input.inviteeEmail))
      .limit(1)
      .then((rows) => rows[0]);
  }

  if (!invitee) {
    throw new ServiceError("USER_NOT_FOUND", "User not found");
  }

  // Check if already a collaborator
  const existing = await db
    .select()
    .from(playlistCollaborators)
    .where(
      and(
        eq(playlistCollaborators.playlistId, input.playlistId),
        eq(playlistCollaborators.userId, invitee.id)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    throw new ServiceError(
      COLLAB_ERROR_CODES.ALREADY_COLLABORATOR,
      "User is already a collaborator"
    );
  }

  // Create collaborator
  const [collaborator] = await db
    .insert(playlistCollaborators)
    .values({
      playlistId: input.playlistId,
      userId: invitee.id,
      role: input.role,
      invitedBy: input.inviterId,
    })
    .returning();

  // Log activity
  await logActivity(input.playlistId, input.inviterId, "collaborator_invited", {
    inviteeId: invitee.id,
    inviteeName: invitee.name,
    role: input.role,
  });

  return { collaborator, inviteeInfo: invitee };
}

/**
 * Join a playlist using share code
 */
export async function joinPlaylistByShareCode(
  shareCode: string,
  userId: string
): Promise<{
  playlist: typeof userPlaylists.$inferSelect;
  collaborator: typeof playlistCollaborators.$inferSelect;
}> {
  // Find playlist by share code
  const settings = await db
    .select()
    .from(playlistCollaborationSettings)
    .where(eq(playlistCollaborationSettings.shareCode, shareCode))
    .limit(1)
    .then((rows) => rows[0]);

  if (!settings) {
    throw new ServiceError(COLLAB_ERROR_CODES.INVALID_SHARE_CODE, "Invalid share code");
  }

  // Get playlist
  const playlist = await db
    .select()
    .from(userPlaylists)
    .where(eq(userPlaylists.id, settings.playlistId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!playlist) {
    throw new ServiceError(COLLAB_ERROR_CODES.PLAYLIST_NOT_FOUND, "Playlist not found");
  }

  // Check if already a collaborator
  const existing = await db
    .select()
    .from(playlistCollaborators)
    .where(
      and(
        eq(playlistCollaborators.playlistId, settings.playlistId),
        eq(playlistCollaborators.userId, userId)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    return { playlist, collaborator: existing };
  }

  // Add as viewer
  const [collaborator] = await db
    .insert(playlistCollaborators)
    .values({
      playlistId: settings.playlistId,
      userId,
      role: "viewer",
      acceptedAt: new Date(),
    })
    .returning();

  // Log activity
  await logActivity(settings.playlistId, userId, "collaborator_joined", {});

  return { playlist, collaborator };
}

/**
 * Remove a collaborator from a playlist
 */
export async function removeCollaborator(
  playlistId: string,
  requesterId: string,
  collaboratorId: string
): Promise<void> {
  // Check if requester is owner or removing themselves
  const { hasAccess, role } = await checkCollaboratorRole(playlistId, requesterId, "viewer");

  if (!hasAccess) {
    throw new ServiceError(COLLAB_ERROR_CODES.NOT_COLLABORATOR, "Not a collaborator");
  }

  if (requesterId !== collaboratorId && role !== "owner") {
    throw new ServiceError(COLLAB_ERROR_CODES.NOT_OWNER, "Only the owner can remove collaborators");
  }

  // Cannot remove the owner
  const targetCollab = await db
    .select()
    .from(playlistCollaborators)
    .where(
      and(
        eq(playlistCollaborators.playlistId, playlistId),
        eq(playlistCollaborators.userId, collaboratorId)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (targetCollab?.role === "owner") {
    throw new ServiceError("CANNOT_REMOVE_OWNER", "Cannot remove the playlist owner");
  }

  await db
    .delete(playlistCollaborators)
    .where(
      and(
        eq(playlistCollaborators.playlistId, playlistId),
        eq(playlistCollaborators.userId, collaboratorId)
      )
    );

  await logActivity(playlistId, requesterId, "collaborator_removed", {
    removedUserId: collaboratorId,
  });
}

/**
 * Transfer playlist ownership
 */
export async function transferOwnership(
  playlistId: string,
  currentOwnerId: string,
  newOwnerId: string
): Promise<void> {
  // Verify current owner
  const { role } = await checkCollaboratorRole(playlistId, currentOwnerId, "owner");
  if (role !== "owner") {
    throw new ServiceError(COLLAB_ERROR_CODES.NOT_OWNER, "Only the owner can transfer ownership");
  }

  // Verify new owner is a collaborator
  const { hasAccess } = await checkCollaboratorRole(playlistId, newOwnerId, "viewer");
  if (!hasAccess) {
    throw new ServiceError(COLLAB_ERROR_CODES.NOT_COLLABORATOR, "New owner must be a collaborator");
  }

  // Update playlist owner
  await db
    .update(userPlaylists)
    .set({ userId: newOwnerId, updatedAt: new Date() })
    .where(eq(userPlaylists.id, playlistId));

  // Update collaborator roles
  await db
    .update(playlistCollaborators)
    .set({ role: "editor" })
    .where(
      and(
        eq(playlistCollaborators.playlistId, playlistId),
        eq(playlistCollaborators.userId, currentOwnerId)
      )
    );

  await db
    .update(playlistCollaborators)
    .set({ role: "owner" })
    .where(
      and(
        eq(playlistCollaborators.playlistId, playlistId),
        eq(playlistCollaborators.userId, newOwnerId)
      )
    );

  await logActivity(playlistId, currentOwnerId, "ownership_transferred", {
    newOwnerId,
  });
}

/**
 * Suggest a song for the playlist
 */
export async function suggestSong(input: SuggestSongInput): Promise<{
  suggestion: typeof playlistSuggestions.$inferSelect;
}> {
  // Check if user is a collaborator
  const { hasAccess } = await checkCollaboratorRole(input.playlistId, input.userId, "viewer");
  if (!hasAccess) {
    throw new ServiceError(COLLAB_ERROR_CODES.NOT_COLLABORATOR, "Not a collaborator");
  }

  // Get settings
  const settings = await db
    .select()
    .from(playlistCollaborationSettings)
    .where(eq(playlistCollaborationSettings.playlistId, input.playlistId))
    .limit(1)
    .then((rows) => rows[0]);

  if (settings && !settings.allowSuggestions) {
    throw new ServiceError(COLLAB_ERROR_CODES.SUGGESTIONS_DISABLED, "Suggestions are disabled");
  }

  // Check if song already in playlist
  const existingInPlaylist = await db
    .select()
    .from(playlistSongs)
    .where(
      and(
        eq(playlistSongs.playlistId, input.playlistId),
        eq(playlistSongs.songId, input.songId)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (existingInPlaylist) {
    throw new ServiceError(
      COLLAB_ERROR_CODES.SONG_ALREADY_IN_PLAYLIST,
      "Song is already in the playlist"
    );
  }

  // Check if song already suggested
  const existingSuggestion = await db
    .select()
    .from(playlistSuggestions)
    .where(
      and(
        eq(playlistSuggestions.playlistId, input.playlistId),
        eq(playlistSuggestions.songId, input.songId),
        eq(playlistSuggestions.status, "pending")
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (existingSuggestion) {
    throw new ServiceError(
      COLLAB_ERROR_CODES.SONG_ALREADY_SUGGESTED,
      "Song has already been suggested"
    );
  }

  // Check suggestion limits
  if (settings?.maxSuggestionsPerUser) {
    const userSuggestionCount = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(playlistSuggestions)
      .where(
        and(
          eq(playlistSuggestions.playlistId, input.playlistId),
          eq(playlistSuggestions.suggestedBy, input.userId),
          eq(playlistSuggestions.status, "pending")
        )
      )
      .then((rows) => rows[0]?.count ?? 0);

    if (userSuggestionCount >= settings.maxSuggestionsPerUser) {
      throw new ServiceError(
        COLLAB_ERROR_CODES.SUGGESTION_LIMIT_REACHED,
        `You can only have ${settings.maxSuggestionsPerUser} pending suggestions`
      );
    }
  }

  if (settings?.maxTotalSuggestions) {
    const totalSuggestionCount = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(playlistSuggestions)
      .where(
        and(
          eq(playlistSuggestions.playlistId, input.playlistId),
          eq(playlistSuggestions.status, "pending")
        )
      )
      .then((rows) => rows[0]?.count ?? 0);

    if (totalSuggestionCount >= settings.maxTotalSuggestions) {
      throw new ServiceError(
        COLLAB_ERROR_CODES.SUGGESTION_LIMIT_REACHED,
        "Maximum number of pending suggestions reached"
      );
    }
  }

  // Create suggestion
  const [suggestion] = await db
    .insert(playlistSuggestions)
    .values({
      playlistId: input.playlistId,
      songId: input.songId,
      songTitle: input.songTitle,
      songArtist: input.songArtist,
      songAlbum: input.songAlbum,
      songDuration: input.songDuration,
      suggestedBy: input.userId,
    })
    .returning();

  await logActivity(input.playlistId, input.userId, "suggestion_added", {
    suggestionId: suggestion.id,
    songTitle: input.songTitle,
    songArtist: input.songArtist,
  });

  return { suggestion };
}

/**
 * Get suggestions for a playlist
 */
export async function getPlaylistSuggestions(
  playlistId: string,
  userId: string,
  options: {
    status?: SuggestionStatus;
    sortBy?: "score" | "date";
    limit?: number;
    offset?: number;
  } = {}
): Promise<{
  suggestions: Array<
    typeof playlistSuggestions.$inferSelect & {
      suggestedByName: string;
      userVote: number | null;
    }
  >;
  total: number;
}> {
  // Check access
  const { hasAccess } = await checkCollaboratorRole(playlistId, userId, "viewer");
  if (!hasAccess) {
    throw new ServiceError(COLLAB_ERROR_CODES.NOT_COLLABORATOR, "Not a collaborator");
  }

  const { status = "pending", sortBy = "score", limit = 50, offset = 0 } = options;

  // Get suggestions with user info and vote
  const suggestions = await db
    .select({
      suggestion: playlistSuggestions,
      suggestedByName: user.name,
      userVote: suggestionVotes.vote,
    })
    .from(playlistSuggestions)
    .innerJoin(user, eq(playlistSuggestions.suggestedBy, user.id))
    .leftJoin(
      suggestionVotes,
      and(
        eq(suggestionVotes.suggestionId, playlistSuggestions.id),
        eq(suggestionVotes.userId, userId)
      )
    )
    .where(
      and(
        eq(playlistSuggestions.playlistId, playlistId),
        eq(playlistSuggestions.status, status)
      )
    )
    .orderBy(
      sortBy === "score"
        ? desc(playlistSuggestions.score)
        : desc(playlistSuggestions.suggestedAt)
    )
    .limit(limit)
    .offset(offset);

  // Get total count
  const [{ count: total }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(playlistSuggestions)
    .where(
      and(
        eq(playlistSuggestions.playlistId, playlistId),
        eq(playlistSuggestions.status, status)
      )
    );

  return {
    suggestions: suggestions.map((s) => ({
      ...s.suggestion,
      suggestedByName: s.suggestedByName,
      userVote: s.userVote,
    })),
    total,
  };
}

/**
 * Vote on a suggestion
 */
export async function voteOnSuggestion(input: VoteOnSuggestionInput): Promise<{
  suggestion: typeof playlistSuggestions.$inferSelect;
  previousVote: number | null;
}> {
  // Get suggestion
  const suggestion = await db
    .select()
    .from(playlistSuggestions)
    .where(eq(playlistSuggestions.id, input.suggestionId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!suggestion) {
    throw new ServiceError(COLLAB_ERROR_CODES.SUGGESTION_NOT_FOUND, "Suggestion not found");
  }

  // Check if user is a collaborator
  const { hasAccess } = await checkCollaboratorRole(suggestion.playlistId, input.userId, "viewer");
  if (!hasAccess) {
    throw new ServiceError(COLLAB_ERROR_CODES.NOT_COLLABORATOR, "Not a collaborator");
  }

  // Cannot vote on own suggestion
  if (suggestion.suggestedBy === input.userId) {
    throw new ServiceError(
      COLLAB_ERROR_CODES.CANNOT_VOTE_OWN_SUGGESTION,
      "Cannot vote on your own suggestion"
    );
  }

  // Get existing vote
  const existingVote = await db
    .select()
    .from(suggestionVotes)
    .where(
      and(
        eq(suggestionVotes.suggestionId, input.suggestionId),
        eq(suggestionVotes.userId, input.userId)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  const previousVote = existingVote?.vote ?? null;

  // Calculate vote change
  let upvoteChange = 0;
  let downvoteChange = 0;
  let scoreChange = 0;

  if (existingVote) {
    if (existingVote.vote === input.vote) {
      // Same vote - remove it
      await db
        .delete(suggestionVotes)
        .where(eq(suggestionVotes.id, existingVote.id));

      if (input.vote === 1) {
        upvoteChange = -1;
        scoreChange = -1;
      } else {
        downvoteChange = -1;
        scoreChange = 1;
      }
    } else {
      // Changed vote
      await db
        .update(suggestionVotes)
        .set({ vote: input.vote, updatedAt: new Date() })
        .where(eq(suggestionVotes.id, existingVote.id));

      if (input.vote === 1) {
        upvoteChange = 1;
        downvoteChange = -1;
        scoreChange = 2;
      } else {
        upvoteChange = -1;
        downvoteChange = 1;
        scoreChange = -2;
      }
    }
  } else {
    // New vote
    await db.insert(suggestionVotes).values({
      suggestionId: input.suggestionId,
      userId: input.userId,
      vote: input.vote,
    });

    if (input.vote === 1) {
      upvoteChange = 1;
      scoreChange = 1;
    } else {
      downvoteChange = 1;
      scoreChange = -1;
    }
  }

  // Update suggestion counts
  const [updatedSuggestion] = await db
    .update(playlistSuggestions)
    .set({
      upvotes: sql`${playlistSuggestions.upvotes} + ${upvoteChange}`,
      downvotes: sql`${playlistSuggestions.downvotes} + ${downvoteChange}`,
      score: sql`${playlistSuggestions.score} + ${scoreChange}`,
    })
    .where(eq(playlistSuggestions.id, input.suggestionId))
    .returning();

  // Check for auto-approval
  const settings = await db
    .select()
    .from(playlistCollaborationSettings)
    .where(eq(playlistCollaborationSettings.playlistId, suggestion.playlistId))
    .limit(1)
    .then((rows) => rows[0]);

  if (
    settings?.autoApproveThreshold &&
    updatedSuggestion.score >= settings.autoApproveThreshold
  ) {
    // Auto-approve
    await approveSuggestion(updatedSuggestion, "system");
  }

  await logActivity(suggestion.playlistId, input.userId, "vote_cast", {
    suggestionId: input.suggestionId,
    vote: input.vote,
    newScore: updatedSuggestion.score,
  });

  return { suggestion: updatedSuggestion, previousVote };
}

/**
 * Withdraw a suggestion
 */
export async function withdrawSuggestion(
  suggestionId: string,
  userId: string
): Promise<void> {
  const suggestion = await db
    .select()
    .from(playlistSuggestions)
    .where(eq(playlistSuggestions.id, suggestionId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!suggestion) {
    throw new ServiceError(COLLAB_ERROR_CODES.SUGGESTION_NOT_FOUND, "Suggestion not found");
  }

  if (suggestion.suggestedBy !== userId) {
    throw new ServiceError("NOT_SUGGESTION_OWNER", "You can only withdraw your own suggestions");
  }

  if (suggestion.status !== "pending") {
    throw new ServiceError("SUGGESTION_ALREADY_PROCESSED", "Suggestion has already been processed");
  }

  await db.delete(playlistSuggestions).where(eq(playlistSuggestions.id, suggestionId));

  await logActivity(suggestion.playlistId, userId, "suggestion_withdrawn", {
    songTitle: suggestion.songTitle,
  });
}

/**
 * Process a suggestion (approve/reject)
 */
export async function processSuggestion(input: ProcessSuggestionInput): Promise<{
  suggestion: typeof playlistSuggestions.$inferSelect;
  addedSong?: typeof playlistSongs.$inferSelect;
}> {
  const suggestion = await db
    .select()
    .from(playlistSuggestions)
    .where(eq(playlistSuggestions.id, input.suggestionId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!suggestion) {
    throw new ServiceError(COLLAB_ERROR_CODES.SUGGESTION_NOT_FOUND, "Suggestion not found");
  }

  // Check if user is owner or editor
  const { hasAccess } = await checkCollaboratorRole(
    suggestion.playlistId,
    input.processedBy,
    "editor"
  );
  if (!hasAccess) {
    throw new ServiceError(
      COLLAB_ERROR_CODES.NOT_EDITOR,
      "Only owners and editors can process suggestions"
    );
  }

  if (suggestion.status !== "pending") {
    throw new ServiceError("SUGGESTION_ALREADY_PROCESSED", "Suggestion has already been processed");
  }

  if (input.action === "approve") {
    return approveSuggestion(suggestion, input.processedBy);
  } else {
    return rejectSuggestion(suggestion, input.processedBy, input.rejectionReason);
  }
}

/**
 * Internal: Approve a suggestion and add song to playlist
 */
async function approveSuggestion(
  suggestion: typeof playlistSuggestions.$inferSelect,
  processedBy: string
): Promise<{
  suggestion: typeof playlistSuggestions.$inferSelect;
  addedSong: typeof playlistSongs.$inferSelect;
}> {
  // Get current max position
  const maxPosition = await db
    .select({ maxPos: sql<number>`coalesce(max(${playlistSongs.position}), -1)` })
    .from(playlistSongs)
    .where(eq(playlistSongs.playlistId, suggestion.playlistId))
    .then((rows) => rows[0]?.maxPos ?? -1);

  // Add song to playlist
  const [addedSong] = await db
    .insert(playlistSongs)
    .values({
      playlistId: suggestion.playlistId,
      songId: suggestion.songId,
      songArtistTitle: `${suggestion.songArtist} - ${suggestion.songTitle}`,
      position: maxPosition + 1,
    })
    .returning();

  // Update suggestion status
  const [updatedSuggestion] = await db
    .update(playlistSuggestions)
    .set({
      status: "approved",
      processedBy,
      processedAt: new Date(),
    })
    .where(eq(playlistSuggestions.id, suggestion.id))
    .returning();

  await logActivity(suggestion.playlistId, processedBy, "suggestion_approved", {
    suggestionId: suggestion.id,
    songTitle: suggestion.songTitle,
    suggestedBy: suggestion.suggestedBy,
  });

  return { suggestion: updatedSuggestion, addedSong };
}

/**
 * Internal: Reject a suggestion
 */
async function rejectSuggestion(
  suggestion: typeof playlistSuggestions.$inferSelect,
  processedBy: string,
  rejectionReason?: string
): Promise<{ suggestion: typeof playlistSuggestions.$inferSelect }> {
  const [updatedSuggestion] = await db
    .update(playlistSuggestions)
    .set({
      status: "rejected",
      processedBy,
      processedAt: new Date(),
      rejectionReason,
    })
    .where(eq(playlistSuggestions.id, suggestion.id))
    .returning();

  await logActivity(suggestion.playlistId, processedBy, "suggestion_rejected", {
    suggestionId: suggestion.id,
    songTitle: suggestion.songTitle,
    suggestedBy: suggestion.suggestedBy,
    reason: rejectionReason,
  });

  return { suggestion: updatedSuggestion };
}

/**
 * Update collaborator presence (online status)
 */
export async function updateCollaboratorPresence(
  playlistId: string,
  userId: string,
  isOnline: boolean
): Promise<void> {
  await db
    .update(playlistCollaborators)
    .set({
      isOnline,
      lastActiveAt: new Date(),
    })
    .where(
      and(
        eq(playlistCollaborators.playlistId, playlistId),
        eq(playlistCollaborators.userId, userId)
      )
    );
}

/**
 * Get recent activity for a playlist
 */
export async function getPlaylistActivity(
  playlistId: string,
  userId: string,
  limit = 50
): Promise<Array<typeof collaborationActivity.$inferSelect & { userName: string }>> {
  // Check access
  const { hasAccess } = await checkCollaboratorRole(playlistId, userId, "viewer");
  if (!hasAccess) {
    throw new ServiceError(COLLAB_ERROR_CODES.NOT_COLLABORATOR, "Not a collaborator");
  }

  return db
    .select({
      activity: collaborationActivity,
      userName: user.name,
    })
    .from(collaborationActivity)
    .innerJoin(user, eq(collaborationActivity.userId, user.id))
    .where(eq(collaborationActivity.playlistId, playlistId))
    .orderBy(desc(collaborationActivity.createdAt))
    .limit(limit)
    .then((rows) =>
      rows.map((r) => ({
        ...r.activity,
        userName: r.userName,
      }))
    );
}

/**
 * Log collaboration activity
 */
async function logActivity(
  playlistId: string,
  userId: string,
  activityType: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await db.insert(collaborationActivity).values({
    playlistId,
    userId,
    activityType,
    metadata: JSON.stringify(metadata),
  });
}

/**
 * Get public playlists
 */
export async function getPublicPlaylists(
  limit = 20,
  offset = 0
): Promise<Array<typeof userPlaylists.$inferSelect & { ownerName: string; collaboratorCount: number }>> {
  return db
    .select({
      playlist: userPlaylists,
      ownerName: user.name,
      collaboratorCount: sql<number>`cast(count(${playlistCollaborators.id}) as int)`,
    })
    .from(userPlaylists)
    .innerJoin(
      playlistCollaborationSettings,
      eq(userPlaylists.id, playlistCollaborationSettings.playlistId)
    )
    .innerJoin(user, eq(userPlaylists.userId, user.id))
    .leftJoin(playlistCollaborators, eq(userPlaylists.id, playlistCollaborators.playlistId))
    .where(eq(playlistCollaborationSettings.privacy, "public"))
    .groupBy(userPlaylists.id, user.name)
    .orderBy(desc(userPlaylists.createdAt))
    .limit(limit)
    .offset(offset)
    .then((rows) =>
      rows.map((r) => ({
        ...r.playlist,
        ownerName: r.ownerName,
        collaboratorCount: r.collaboratorCount,
      }))
    );
}
