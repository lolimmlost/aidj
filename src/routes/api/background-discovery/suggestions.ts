/**
 * Background Discovery Suggestions API
 *
 * GET /api/background-discovery/suggestions - List pending suggestions
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import { db } from '@/lib/db';
import { discoverySuggestions } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';

// DELETE /api/background-discovery/suggestions - Dismiss all pending suggestions
const DELETE = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;

    const result = await db
      .update(discoverySuggestions)
      .set({
        status: 'dismissed',
        reviewedAt: new Date(),
      })
      .where(
        and(
          eq(discoverySuggestions.userId, userId),
          eq(discoverySuggestions.status, 'pending')
        )
      )
      .returning({ id: discoverySuggestions.id });

    return successResponse({
      success: true,
      message: `Dismissed ${result.length} suggestions`,
      dismissedCount: result.length,
    });
  },
  {
    service: 'background-discovery',
    operation: 'dismiss-all-suggestions',
    defaultCode: 'DISMISS_ALL_ERROR',
    defaultMessage: 'Failed to dismiss all suggestions',
  }
);

// Request validation schema
const SuggestionsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  status: z.enum(['pending', 'approved', 'rejected', 'dismissed', 'all']).optional().default('pending'),
});

// GET /api/background-discovery/suggestions
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const params = {
      limit: url.searchParams.get('limit'),
      offset: url.searchParams.get('offset'),
      status: url.searchParams.get('status'),
    };

    const validated = SuggestionsQuerySchema.parse({
      limit: params.limit || undefined,
      offset: params.offset || undefined,
      status: params.status || undefined,
    });

    const userId = session.user.id;

    // Build query conditions
    const conditions = [eq(discoverySuggestions.userId, userId)];
    if (validated.status !== 'all') {
      conditions.push(eq(discoverySuggestions.status, validated.status));
    }

    // Fetch suggestions
    const suggestions = await db
      .select()
      .from(discoverySuggestions)
      .where(and(...conditions))
      .orderBy(desc(discoverySuggestions.matchScore), desc(discoverySuggestions.suggestedAt))
      .limit(validated.limit)
      .offset(validated.offset);

    // Get total count for pagination
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(discoverySuggestions)
      .where(and(...conditions));

    const total = countResult[0]?.count ?? 0;

    // Get stats
    const statsResult = await db
      .select({
        status: discoverySuggestions.status,
        count: sql<number>`count(*)::int`,
      })
      .from(discoverySuggestions)
      .where(eq(discoverySuggestions.userId, userId))
      .groupBy(discoverySuggestions.status);

    const stats = {
      pending: 0,
      approved: 0,
      rejected: 0,
      dismissed: 0,
    };
    for (const row of statsResult) {
      if (row.status in stats) {
        stats[row.status as keyof typeof stats] = row.count;
      }
    }

    return successResponse({
      suggestions,
      pagination: {
        total,
        limit: validated.limit,
        offset: validated.offset,
        hasMore: validated.offset + validated.limit < total,
      },
      stats,
    });
  },
  {
    service: 'background-discovery',
    operation: 'list-suggestions',
    defaultCode: 'SUGGESTIONS_ERROR',
    defaultMessage: 'Failed to fetch suggestions',
  }
);

export const Route = createFileRoute("/api/background-discovery/suggestions")({
  server: {
    handlers: {
      GET,
      DELETE,
    },
  },
});
