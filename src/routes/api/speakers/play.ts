/**
 * POST /api/speakers/play — hand playback to a speaker.
 * Body: `{ playerId, songIds, positionSec? }`. The first song plays at
 * `positionSec`; the rest become the speaker's look-ahead queue.
 */

import { createFileRoute } from '@tanstack/react-router';
import { playOnSpeaker } from '@/lib/services/music-assistant';
import { isValidId, json, parseSongIds, withSpeakerAccess } from '@/lib/services/music-assistant-http';

export const Route = createFileRoute('/api/speakers/play')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withSpeakerAccess(request, async () => {
          const body = await request.json().catch(() => null);
          const songIds = parseSongIds(body?.songIds);
          if (!isValidId(body?.playerId) || !songIds) {
            return json({ error: 'playerId and 1-50 songIds are required' }, 400);
          }
          const positionSec = typeof body.positionSec === 'number' && body.positionSec > 0 ? body.positionSec : 0;
          await playOnSpeaker(body.playerId, songIds, positionSec);
          return json({ ok: true });
        }),
    },
  },
});
