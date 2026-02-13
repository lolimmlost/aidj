/**
 * Background Discovery Suggestion Actions API
 *
 * POST /api/background-discovery/suggestions/:id/approve - Approve suggestion (queue for download)
 * POST /api/background-discovery/suggestions/:id/reject - Reject suggestion (add to rejection history)
 * POST /api/background-discovery/suggestions/:id/dismiss - Dismiss without saving preference
 * DELETE /api/background-discovery/suggestions/:id - Delete a suggestion
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  discoverySuggestions,
  discoveryRejectionHistory,
  discoveryJobState,
} from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
  notFoundResponse,
} from '@/lib/utils/api-response';

// Action types
const ActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'dismiss', 'revert']),
});

// POST /api/background-discovery/suggestions/:id
const POST = withAuthAndErrorHandling(
  async ({ request, session, params }) => {
    const suggestionId = (params as { id: string }).id;
    const body = await request.json();
    const { action } = ActionSchema.parse(body);

    const userId = session.user.id;

    // Get the suggestion
    const suggestion = await db
      .select()
      .from(discoverySuggestions)
      .where(
        and(
          eq(discoverySuggestions.id, suggestionId),
          eq(discoverySuggestions.userId, userId)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!suggestion) {
      return notFoundResponse('Suggestion not found');
    }

    const now = new Date();

    switch (action) {
      case 'approve': {
        // Update suggestion status
        await db
          .update(discoverySuggestions)
          .set({
            status: 'approved',
            reviewedAt: now,
          })
          .where(eq(discoverySuggestions.id, suggestionId));

        // Increment approved count in job state
        await db
          .update(discoveryJobState)
          .set({
            totalApproved: sql`${discoveryJobState.totalApproved} + 1`,
            updatedAt: now,
          })
          .where(eq(discoveryJobState.userId, userId));

        // The discovery queue integration will be handled by the frontend
        // which calls the existing discovery queue store

        return successResponse({
          success: true,
          message: 'Suggestion approved',
          suggestion: {
            ...suggestion,
            status: 'approved',
            reviewedAt: now,
          },
        });
      }

      case 'reject': {
        // Update suggestion status
        await db
          .update(discoverySuggestions)
          .set({
            status: 'rejected',
            reviewedAt: now,
          })
          .where(eq(discoverySuggestions.id, suggestionId));

        // Add to rejection history (prevents re-suggesting for 30 days)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        await db
          .insert(discoveryRejectionHistory)
          .values({
            userId,
            artistName: suggestion.artistName.toLowerCase(),
            trackName: suggestion.trackName.toLowerCase(),
            rejectedAt: now,
            expiresAt,
          })
          .onConflictDoUpdate({
            target: [
              discoveryRejectionHistory.userId,
              discoveryRejectionHistory.artistName,
              discoveryRejectionHistory.trackName,
            ],
            set: {
              rejectedAt: now,
              expiresAt,
            },
          });

        // Increment rejected count in job state
        await db
          .update(discoveryJobState)
          .set({
            totalRejected: sql`${discoveryJobState.totalRejected} + 1`,
            updatedAt: now,
          })
          .where(eq(discoveryJobState.userId, userId));

        return successResponse({
          success: true,
          message: 'Suggestion rejected',
          suggestion: {
            ...suggestion,
            status: 'rejected',
            reviewedAt: now,
          },
        });
      }

      case 'dismiss': {
        // Just update status without adding to rejection history
        await db
          .update(discoverySuggestions)
          .set({
            status: 'dismissed',
            reviewedAt: now,
          })
          .where(eq(discoverySuggestions.id, suggestionId));

        return successResponse({
          success: true,
          message: 'Suggestion dismissed',
          suggestion: {
            ...suggestion,
            status: 'dismissed',
            reviewedAt: now,
          },
        });
      }

      case 'revert': {
        // Revert approved suggestion back to pending (e.g., after Lidarr failure)
        // Only allow reverting 'approved' status
        if (suggestion.status !== 'approved') {
          return errorResponse('INVALID_STATE', 'Can only revert approved suggestions');
        }

        await db
          .update(discoverySuggestions)
          .set({
            status: 'pending',
            reviewedAt: null,
          })
          .where(eq(discoverySuggestions.id, suggestionId));

        // Decrement approved count in job state
        await db
          .update(discoveryJobState)
          .set({
            totalApproved: sql`GREATEST(${discoveryJobState.totalApproved} - 1, 0)`,
            updatedAt: now,
          })
          .where(eq(discoveryJobState.userId, userId));

        return successResponse({
          success: true,
          message: 'Suggestion reverted to pending',
          suggestion: {
            ...suggestion,
            status: 'pending',
            reviewedAt: null,
          },
        });
      }

      default:
        return errorResponse('INVALID_ACTION', 'Invalid action');
    }
  },
  {
    service: 'background-discovery',
    operation: 'suggestion-action',
    defaultCode: 'SUGGESTION_ACTION_ERROR',
    defaultMessage: 'Failed to perform action on suggestion',
  }
);

// DELETE /api/background-discovery/suggestions/:id
const DELETE = withAuthAndErrorHandling(
  async ({ session, params }) => {
    const suggestionId = (params as { id: string }).id;
    const userId = session.user.id;

    await db
      .delete(discoverySuggestions)
      .where(
        and(
          eq(discoverySuggestions.id, suggestionId),
          eq(discoverySuggestions.userId, userId)
        )
      );

    return successResponse({
      success: true,
      message: 'Suggestion deleted',
    });
  },
  {
    service: 'background-discovery',
    operation: 'delete-suggestion',
    defaultCode: 'DELETE_ERROR',
    defaultMessage: 'Failed to delete suggestion',
  }
);

export const Route = createFileRoute("/api/background-discovery/suggestions/$id")({
  server: {
    handlers: {
      POST,
      DELETE,
    },
  },
});
