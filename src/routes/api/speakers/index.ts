/**
 * GET /api/speakers — house speakers available through Music Assistant (#244).
 * Returns `{ configured: false }` when MA isn't set up, so the device picker can
 * hide the section instead of erroring.
 */

import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth/auth';
import { isMusicAssistantConfigured, listSpeakers } from '@/lib/services/music-assistant';
import { json, withSpeakerAccess } from '@/lib/services/music-assistant-http';

export const Route = createFileRoute('/api/speakers/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isMusicAssistantConfigured()) {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);
          return json({ configured: false, speakers: [] });
        }
        return withSpeakerAccess(request, async () =>
          json({ configured: true, speakers: await listSpeakers() }),
        );
      },
    },
  },
});
