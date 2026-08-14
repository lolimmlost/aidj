/**
 * Server-authoritative feedback broadcast bridge.
 *
 * When like/star state changes on the server (via setSongLiked or a bulk
 * reconcile), we want to push it to all of the user's connected devices so
 * their hearts update live — even when the change didn't originate from a
 * browser holding a WebSocket (API callers, background sync, reconcile-on-open).
 *
 * Why a globalThis indirection instead of importing playback-websocket directly:
 * in production the WS server (server.ts, loaded from source via tsx) and the
 * API/SSR handlers (the bundled dist/server/server.js) hold SEPARATE module
 * instances of playback-websocket — so a direct import would read an empty
 * connection registry and silently no-op. Both run in the same Node process,
 * though, so a function parked on `globalThis` (installed by setupPlaybackWebSocket
 * in whichever process owns the sockets) IS shared. It safely no-ops wherever the
 * WS server isn't running (dev SSR, cloudflare build, unit tests).
 *
 * This module is the single swap-point: to move to Postgres LISTEN/NOTIFY later,
 * change only the bodies below; call sites stay untouched.
 *
 * See docs/design/feedback-broadcast-server-bridge.md.
 */

declare global {
  // `var` is required here — a global augmentation on globalThis can't use let/const.
  var __aidjBroadcastToUser:
    | ((userId: string, message: Record<string, unknown>, logType: string) => void)
    | undefined;
}

/** Push a single-song like/unlike change to all of the user's devices. */
export function broadcastFeedbackChange(userId: string, songId: string, liked: boolean): void {
  globalThis.__aidjBroadcastToUser?.(
    userId,
    { type: 'feedback_update', payload: { songId, liked } },
    'feedback_update',
  );
}

/**
 * Coalesced refresh signal for bulk changes (reconcile / sync) — one message
 * instead of one-per-song. Clients invalidate their whole feedback cache.
 */
export function broadcastFeedbackRefresh(userId: string): void {
  globalThis.__aidjBroadcastToUser?.(userId, { type: 'feedback_refresh' }, 'feedback_refresh');
}
