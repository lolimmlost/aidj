/**
 * Music Identity API - Collection Endpoint
 *
 * GET /api/music-identity - List all summaries for the current user
 * POST /api/music-identity - Generate a new summary
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from 'zod';
import {
  withAuthAndErrorHandling,
  successResponse,
  validationErrorResponse,
} from '../../../lib/utils/api-response';
import {
  getUserMusicIdentitySummaries,
  generateMusicIdentitySummary,
  getAvailablePeriods,
} from '../../../lib/services/music-identity';

// Validation schema for POST
const GenerateSummarySchema = z.object({
  periodType: z.enum(['month', 'year']),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).optional(),
  regenerate: z.boolean().optional(),
});

// GET /api/music-identity - List all summaries and available periods
const GET = withAuthAndErrorHandling(
  async ({ session, request }) => {
    const url = new URL(request.url);
    const periodType = url.searchParams.get('periodType') as 'month' | 'year' | null;

    const [summaries, availablePeriods] = await Promise.all([
      getUserMusicIdentitySummaries(session.user.id, periodType || undefined),
      getAvailablePeriods(session.user.id),
    ]);

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

    const parseResult = GenerateSummarySchema.safeParse(body);
    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const { periodType, year, month, regenerate } = parseResult.data;

    const result = await generateMusicIdentitySummary({
      userId: session.user.id,
      periodType,
      year,
      month,
      regenerate,
    });

    return successResponse(result);
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
