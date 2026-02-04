/**
 * Tasks API
 * GET /api/tasks — returns all background task statuses
 * POST /api/tasks — trigger a specific task
 */

import { createFileRoute } from '@tanstack/react-router';
import { getAllTaskStatuses } from '../../../lib/services/task-aggregator';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../../lib/utils/api-response';

const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;
    const tasks = await getAllTaskStatuses(userId);
    return successResponse({ tasks });
  },
  {
    service: 'tasks',
    operation: 'list',
    defaultCode: 'TASKS_ERROR',
    defaultMessage: 'Failed to fetch task statuses',
  }
);

const POST = withAuthAndErrorHandling(
  async ({ request }) => {
    const body = await request.json();
    const { taskId, action } = body as { taskId: string; action: 'trigger' | 'cancel' };

    if (!taskId || !action) {
      return errorResponse('MISSING_REQUIRED_FIELD', 'taskId and action required', { status: 400 });
    }

    if (taskId === 'library-sync') {
      const { getBackgroundSyncManager } = await import('../../../lib/services/library-sync/background-sync');
      const manager = getBackgroundSyncManager();

      if (action === 'trigger') {
        await manager.triggerSync();
        return successResponse({ triggered: true, taskId });
      } else if (action === 'cancel') {
        manager.abort();
        return successResponse({ cancelled: true, taskId });
      }
    }

    if (taskId === 'discovery') {
      const { getBackgroundDiscoveryManager } = await import('../../../lib/services/background-discovery');
      const manager = getBackgroundDiscoveryManager();

      if (action === 'trigger') {
        await manager.triggerNow();
        return successResponse({ triggered: true, taskId });
      }
    }

    return errorResponse('UNKNOWN_TASK', `Unknown task: ${taskId}`, { status: 400 });
  },
  {
    service: 'tasks',
    operation: 'action',
    defaultCode: 'TASK_ACTION_ERROR',
    defaultMessage: 'Failed to perform task action',
  }
);

export const Route = createFileRoute('/api/tasks/')(
  {
    server: {
      handlers: {
        GET,
        POST,
      },
    },
  }
);
