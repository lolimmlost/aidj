import { createFileRoute } from "@tanstack/react-router";
import { search } from '../../lib/services/navidrome';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../lib/utils/api-response';

const POST = withAuthAndErrorHandling(
  async ({ request }) => {
    const { query, start = 0, limit = 50 } = await request.json() as {
      query: string;
      start?: number;
      limit?: number;
    };

    if (!query) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'Query required', { status: 400 });
    }

    const results = await search(query, start, limit);
    return successResponse(results);
  },
  {
    service: 'search',
    operation: 'search',
    defaultCode: 'SEARCH_ERROR',
    defaultMessage: 'Failed to search',
  }
);

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      POST,
    },
  },
});