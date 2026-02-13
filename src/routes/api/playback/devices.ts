/**
 * Device Registry API
 *
 * GET  /api/playback/devices          - List user's devices
 * POST /api/playback/devices          - Register/update a device
 */

import { createFileRoute } from "@tanstack/react-router";
import { auth } from '../../../lib/auth/auth';
import { db } from '../../../lib/db';
import { devices } from '../../../lib/db/schema/devices.schema';
import { eq, and, gte } from 'drizzle-orm';

export const Route = createFileRoute("/api/playback/devices")({
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

          // Only return devices seen in the last 30 days
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          const userDevices = await db
            .select()
            .from(devices)
            .where(
              and(
                eq(devices.userId, session.user.id),
                gte(devices.lastSeenAt, thirtyDaysAgo)
              )
            );

          return new Response(
            JSON.stringify({
              devices: userDevices.map(d => ({
                id: d.id,
                deviceName: d.deviceName,
                deviceType: d.deviceType,
                lastSeenAt: d.lastSeenAt.toISOString(),
              })),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('Error listing devices:', error);
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

          if (!body.deviceId || !body.deviceName || !body.deviceType) {
            return new Response(
              JSON.stringify({ error: 'Missing required fields: deviceId, deviceName, deviceType' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }

          // Upsert device
          const [device] = await db
            .insert(devices)
            .values({
              id: body.deviceId,
              userId: session.user.id,
              deviceName: body.deviceName,
              deviceType: body.deviceType,
              userAgent: body.userAgent ?? null,
              lastSeenAt: new Date(),
            })
            .onConflictDoUpdate({
              target: devices.id,
              set: {
                deviceName: body.deviceName,
                deviceType: body.deviceType,
                userAgent: body.userAgent ?? null,
                lastSeenAt: new Date(),
              },
            })
            .returning();

          return new Response(
            JSON.stringify({
              device: {
                id: device.id,
                deviceName: device.deviceName,
                deviceType: device.deviceType,
                lastSeenAt: device.lastSeenAt.toISOString(),
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('Error registering device:', error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      },
    },
  },
});
