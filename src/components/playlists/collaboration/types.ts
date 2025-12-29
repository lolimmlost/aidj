// Types for collaborative playlist components

export type CollaboratorRole = "owner" | "editor" | "viewer";
export type SuggestionStatus = "pending" | "approved" | "rejected";
export type PlaylistPrivacy = "public" | "private" | "invite_only";

export interface Collaborator {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: CollaboratorRole;
  isOnline: boolean;
  lastActiveAt: Date | null;
}

export interface CollaborationSettings {
  id: string;
  playlistId: string;
  privacy: PlaylistPrivacy;
  allowSuggestions: boolean;
  autoApproveThreshold: number | null;
  maxSuggestionsPerUser: number | null;
  maxTotalSuggestions: number | null;
  notifyOnSuggestion: boolean;
  notifyOnVote: boolean;
  notifyOnApproval: boolean;
  shareCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Suggestion {
  id: string;
  playlistId: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  songAlbum: string | null;
  songDuration: number | null;
  suggestedBy: string;
  suggestedByName: string;
  suggestedAt: Date;
  status: SuggestionStatus;
  upvotes: number;
  downvotes: number;
  score: number;
  userVote: number | null;
  processedBy: string | null;
  processedAt: Date | null;
  rejectionReason: string | null;
  isAvailable: boolean;
}

export interface CollaborativePlaylistData {
  playlist: {
    id: string;
    name: string;
    description: string | null;
    userId: string;
    songCount: number | null;
    totalDuration: number | null;
    createdAt: Date;
    updatedAt: Date;
  };
  settings: CollaborationSettings | null;
  collaborators: Collaborator[];
  userRole: CollaboratorRole | null;
  canEdit: boolean;
  canSuggest: boolean;
}

export interface ActivityItem {
  id: string;
  playlistId: string;
  userId: string;
  userName: string;
  activityType: string;
  metadata: string | null;
  createdAt: Date;
}

// SSE Event types
export type CollaborativePlaylistEvent =
  | { type: "connected"; data: { connectionId: string; playlistId: string } }
  | { type: "suggestion_added"; data: { suggestion: Suggestion } }
  | { type: "suggestion_voted"; data: { suggestionId: string; score: number; upvotes: number; downvotes: number } }
  | { type: "suggestion_approved"; data: { suggestionId: string; song: Record<string, unknown> } }
  | { type: "suggestion_rejected"; data: { suggestionId: string; reason?: string } }
  | { type: "suggestion_withdrawn"; data: { suggestionId: string } }
  | { type: "collaborator_joined"; data: { userId: string; name: string; role: string } }
  | { type: "collaborator_left"; data: { userId: string } }
  | { type: "collaborator_presence"; data: { userId: string; isOnline: boolean } }
  | { type: "playlist_updated"; data: { changes: Record<string, unknown> } }
  | { type: "ping"; data: { timestamp: number } };
