import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useCallback, useState } from "react";
import { toast } from "sonner";
import type {
  CollaborativePlaylistData,
  Suggestion,
  ActivityItem,
  CollaborativePlaylistEvent,
  CollaboratorRole,
  PlaylistPrivacy,
} from "./types";

// Query keys
export const collaborationKeys = {
  all: ["collaboration"] as const,
  playlist: (playlistId: string) => [...collaborationKeys.all, "playlist", playlistId] as const,
  suggestions: (playlistId: string, status?: string) =>
    [...collaborationKeys.all, "suggestions", playlistId, status] as const,
  activity: (playlistId: string) => [...collaborationKeys.all, "activity", playlistId] as const,
};

/**
 * Hook for managing collaborative playlist data and real-time updates
 */
export function useCollaborativePlaylist(playlistId: string) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Fetch collaboration details
  const {
    data: collaborationData,
    isLoading,
    error,
  } = useQuery<CollaborativePlaylistData>({
    queryKey: collaborationKeys.playlist(playlistId),
    queryFn: async () => {
      const response = await fetch(`/api/playlists/${playlistId}/collaboration/`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch collaboration data");
      }
      const json = await response.json();
      return json.data;
    },
    enabled: !!playlistId,
    staleTime: 30000, // 30 seconds
  });

  // Handle SSE events
  const handleSSEEvent = useCallback(
    (event: CollaborativePlaylistEvent) => {
      switch (event.type) {
        case "suggestion_added":
          queryClient.invalidateQueries({
            queryKey: collaborationKeys.suggestions(playlistId),
          });
          toast.info("New song suggestion", {
            description: `${event.data.suggestion.songArtist} - ${event.data.suggestion.songTitle}`,
          });
          break;

        case "suggestion_voted":
          // Update suggestion score in cache
          queryClient.setQueryData<{ suggestions: Suggestion[]; total: number }>(
            collaborationKeys.suggestions(playlistId, "pending"),
            (old) => {
              if (!old) return old;
              return {
                ...old,
                suggestions: old.suggestions.map((s) =>
                  s.id === event.data.suggestionId
                    ? {
                        ...s,
                        score: event.data.score,
                        upvotes: event.data.upvotes,
                        downvotes: event.data.downvotes,
                      }
                    : s
                ),
              };
            }
          );
          break;

        case "suggestion_approved":
          queryClient.invalidateQueries({
            queryKey: collaborationKeys.suggestions(playlistId),
          });
          queryClient.invalidateQueries({
            queryKey: ["playlist", playlistId],
          });
          toast.success("Song approved and added to playlist!");
          break;

        case "suggestion_rejected":
          queryClient.invalidateQueries({
            queryKey: collaborationKeys.suggestions(playlistId),
          });
          break;

        case "suggestion_withdrawn":
          queryClient.invalidateQueries({
            queryKey: collaborationKeys.suggestions(playlistId),
          });
          break;

        case "collaborator_presence":
          // Update collaborator online status
          queryClient.setQueryData<CollaborativePlaylistData>(
            collaborationKeys.playlist(playlistId),
            (old) => {
              if (!old) return old;
              return {
                ...old,
                collaborators: old.collaborators.map((c) =>
                  c.userId === event.data.userId
                    ? { ...c, isOnline: event.data.isOnline }
                    : c
                ),
              };
            }
          );
          break;

        case "collaborator_joined":
          queryClient.invalidateQueries({
            queryKey: collaborationKeys.playlist(playlistId),
          });
          toast.info(`${event.data.name} joined the playlist`);
          break;

        case "collaborator_left":
          queryClient.invalidateQueries({
            queryKey: collaborationKeys.playlist(playlistId),
          });
          break;

        case "playlist_updated":
          queryClient.invalidateQueries({
            queryKey: collaborationKeys.playlist(playlistId),
          });
          queryClient.invalidateQueries({
            queryKey: ["playlist", playlistId],
          });
          break;

        case "connected":
          setIsConnected(true);
          break;

        case "ping":
          // Keep-alive, no action needed
          break;
      }
    },
    [playlistId, queryClient]
  );

  // Setup SSE connection
  useEffect(() => {
    if (!playlistId || !collaborationData?.settings) return;

    const eventSource = new EventSource(`/api/playlists/${playlistId}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as CollaborativePlaylistEvent;
        handleSSEEvent(data);
      } catch (error) {
        console.error("Failed to parse SSE event:", error);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      // EventSource will auto-reconnect
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [playlistId, collaborationData?.settings, handleSSEEvent]);

  return {
    collaborationData,
    isLoading,
    error,
    isConnected,
  };
}

/**
 * Hook for fetching suggestions
 */
export function useSuggestions(
  playlistId: string,
  options: {
    status?: "pending" | "approved" | "rejected";
    sortBy?: "score" | "date";
    enabled?: boolean;
  } = {}
) {
  const { status = "pending", sortBy = "score", enabled = true } = options;

  return useQuery<{ suggestions: Suggestion[]; total: number }>({
    queryKey: collaborationKeys.suggestions(playlistId, status),
    queryFn: async () => {
      const params = new URLSearchParams({
        status,
        sortBy,
      });
      const response = await fetch(
        `/api/playlists/${playlistId}/suggestions/?${params}`
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch suggestions");
      }
      const json = await response.json();
      return json.data;
    },
    enabled: enabled && !!playlistId,
    staleTime: 10000, // 10 seconds
  });
}

/**
 * Hook for fetching activity log
 */
export function usePlaylistActivity(playlistId: string, enabled = true) {
  return useQuery<{ activity: ActivityItem[] }>({
    queryKey: collaborationKeys.activity(playlistId),
    queryFn: async () => {
      const response = await fetch(`/api/playlists/${playlistId}/activity`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch activity");
      }
      const json = await response.json();
      return json.data;
    },
    enabled: enabled && !!playlistId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook for enabling collaboration
 */
export function useEnableCollaboration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      playlistId,
      settings,
    }: {
      playlistId: string;
      settings: {
        privacy?: PlaylistPrivacy;
        allowSuggestions?: boolean;
        autoApproveThreshold?: number | null;
      };
    }) => {
      const response = await fetch(`/api/playlists/${playlistId}/collaboration/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to enable collaboration");
      }
      return response.json();
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.playlist(playlistId),
      });
      toast.success("Collaboration enabled");
    },
    onError: (error: Error) => {
      toast.error("Failed to enable collaboration", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook for inviting collaborators
 */
export function useInviteCollaborator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      playlistId,
      email,
      userId,
      role,
    }: {
      playlistId: string;
      email?: string;
      userId?: string;
      role: CollaboratorRole;
    }) => {
      const response = await fetch(`/api/playlists/${playlistId}/collaborators/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, userId, role }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to invite collaborator");
      }
      return response.json();
    },
    onSuccess: (data, { playlistId }) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.playlist(playlistId),
      });
      toast.success("Collaborator invited", {
        description: `${data.data.invitee.name} has been invited`,
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to invite collaborator", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook for removing collaborators
 */
export function useRemoveCollaborator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      playlistId,
      userId,
    }: {
      playlistId: string;
      userId: string;
    }) => {
      const response = await fetch(`/api/playlists/${playlistId}/collaborators/`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to remove collaborator");
      }
      return response.json();
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.playlist(playlistId),
      });
      toast.success("Collaborator removed");
    },
    onError: (error: Error) => {
      toast.error("Failed to remove collaborator", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook for suggesting a song
 */
export function useSuggestSong() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      playlistId,
      song,
    }: {
      playlistId: string;
      song: {
        songId: string;
        songTitle: string;
        songArtist: string;
        songAlbum?: string;
        songDuration?: number;
      };
    }) => {
      const response = await fetch(`/api/playlists/${playlistId}/suggestions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(song),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to suggest song");
      }
      return response.json();
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.suggestions(playlistId),
      });
      toast.success("Song suggested");
    },
    onError: (error: Error) => {
      toast.error("Failed to suggest song", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook for voting on a suggestion
 */
export function useVoteOnSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      playlistId,
      suggestionId,
      vote,
    }: {
      playlistId: string;
      suggestionId: string;
      vote: 1 | -1;
    }) => {
      const response = await fetch(
        `/api/playlists/${playlistId}/suggestions/${suggestionId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vote }),
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to vote");
      }
      return response.json();
    },
    onSuccess: (data, { playlistId }) => {
      // Optimistic update handled by SSE
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.suggestions(playlistId),
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to vote", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook for processing (approve/reject) a suggestion
 */
export function useProcessSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      playlistId,
      suggestionId,
      action,
      rejectionReason,
    }: {
      playlistId: string;
      suggestionId: string;
      action: "approve" | "reject";
      rejectionReason?: string;
    }) => {
      const response = await fetch(`/api/playlists/${playlistId}/suggestions/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId, action, rejectionReason }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to process suggestion");
      }
      return response.json();
    },
    onSuccess: (_, { playlistId, action }) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.suggestions(playlistId),
      });
      queryClient.invalidateQueries({
        queryKey: ["playlist", playlistId],
      });
      toast.success(action === "approve" ? "Song approved" : "Suggestion rejected");
    },
    onError: (error: Error) => {
      toast.error("Failed to process suggestion", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook for withdrawing a suggestion
 */
export function useWithdrawSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      playlistId,
      suggestionId,
    }: {
      playlistId: string;
      suggestionId: string;
    }) => {
      const response = await fetch(
        `/api/playlists/${playlistId}/suggestions/${suggestionId}`,
        {
          method: "DELETE",
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to withdraw suggestion");
      }
      return response.json();
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.suggestions(playlistId),
      });
      toast.success("Suggestion withdrawn");
    },
    onError: (error: Error) => {
      toast.error("Failed to withdraw suggestion", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook for joining a playlist via share code
 */
export function useJoinPlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shareCode: string) => {
      const response = await fetch("/api/playlists/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareCode }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to join playlist");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["playlists"],
      });
      toast.success("Joined playlist!", {
        description: `You've joined "${data.data.playlist.name}"`,
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to join playlist", {
        description: error.message,
      });
    },
  });
}
