/**
 * POST /api/speakers/enqueue — change what plays after the current track.
 * Body: `{ playerId, songIds, mode? }` — mode `add` (default) appends to keep
 * the speaker a few tracks ahead; `replace_next` replaces the upcoming tracks
 * when AIDJ's queue changed.
 */

import { createFileRoute } from '@tanstack/react-router';
import { enqueueOnSpeaker } from '@/lib/services/music-assistant';
import { isValidId, json, parseSongIds, withSpeakerAccess } from '@/lib/services/music-assistant-http';

export const Route = createFileRoute('/api/speakers/enqueue')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withSpeakerAccess(request, async () => {
          const body = await request.json().catch(() => null);
          const songIds = parseSongIds(body?.songIds);
          if (!isValidId(body?.playerId) || !songIds) {
            return json({ error: 'playerId and 1-50 songIds are required' }, 400);
          }
          const mode = body.mode === 'replace_next' ? 'replace_next' : 'add';
          await enqueueOnSpeaker(body.playerId, songIds, mode);
          return json({ ok: true });
        }),
    },
  },
});
