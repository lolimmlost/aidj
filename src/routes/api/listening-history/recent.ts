/**
 * Recently Played API Endpoint
 *
 * GET /api/listening-history/recent - Get recently played songs with full metadata
 *
 * Query params:
 * - limit: number (default: 20, max: 50)
 *
 * Returns deduplicated recent plays (most recent play per song) for cross-device display.
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { listeningHistory } from '../../../lib/db/schema/listening-history.schema';
import { eq, desc } from 'drizzle-orm';

export const Route = createFileRoute("/api/listening-history/recent")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({
            headers: request.headers,
            query: { disableCookieCache: true },
          });

          if (!session?.user?.id) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const url = new URL(request.url);
          const limit = Math.min(
            Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20),
            50
          );

          // Fetch recent plays ordered by most recent
          // We fetch more than needed to allow deduplication
          const results = await db
            .select({
              id: listeningHistory.id,
              songId: listeningHistory.songId,
              artist: listeningHistory.artist,
              title: listeningHistory.title,
              album: listeningHistory.album,
              genre: listeningHistory.genre,
              playedAt: listeningHistory.playedAt,
              completed: listeningHistory.completed,
            })
            .from(listeningHistory)
            .where(eq(listeningHistory.userId, session.user.id))
            .orderBy(desc(listeningHistory.playedAt))
            .limit(limit * 3); // Over-fetch for dedup

          // Deduplicate: keep only the most recent play per songId
          const seen = new Set<string>();
          const deduplicated = [];
          for (const row of results) {
            if (!seen.has(row.songId)) {
              seen.add(row.songId);
              deduplicated.push({
                id: row.id,
                songId: row.songId,
                artist: row.artist,
                title: row.title,
                album: row.album,
                genre: row.genre,
                playedAt: row.playedAt.toISOString(),
                completed: row.completed === 1,
              });
              if (deduplicated.length >= limit) break;
            }
          }

          return new Response(
            JSON.stringify({ history: deduplicated }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('Error fetching recent listening history:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});
