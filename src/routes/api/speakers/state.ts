/**
 * GET /api/speakers/state?playerId=… — what the speaker is playing now:
 * state, current Navidrome song id, position, and the queued song ids.
 * Polled by the phone while a speaker is the active output.
 */

import { createFileRoute } from '@tanstack/react-router';
import { getSpeakerState } from '@/lib/services/music-assistant';
import { isValidId, json, withSpeakerAccess } from '@/lib/services/music-assistant-http';

export const Route = createFileRoute('/api/speakers/state')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withSpeakerAccess(request, async () => {
          const playerId = new URL(request.url).searchParams.get('playerId');
          if (!isValidId(playerId)) return json({ error: 'playerId is required' }, 400);
          return json(await getSpeakerState(playerId));
        }),
    },
  },
});
