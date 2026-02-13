/**
 * Transfer Playback API
 *
 * POST /api/playback/transfer - Transfer playback to a different device
 *
 * Updates the active device in the playback session.
 * The WebSocket layer broadcasts the transfer event to all connected devices.
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { playbackSessions } from '../../../lib/db/schema/playback-session.schema';
import { eq } from 'drizzle-orm';

export const Route = createFileRoute("/api/playback/transfer")({
  server: {
    handlers: {
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

          if (!body.targetDeviceId) {
            return new Response(
              JSON.stringify({ error: 'Missing required field: targetDeviceId' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }

          const now = new Date();

          // Update the active device and play state
          const [updated] = await db
            .update(playbackSessions)
            .set({
              activeDeviceId: body.targetDeviceId,
              activeDeviceName: body.targetDeviceName ?? null,
              activeDeviceType: body.targetDeviceType ?? null,
              isPlaying: body.play ?? false,
              playStateUpdatedAt: now,
              updatedAt: now,
            })
            .where(eq(playbackSessions.userId, session.user.id))
            .returning();

          if (!updated) {
            return new Response(
              JSON.stringify({ error: 'No playback session found' }),
              { status: 404, headers: { 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              activeDevice: {
                id: updated.activeDeviceId,
                name: updated.activeDeviceName,
                type: updated.activeDeviceType,
              },
              isPlaying: updated.isPlaying,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('Error transferring playback:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});
