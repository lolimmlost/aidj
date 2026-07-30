import { createFileRoute } from '@tanstack/react-router';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';
import { getSessionInsights } from '@/lib/services/session-materializer';

const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    const insights = await getSessionInsights(session.user.id);
    return successResponse(insights);
  },
  {
    service: 'listening-history',
    operation: 'sessions-insights',
    defaultCode: 'INSIGHTS_ERROR',
    defaultMessage: 'Failed to fetch session insights',
  }
);

export const Route = createFileRoute('/api/listening-history/sessions/insights')({
  server: {
    handlers: {
      GET,
    },
  },
});
