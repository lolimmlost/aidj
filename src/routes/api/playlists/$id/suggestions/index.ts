import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  withAuthAndErrorHandling,
  successResponse,
} from "../../../../../lib/utils/api-response";
import {
  suggestSong,
  getPlaylistSuggestions,
  processSuggestion,
} from "../../../../../lib/services/collaborative-playlists";

// Schema for adding a suggestion
const SuggestSongSchema = z.object({
  songId: z.string(),
  songTitle: z.string(),
  songArtist: z.string(),
  songAlbum: z.string().optional(),
  songDuration: z.number().int().optional(),
});

// Schema for processing a suggestion
const ProcessSuggestionSchema = z.object({
  suggestionId: z.string(),
  action: z.enum(["approve", "reject"]),
  rejectionReason: z.string().optional(),
});

// GET /api/playlists/:id/suggestions - Get suggestions for a playlist
const GET = withAuthAndErrorHandling(
  async ({ request, params, session }) => {
    const { id } = params;
    const url = new URL(request.url);

    const status = url.searchParams.get("status") as "pending" | "approved" | "rejected" | null;
    const sortBy = url.searchParams.get("sortBy") as "score" | "date" | null;
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const result = await getPlaylistSuggestions(id, session.user.id, {
      status: status || "pending",
      sortBy: sortBy || "score",
      limit,
      offset,
    });

    return successResponse({
      suggestions: result.suggestions,
      total: result.total,
    });
  },
  {
    service: "suggestions",
    operation: "list",
    defaultCode: "SUGGESTION_ERROR",
    defaultMessage: "Failed to get suggestions",
  }
);

// POST /api/playlists/:id/suggestions - Add a song suggestion
const POST = withAuthAndErrorHandling(
  async ({ request, params, session }) => {
    const { id } = params;
    const body = await request.json();
    const validatedData = SuggestSongSchema.parse(body);

    const result = await suggestSong({
      playlistId: id,
      userId: session.user.id,
      ...validatedData,
    });

    return successResponse({
      suggestion: result.suggestion,
    }, 201);
  },
  {
    service: "suggestions",
    operation: "create",
    defaultCode: "SUGGESTION_ERROR",
    defaultMessage: "Failed to add suggestion",
  }
);

// PATCH /api/playlists/:id/suggestions - Process a suggestion (approve/reject)
const PATCH = withAuthAndErrorHandling(
  async ({ request, params, session }) => {
    const body = await request.json();
    const validatedData = ProcessSuggestionSchema.parse(body);

    const result = await processSuggestion({
      suggestionId: validatedData.suggestionId,
      processedBy: session.user.id,
      action: validatedData.action,
      rejectionReason: validatedData.rejectionReason,
    });

    return successResponse({
      suggestion: result.suggestion,
      addedSong: result.addedSong,
    });
  },
  {
    service: "suggestions",
    operation: "process",
    defaultCode: "SUGGESTION_ERROR",
    defaultMessage: "Failed to process suggestion",
  }
);

export const Route = createFileRoute("/api/playlists/$id/suggestions/")({
  server: {
    handlers: {
      GET,
      POST,
      PATCH,
    },
  },
});
