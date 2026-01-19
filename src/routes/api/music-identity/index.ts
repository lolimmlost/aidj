/**
 * Music Identity API - Main Index
 *
 * GET /api/music-identity - List all user's music identity summaries
 * POST /api/music-identity - Generate a new summary
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
  validationErrorResponse,
} from '../../../lib/utils/api-response';
import {
  generateMusicIdentitySummary,
  getUserMusicIdentitySummaries,
  getAvailablePeriods,
} from '../../../lib/services/music-identity';

// Validation schemas
const GenerateSummarySchema = z.object({
  periodType: z.enum(['month', 'year']),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).optional(),
  regenerate: z.boolean().optional(),
});

// GET /api/music-identity - List all summaries
const GET = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const url = new URL(request.url);
    const periodType = url.searchParams.get('periodType') as 'month' | 'year' | undefined;
    const includeAvailable = url.searchParams.get('includeAvailable') === 'true';

    // Get user's summaries
    const summaries = await getUserMusicIdentitySummaries(
      session.user.id,
      periodType || undefined
    );

    // Optionally include available periods
    let availablePeriods = null;
    if (includeAvailable) {
      availablePeriods = await getAvailablePeriods(session.user.id);
    }

    return successResponse({
      summaries,
      availablePeriods,
    });
  },
  {
    service: 'music-identity',
    operation: 'list',
    defaultCode: 'MUSIC_IDENTITY_LIST_ERROR',
    defaultMessage: 'Failed to list music identity summaries',
  }
);

// POST /api/music-identity - Generate a new summary
const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const body = await request.json();

    // Validate request body
    const parseResult = GenerateSummarySchema.safeParse(body);
    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const { periodType, year, month, regenerate } = parseResult.data;

    // Validate month is provided for monthly summaries
    if (periodType === 'month' && !month) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Month is required for monthly summaries',
        { status: 400 }
      );
    }

    try {
      const result = await generateMusicIdentitySummary({
        userId: session.user.id,
        periodType,
        year,
        month,
        regenerate,
      });

      return successResponse(result, result.isNew ? 201 : 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not enough listening data')) {
        return errorResponse(
          'INSUFFICIENT_DATA',
          error.message,
          { status: 400 }
        );
      }
      throw error;
    }
  },
  {
    service: 'music-identity',
    operation: 'generate',
    defaultCode: 'MUSIC_IDENTITY_GENERATE_ERROR',
    defaultMessage: 'Failed to generate music identity summary',
  }
);

export const Route = createFileRoute("/api/music-identity/")({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
});
