import { createFileRoute } from "@tanstack/react-router";
import { getCacheService, type CacheNamespace } from '../../lib/services/cache';
import {
  withAuthAndErrorHandling,
  successResponse,
  errorResponse,
} from '../../lib/utils/api-response';

// GET /api/cache - Get cache statistics
const GET = withAuthAndErrorHandling(
  async ({ request }) => {
    const url = new URL(request.url);
    const namespace = url.searchParams.get('namespace') as CacheNamespace | null;

    const cache = getCacheService();

    if (namespace) {
      // Get stats for a specific namespace
      const stats = cache.getNamespaceStats(namespace);
      if (!stats) {
        return errorResponse(404, `Namespace '${namespace}' not found or not initialized`);
      }

      return successResponse({
        namespace,
        stats,
        config: cache.getConfiguration(namespace),
      });
    }

    // Get aggregate stats for all caches
    const summary = cache.getSummaryStats();
    const allStats = cache.getAllStats();
    const activeNamespaces = cache.getActiveNamespaces();

    return successResponse({
      summary,
      namespaces: allStats,
      activeNamespaces,
    });
  },
  {
    service: 'cache',
    operation: 'stats',
    defaultCode: 'CACHE_STATS_ERROR',
    defaultMessage: 'Failed to get cache statistics',
  }
);

// POST /api/cache - Cache management operations
const POST = withAuthAndErrorHandling(
  async ({ request }) => {
    const body = await request.json();
    const { action, namespace, config } = body as {
      action: 'clear' | 'cleanup' | 'configure';
      namespace?: CacheNamespace;
      config?: Partial<{
        defaultTtlMs: number;
        maxEntries: number;
        enableAutoCleanup: boolean;
        cleanupIntervalMs: number;
      }>;
    };

    const cache = getCacheService();

    switch (action) {
      case 'clear': {
        if (namespace) {
          cache.clearNamespace(namespace);
          return successResponse({
            action: 'clear',
            namespace,
            message: `Cache namespace '${namespace}' cleared`,
          });
        } else {
          cache.clearAll();
          return successResponse({
            action: 'clear',
            message: 'All caches cleared',
          });
        }
      }

      case 'cleanup': {
        const results = cache.cleanup();
        return successResponse({
          action: 'cleanup',
          expiredEntriesRemoved: results,
        });
      }

      case 'configure': {
        if (!namespace) {
          return errorResponse(400, 'Namespace is required for configure action');
        }
        if (!config) {
          return errorResponse(400, 'Config is required for configure action');
        }

        cache.configure(namespace, config);
        return successResponse({
          action: 'configure',
          namespace,
          config: cache.getConfiguration(namespace),
        });
      }

      default:
        return errorResponse(400, `Unknown action: ${action}`);
    }
  },
  {
    service: 'cache',
    operation: 'manage',
    defaultCode: 'CACHE_OPERATION_ERROR',
    defaultMessage: 'Cache operation failed',
  }
);

export const Route = createFileRoute("/api/cache")({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
});
