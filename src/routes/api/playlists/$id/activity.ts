import { createFileRoute } from "@tanstack/react-router";
import {
  withAuthAndErrorHandling,
  successResponse,
} from "../../../../lib/utils/api-response";
import { getPlaylistActivity } from "../../../../lib/services/collaborative-playlists";

// GET /api/playlists/:id/activity - Get playlist activity log
const GET = withAuthAndErrorHandling(
  async ({ request, params, session }) => {
    const { id } = params;
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");

    const activity = await getPlaylistActivity(id, session.user.id, limit);

    return successResponse({
      activity,
    });
  },
  {
    service: "activity",
    operation: "list",
    defaultCode: "ACTIVITY_ERROR",
    defaultMessage: "Failed to get activity log",
  }
);

export const Route = createFileRoute("/api/playlists/$id/activity")({
  server: {
    handlers: {
      GET,
    },
  },
});
