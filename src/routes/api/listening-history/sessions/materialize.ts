import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';
import { materializeSessions } from '@/lib/services/session-materializer';

const POST = withAuthAndErrorHandling(
  async ({ request, session }) => {
    const userId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const { from, to } = body as { from?: string; to?: string };

    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    const result = await materializeSessions(userId, fromDate, toDate);

    return successResponse({
      message: `Materialized ${result.created} new sessions, updated ${result.updated}, backfilled ${result.backfilledPlays} plays`,
      ...result,
    });
  },
  {
    service: 'listening-history',
    operation: 'sessions-materialize',
    defaultCode: 'MATERIALIZE_ERROR',
    defaultMessage: 'Failed to materialize sessions',
  }
);

export const Route = createFileRoute('/api/listening-history/sessions/materialize')({
  server: {
    handlers: {
      POST,
    },
  },
});
