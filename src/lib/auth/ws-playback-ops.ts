/**
 * WebSocket Playback DB Operations
 *
 * Server-side helpers used by the WebSocket handler for playback session
 * mutations that need direct DB access (not a fetch to the API route).
 */

import { db } from '@/lib/db';
import { playbackSessions } from '@/lib/db/schema/playback-session.schema';
import { eq } from 'drizzle-orm';

export interface ClearActiveDeviceResult {
  cleared: boolean;
  playStateUpdatedAt: string | null;
}

/**
 * If the given device is the currently-active player, clear the active-device
 * fields and set isPlaying=false. Queue, currentIndex, position are not touched.
 *
 * Called from the WebSocket close handler so a device that disappears
 * (browser tab closed, network drop) doesn't leave the server advertising it
 * as the active player — which would trap other devices in remote-control
 * mode with a dead target.
 */
export async function clearActiveDeviceIfMatches(
  userId: string,
  deviceId: string,
): Promise<ClearActiveDeviceResult> {
  try {
    const [existing] = await db
      .select()
      .from(playbackSessions)
      .where(eq(playbackSessions.userId, userId))
      .limit(1);

    if (!existing || existing.activeDeviceId !== deviceId) {
      return { cleared: false, playStateUpdatedAt: null };
    }

    const now = new Date();
    await db
      .update(playbackSessions)
      .set({
        isPlaying: false,
        activeDeviceId: null,
        activeDeviceName: null,
        activeDeviceType: null,
        playStateUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(playbackSessions.userId, userId));

    return { cleared: true, playStateUpdatedAt: now.toISOString() };
  } catch (err) {
    console.error('[WS] clearActiveDeviceIfMatches failed:', err);
    return { cleared: false, playStateUpdatedAt: null };
  }
}
