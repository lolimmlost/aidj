import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  withAuthAndErrorHandling,
  successResponse,
} from "../../../../../lib/utils/api-response";
import {
  voteOnSuggestion,
  withdrawSuggestion,
} from "../../../../../lib/services/collaborative-playlists";

// Schema for voting
const VoteSchema = z.object({
  vote: z.union([z.literal(1), z.literal(-1)]),
});

// POST /api/playlists/:id/suggestions/:suggestionId - Vote on a suggestion
const POST = withAuthAndErrorHandling(
  async ({ request, params, session }) => {
    const { suggestionId } = params;
    const body = await request.json();
    const validatedData = VoteSchema.parse(body);

    const result = await voteOnSuggestion({
      suggestionId,
      userId: session.user.id,
      vote: validatedData.vote,
    });

    return successResponse({
      suggestion: result.suggestion,
      previousVote: result.previousVote,
    });
  },
  {
    service: "suggestions",
    operation: "vote",
    defaultCode: "VOTE_ERROR",
    defaultMessage: "Failed to vote on suggestion",
  }
);

// DELETE /api/playlists/:id/suggestions/:suggestionId - Withdraw a suggestion
const DELETE = withAuthAndErrorHandling(
  async ({ params, session }) => {
    const { suggestionId } = params;

    await withdrawSuggestion(suggestionId, session.user.id);

    return successResponse({ success: true });
  },
  {
    service: "suggestions",
    operation: "withdraw",
    defaultCode: "WITHDRAW_ERROR",
    defaultMessage: "Failed to withdraw suggestion",
  }
);

export const Route = createFileRoute("/api/playlists/$id/suggestions/$suggestionId")({
  server: {
    handlers: {
      POST,
      DELETE,
    },
  },
});
