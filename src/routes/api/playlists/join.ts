import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  withAuthAndErrorHandling,
  successResponse,
} from "../../../lib/utils/api-response";
import { joinPlaylistByShareCode } from "../../../lib/services/collaborative-playlists";

// Schema for joining
const JoinPlaylistSchema = z.object({
  shareCode: z.string().length(8),
});

// POST /api/playlists/join - Join a playlist using share code
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();
    const validatedData = JoinPlaylistSchema.parse(body);

    const result = await joinPlaylistByShareCode(
      validatedData.shareCode,
      session.user.id
    );

    return successResponse({
      playlist: result.playlist,
      collaborator: result.collaborator,
    });
  },
  {
    service: "playlists",
    operation: "join",
    defaultCode: "JOIN_ERROR",
    defaultMessage: "Failed to join playlist",
  }
);

export const Route = createFileRoute("/api/playlists/join")({
  server: {
    handlers: {
      POST,
    },
  },
});
