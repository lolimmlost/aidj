import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from "../../../../../lib/utils/api-response";
import {
  enablePlaylistCollaboration,
  getCollaborativePlaylist,
} from "../../../../../lib/services/collaborative-playlists";

// Schema for enabling collaboration
const EnableCollaborationSchema = z.object({
  privacy: z.enum(["public", "private", "invite_only"]).optional(),
  allowSuggestions: z.boolean().optional(),
  autoApproveThreshold: z.number().int().min(1).max(100).nullable().optional(),
});

// GET /api/playlists/:id/collaboration - Get collaboration details
const GET = withAuthAndErrorHandling(
  async ({ request, params, session }) => {
    const { id } = params;

    const result = await getCollaborativePlaylist(id, session.user.id);

    return successResponse({
      playlist: result.playlist,
      settings: result.settings,
      collaborators: result.collaborators,
      userRole: result.userRole,
      canEdit: result.canEdit,
      canSuggest: result.canSuggest,
    });
  },
  {
    service: "collaboration",
    operation: "get",
    defaultCode: "COLLABORATION_ERROR",
    defaultMessage: "Failed to get collaboration details",
  }
);

// POST /api/playlists/:id/collaboration - Enable collaboration on playlist
const POST = withAuthAndErrorHandling(
  async ({ request, params, session }) => {
    const { id } = params;
    const body = await request.json();
    const validatedData = EnableCollaborationSchema.parse(body);

    const result = await enablePlaylistCollaboration(id, session.user.id, {
      privacy: validatedData.privacy,
      allowSuggestions: validatedData.allowSuggestions,
      autoApproveThreshold: validatedData.autoApproveThreshold,
    });

    return successResponse({
      settings: result.settings,
      shareCode: result.shareCode,
    }, 200);
  },
  {
    service: "collaboration",
    operation: "enable",
    defaultCode: "COLLABORATION_ERROR",
    defaultMessage: "Failed to enable collaboration",
  }
);

export const Route = createFileRoute("/api/playlists/$id/collaboration/")({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
});
