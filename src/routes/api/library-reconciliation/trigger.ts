import { createFileRoute } from "@tanstack/react-router";
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';
import { getReconciliationManager, initializeReconciliation } from '@/lib/services/library-reconciliation';

const POST = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;
    const manager = getReconciliationManager();

    if (!manager.getStatus().nextRunAt) {
      await initializeReconciliation(userId);
    }

    if (manager.getStatus().isRunning) {
      return successResponse({ message: 'Reconciliation already running', started: false });
    }

    manager.triggerNow().catch(() => {});

    return successResponse({ message: 'Reconciliation started', started: true });
  },
  {
    service: 'library-reconciliation',
    operation: 'trigger',
    defaultCode: 'TRIGGER_ERROR',
    defaultMessage: 'Failed to trigger library reconciliation',
  }
);

export const Route = createFileRoute("/api/library-reconciliation/trigger")({
  server: {
    handlers: {
      POST,
    },
  },
});
