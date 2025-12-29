import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  withAuthAndErrorHandling,
  successResponse,
} from "../../../../../lib/utils/api-response";
import {
  inviteCollaborator,
  removeCollaborator,
  transferOwnership,
} from "../../../../../lib/services/collaborative-playlists";

// Schema for inviting collaborator
const InviteCollaboratorSchema = z.object({
  email: z.string().email().optional(),
  userId: z.string().optional(),
  role: z.enum(["editor", "viewer"]),
}).refine(
  (data) => data.email || data.userId,
  { message: "Either email or userId must be provided" }
);

// Schema for removing collaborator
const RemoveCollaboratorSchema = z.object({
  userId: z.string(),
});

// Schema for transferring ownership
const TransferOwnershipSchema = z.object({
  newOwnerId: z.string(),
});

// POST /api/playlists/:id/collaborators - Invite a collaborator
const POST = withAuthAndErrorHandling(
  async ({ request, params, session }) => {
    const { id } = params;
    const body = await request.json();
    const validatedData = InviteCollaboratorSchema.parse(body);

    const result = await inviteCollaborator({
      playlistId: id,
      inviterId: session.user.id,
      inviteeEmail: validatedData.email,
      inviteeId: validatedData.userId,
      role: validatedData.role,
    });

    return successResponse({
      collaborator: result.collaborator,
      invitee: result.inviteeInfo,
    }, 201);
  },
  {
    service: "collaborators",
    operation: "invite",
    defaultCode: "INVITE_ERROR",
    defaultMessage: "Failed to invite collaborator",
  }
);

// DELETE /api/playlists/:id/collaborators - Remove a collaborator
const DELETE = withAuthAndErrorHandling(
  async ({ request, params, session }) => {
    const { id } = params;
    const body = await request.json();
    const validatedData = RemoveCollaboratorSchema.parse(body);

    await removeCollaborator(id, session.user.id, validatedData.userId);

    return successResponse({ success: true });
  },
  {
    service: "collaborators",
    operation: "remove",
    defaultCode: "REMOVE_ERROR",
    defaultMessage: "Failed to remove collaborator",
  }
);

// PATCH /api/playlists/:id/collaborators - Transfer ownership
const PATCH = withAuthAndErrorHandling(
  async ({ request, params, session }) => {
    const { id } = params;
    const body = await request.json();
    const validatedData = TransferOwnershipSchema.parse(body);

    await transferOwnership(id, session.user.id, validatedData.newOwnerId);

    return successResponse({ success: true });
  },
  {
    service: "collaborators",
    operation: "transfer",
    defaultCode: "TRANSFER_ERROR",
    defaultMessage: "Failed to transfer ownership",
  }
);

export const Route = createFileRoute("/api/playlists/$id/collaborators/")({
  server: {
    handlers: {
      POST,
      DELETE,
      PATCH,
    },
  },
});
