/**
 * POST /api/dj/known-transitions/import — fold every saved Lab set into the user's known transitions
 * (see importLabSetsFor). Admin only, like the Lab and its saved sets. Saving a Lab set also schedules
 * this automatically (/api/dj/lab-sets).
 */
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '~/lib/auth/auth';
import { importLabSetsFor } from '~/lib/services/known-transitions-import';

export const Route = createFileRoute('/api/dj/known-transitions/import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return new Response('Unauthorized', { status: 401 });
        if (session.user.role !== 'admin') return new Response('Forbidden', { status: 403 });
        return Response.json({ data: await importLabSetsFor(session.user.id) });
      },
    },
  },
});
