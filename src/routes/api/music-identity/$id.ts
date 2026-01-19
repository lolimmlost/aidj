/**
 * Music Identity API - Individual Summary
 *
 * GET /api/music-identity/:id - Get a specific summary
 * PATCH /api/music-identity/:id - Update summary settings (sharing, card customization)
 * DELETE /api/music-identity/:id - Delete a summary
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import {
  withAuthAndErrorHandling,
  successResponse,
  validationErrorResponse,
  notFoundResponse,
} from '../../../lib/utils/api-response';
import {
  getMusicIdentitySummary,
  updateSharingSettings,
  updateCardCustomization,
  deleteMusicIdentitySummary,
} from '../../../lib/services/music-identity';

// Validation schemas
const UpdateSummarySchema = z.object({
  // Sharing settings
  isPublic: z.boolean().optional(),

  // Card customization
  cardTheme: z.string().optional(),
  cardData: z.object({
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
    layout: z.enum(['classic', 'minimal', 'vibrant', 'dark']).optional(),
    showStats: z.boolean().optional(),
    showTopArtists: z.boolean().optional(),
    showMoodProfile: z.boolean().optional(),
    showTrends: z.boolean().optional(),
    customMessage: z.string().max(200).optional(),
  }).optional(),
});

// GET /api/music-identity/:id - Get a specific summary
const GET = withAuthAndErrorHandling(
  async ({ session, params }) => {
    const { id } = params;

    const summary = await getMusicIdentitySummary(id, session.user.id);

    if (!summary) {
      return notFoundResponse('Music identity summary not found');
    }

    return successResponse(summary);
  },
  {
    service: 'music-identity',
    operation: 'get',
    defaultCode: 'MUSIC_IDENTITY_GET_ERROR',
    defaultMessage: 'Failed to get music identity summary',
  }
);

// PATCH /api/music-identity/:id - Update summary settings
const PATCH = withAuthAndErrorHandling(
  async ({ request, session, params }) => {
    const { id } = params;
    const body = await request.json();

    // Validate request body
    const parseResult = UpdateSummarySchema.safeParse(body);
    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const { isPublic, cardTheme, cardData } = parseResult.data;

    // Check if summary exists
    const existing = await getMusicIdentitySummary(id, session.user.id);
    if (!existing) {
      return notFoundResponse('Music identity summary not found');
    }

    let updatedSummary = existing;

    // Update sharing settings if provided
    if (isPublic !== undefined) {
      const result = await updateSharingSettings(id, session.user.id, isPublic);
      if (result) updatedSummary = result;
    }

    // Update card customization if provided
    if (cardData || cardTheme) {
      const result = await updateCardCustomization(
        id,
        session.user.id,
        cardData || {},
        cardTheme
      );
      if (result) updatedSummary = result;
    }

    return successResponse(updatedSummary);
  },
  {
    service: 'music-identity',
    operation: 'update',
    defaultCode: 'MUSIC_IDENTITY_UPDATE_ERROR',
    defaultMessage: 'Failed to update music identity summary',
  }
);

// DELETE /api/music-identity/:id - Delete a summary
const DELETE = withAuthAndErrorHandling(
  async ({ session, params }) => {
    const { id } = params;

    const deleted = await deleteMusicIdentitySummary(id, session.user.id);

    if (!deleted) {
      return notFoundResponse('Music identity summary not found');
    }

    return successResponse({ deleted: true });
  },
  {
    service: 'music-identity',
    operation: 'delete',
    defaultCode: 'MUSIC_IDENTITY_DELETE_ERROR',
    defaultMessage: 'Failed to delete music identity summary',
  }
);

export const Route = createFileRoute("/api/music-identity/$id")({
  server: {
    handlers: {
      GET,
      PATCH,
      DELETE,
    },
  },
});
