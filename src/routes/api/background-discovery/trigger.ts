/**
 * Background Discovery Trigger API
 *
 * POST /api/background-discovery/trigger - Manually trigger discovery run
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '@/lib/utils/api-response';
import { getBackgroundDiscoveryManager } from '@/lib/services/background-discovery';

// POST /api/background-discovery/trigger
const POST = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;

    const manager = getBackgroundDiscoveryManager();

    // Ensure manager is initialized for this user
    await manager.initialize(userId);

    // Trigger discovery
    const result = await manager.triggerNow();

    if (result.success) {
      return successResponse({
        success: true,
        message: `Discovery completed, generated ${result.suggestionsCount} suggestions`,
        suggestionsCount: result.suggestionsCount,
      });
    } else {
      return errorResponse(
        'DISCOVERY_FAILED',
        result.error || 'Discovery failed',
        { status: 500 }
      );
    }
  },
  {
    service: 'background-discovery',
    operation: 'trigger',
    defaultCode: 'TRIGGER_ERROR',
    defaultMessage: 'Failed to trigger discovery',
  }
);

export const Route = createFileRoute("/api/background-discovery/trigger")({
  server: {
    handlers: {
      POST,
    },
  },
});
