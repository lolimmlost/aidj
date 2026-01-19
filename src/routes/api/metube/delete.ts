import { createFileRoute } from '@tanstack/react-router';
import { ServiceError } from '../../../lib/utils';
import { deleteDownloads } from '../../../lib/services/metube';

export const Route = createFileRoute('/api/metube/delete')({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
          const body = (await request.json()) as {
            ids: string[];
            where?: 'queue' | 'done';
          };

          if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
            return new Response(JSON.stringify({ error: 'At least one ID is required' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const result = await deleteDownloads(body.ids, body.where || 'done');

          return new Response(
            JSON.stringify({
              success: true,
              message: `Deleted ${body.ids.length} item(s)`,
              ...result,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        } catch (error: unknown) {
          console.error('MeTube delete failed:', error);
          let code = 'METUBE_ERROR';
          let message = 'Failed to delete downloads';
          if (error instanceof ServiceError) {
            code = error.code;
            message = error.message;
          } else if (error instanceof Error) {
            message = error.message;
          }
          return new Response(JSON.stringify({ code, message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
