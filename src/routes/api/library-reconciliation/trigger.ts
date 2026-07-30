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

    const result = await manager.triggerNow();

    return successResponse({
      message: `Reconciliation complete: ${result.checkedIds} checked, ${result.remapped} remapped, ${result.notFound} not found`,
      ...result,
    });
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
