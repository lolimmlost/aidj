/**
 * POST /api/speakers/control — transport control for the active speaker.
 * Body: `{ playerId, action, value? }` where action is play | pause | next |
 * previous | stop | seek (value = seconds) | volume (value = 0-100).
 */

import { createFileRoute } from '@tanstack/react-router';
import { controlSpeaker, type SpeakerAction } from '@/lib/services/music-assistant';
import { isValidId, json, withSpeakerAccess } from '@/lib/services/music-assistant-http';

const ACTIONS: ReadonlySet<string> = new Set<SpeakerAction>([
  'play', 'pause', 'next', 'previous', 'stop', 'seek', 'volume',
]);

export const Route = createFileRoute('/api/speakers/control')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withSpeakerAccess(request, async () => {
          const body = await request.json().catch(() => null);
          if (!isValidId(body?.playerId) || !ACTIONS.has(body?.action)) {
            return json({ error: 'playerId and a valid action are required' }, 400);
          }
          const action = body.action as SpeakerAction;
          const needsValue = action === 'seek' || action === 'volume';
          if (needsValue && typeof body.value !== 'number') {
            return json({ error: `${action} requires a numeric value` }, 400);
          }
          await controlSpeaker(body.playerId, action, body.value);
          return json({ ok: true });
        }),
    },
  },
});
