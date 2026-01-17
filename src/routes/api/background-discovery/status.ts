/**
 * Background Discovery Status API
 *
 * GET /api/background-discovery/status - Get job status, next run time, stats
 */

import { createFileRoute } from "@tanstack/react-router";
import { db } from '@/lib/db';
import { discoveryJobState, discoverySuggestions } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import {
  withAuthAndErrorHandling,
  successResponse,
} from '@/lib/utils/api-response';
import { getBackgroundDiscoveryManager } from '@/lib/services/background-discovery';

// GET /api/background-discovery/status
const GET = withAuthAndErrorHandling(
  async ({ session }) => {
    const userId = session.user.id;

    // Get job state from database
    const jobState = await db
      .select()
      .from(discoveryJobState)
      .where(eq(discoveryJobState.userId, userId))
      .limit(1)
      .then(rows => rows[0]);

    // Get pending suggestions count
    const pendingResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(discoverySuggestions)
      .where(eq(discoverySuggestions.userId, userId));

    const pendingCount = pendingResult[0]?.count ?? 0;

    // Get stats by status
    const statsResult = await db
      .select({
        status: discoverySuggestions.status,
        count: sql<number>`count(*)::int`,
      })
      .from(discoverySuggestions)
      .where(eq(discoverySuggestions.userId, userId))
      .groupBy(discoverySuggestions.status);

    const stats = {
      pending: 0,
      approved: 0,
      rejected: 0,
      dismissed: 0,
    };
    for (const row of statsResult) {
      if (row.status in stats) {
        stats[row.status as keyof typeof stats] = row.count;
      }
    }

    // Calculate approval rate
    const totalReviewed = stats.approved + stats.rejected;
    const approvalRate = totalReviewed > 0
      ? Math.round((stats.approved / totalReviewed) * 100)
      : 0;

    // Try to get manager status for real-time info
    let managerStatus = null;
    try {
      const manager = getBackgroundDiscoveryManager();
      managerStatus = await manager.getStatus();
    } catch {
      // Manager may not be initialized on server
    }

    return successResponse({
      enabled: jobState?.enabled ?? true,
      frequencyHours: jobState?.frequencyHours ?? 12,
      lastRunAt: managerStatus?.lastRunAt || jobState?.lastRunAt || null,
      nextRunAt: managerStatus?.nextRunAt || jobState?.nextRunAt || null,
      isRunning: managerStatus?.isRunning || jobState?.isRunning || false,
      consecutiveFailures: jobState?.consecutiveFailures ?? 0,
      lastError: jobState?.lastError || null,
      totalSuggestionsGenerated: jobState?.totalSuggestionsGenerated ?? 0,
      totalApproved: jobState?.totalApproved ?? 0,
      totalRejected: jobState?.totalRejected ?? 0,
      pendingCount,
      stats,
      approvalRate,
    });
  },
  {
    service: 'background-discovery',
    operation: 'status',
    defaultCode: 'STATUS_ERROR',
    defaultMessage: 'Failed to get discovery status',
  }
);

export const Route = createFileRoute("/api/background-discovery/status")({
  server: {
    handlers: {
      GET,
    },
  },
});
