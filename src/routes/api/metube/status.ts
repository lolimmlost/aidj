import { createFileRoute } from '@tanstack/react-router';
import { ServiceError } from '../../../lib/utils';
import { checkConnection, getHistory, getQueue } from '../../../lib/services/metube';

export const Route = createFileRoute('/api/metube/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Auth check (protected route)
        const { auth } = await import('../../../lib/auth/server');
        const session = await auth.api.getSession({
          headers: request.headers,
          query: {
            disableCookieCache: true,
          },
        });

        if (!session) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        try {
          const [connectionStatus, history, queue] = await Promise.all([
            checkConnection(),
            getHistory(),
            getQueue(),
          ]);

          return new Response(
            JSON.stringify({
              connected: connectionStatus.connected,
              version: connectionStatus.version,
              error: connectionStatus.error,
              history,
              queue: queue.queue,
              done: queue.done,
              stats: {
                totalInQueue: Object.keys(queue.queue).length,
                totalCompleted: Object.keys(queue.done).length,
                totalHistory: history.length,
              },
              lastUpdated: new Date().toISOString(),
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        } catch (error: unknown) {
          console.error('MeTube status fetch failed:', error);
          let code = 'METUBE_ERROR';
          let message = 'Failed to fetch MeTube status';
          if (error instanceof ServiceError) {
            code = error.code;
            message = error.message;
          } else if (error instanceof Error) {
            message = error.message;
          }
          return new Response(JSON.stringify({ code, message, connected: false }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
