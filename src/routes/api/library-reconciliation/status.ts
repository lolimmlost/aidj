import { createFileRoute } from "@tanstack/react-router";
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';
import { getReconciliationManager, initializeReconciliation } from '@/lib/services/library-reconciliation';

const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;
    const manager = getReconciliationManager();

    if (!manager.getStatus().nextRunAt) {
      await initializeReconciliation(userId);
    }

    const status = manager.getStatus();

    return successResponse({
      isRunning: status.isRunning,
      lastRunAt: status.lastRunAt?.toISOString() ?? null,
      nextRunAt: status.nextRunAt?.toISOString() ?? null,
      frequencyHours: status.frequencyHours,
      lastError: status.lastError,
      lastResult: status.lastResult,
    });
  },
  {
    service: 'library-reconciliation',
    operation: 'status',
    defaultCode: 'STATUS_ERROR',
    defaultMessage: 'Failed to get reconciliation status',
  }
);

export const Route = createFileRoute("/api/library-reconciliation/status")({
  server: {
    handlers: {
      GET,
    },
  },
});
