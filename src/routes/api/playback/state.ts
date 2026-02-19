/**
 * Playback State API
 *
 * GET  /api/playback/state - Get current playback session
 * POST /api/playback/state - Update playback session with per-field conflict resolution
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { playbackSessions } from '../../../lib/db/schema/playback-session.schema';
import { eq } from 'drizzle-orm';
import type { SyncSong, PlaybackStateResponse } from '../../../lib/types/sync';

const MAX_QUEUE_SIZE = 500;

function sessionToResponse(session: typeof playbackSessions.$inferSelect): PlaybackStateResponse {
  return {
    queue: (session.queue ?? []) as SyncSong[],
    originalQueue: (session.originalQueue ?? []) as SyncSong[],
    currentIndex: session.currentIndex,
    currentPositionMs: session.currentPositionMs ?? 0,
    isPlaying: session.isPlaying ?? false,
    volume: session.volume ?? 0.5,
    isShuffled: session.isShuffled ?? false,
    activeDevice: {
      id: session.activeDeviceId,
      name: session.activeDeviceName,
      type: session.activeDeviceType,
    },
    queueUpdatedAt: session.queueUpdatedAt.toISOString(),
    positionUpdatedAt: session.positionUpdatedAt.toISOString(),
    playStateUpdatedAt: session.playStateUpdatedAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export const Route = createFileRoute("/api/playback/state")({
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

          // Find or create session
          const existing = await db
            .select()
            .from(playbackSessions)
            .where(eq(playbackSessions.userId, session.user.id))
            .limit(1);

          if (existing.length > 0) {
            return new Response(JSON.stringify(sessionToResponse(existing[0])), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Create empty session
          const [created] = await db
            .insert(playbackSessions)
            .values({ userId: session.user.id })
            .returning();

          return new Response(JSON.stringify(sessionToResponse(created)), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Error getting playback state:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },

      POST: async ({ request }) => {
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

          const body = await request.json();
          const now = new Date();

          // Get existing session for per-field merge
          const [existing] = await db
            .select()
            .from(playbackSessions)
            .where(eq(playbackSessions.userId, session.user.id))
            .limit(1);

          // Build update with per-field conflict resolution
          const update: Record<string, unknown> = {
            updatedAt: now,
          };

          // Queue fields: only update if client timestamp is newer
          if (body.queue !== undefined) {
            const clientQueueTs = body.queueUpdatedAt ? new Date(body.queueUpdatedAt) : now;
            const serverQueueTs = existing?.queueUpdatedAt ?? new Date(0);

            if (clientQueueTs >= serverQueueTs) {
              let queue = body.queue as SyncSong[];
              let currentIndex = body.currentIndex ?? 0;

              // Enforce queue size limit
              if (queue.length > MAX_QUEUE_SIZE) {
                queue = queue.slice(currentIndex, currentIndex + MAX_QUEUE_SIZE);
                currentIndex = 0;
              }

              update.queue = queue;
              update.currentIndex = currentIndex;
              update.isShuffled = body.isShuffled ?? false;
              update.queueUpdatedAt = clientQueueTs;

              if (body.originalQueue !== undefined) {
                let originalQueue = body.originalQueue as SyncSong[];
                if (originalQueue.length > MAX_QUEUE_SIZE) {
                  originalQueue = originalQueue.slice(0, MAX_QUEUE_SIZE);
                }
                update.originalQueue = originalQueue;
              }
            }
          }

          // Position: only update if client timestamp is newer
          if (body.currentPositionMs !== undefined) {
            const clientPosTs = body.positionUpdatedAt ? new Date(body.positionUpdatedAt) : now;
            const serverPosTs = existing?.positionUpdatedAt ?? new Date(0);

            if (clientPosTs >= serverPosTs) {
              update.currentPositionMs = body.currentPositionMs;
              update.positionUpdatedAt = clientPosTs;
            }
          }

          // Play state: only update if client timestamp is newer
          if (body.isPlaying !== undefined) {
            const clientPlayTs = body.playStateUpdatedAt ? new Date(body.playStateUpdatedAt) : now;
            const serverPlayTs = existing?.playStateUpdatedAt ?? new Date(0);

            if (clientPlayTs >= serverPlayTs) {
              update.isPlaying = body.isPlaying;
              update.playStateUpdatedAt = clientPlayTs;
            }
          }

          // Volume: always accept (no conflict concern)
          if (body.volume !== undefined) {
            update.volume = body.volume;
          }

          // Device info: only update when the device is actively playing.
          // A paused device should not overwrite the active player.
          if (body.deviceId && body.isPlaying) {
            update.activeDeviceId = body.deviceId;
            update.activeDeviceName = body.deviceName ?? null;
            update.activeDeviceType = body.deviceType ?? null;
          }

          let result;
          if (existing) {
            [result] = await db
              .update(playbackSessions)
              .set(update)
              .where(eq(playbackSessions.userId, session.user.id))
              .returning();
          } else {
            [result] = await db
              .insert(playbackSessions)
              .values({
                userId: session.user.id,
                ...update,
              })
              .returning();
          }

          return new Response(JSON.stringify(sessionToResponse(result)), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Error updating playback state:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});
