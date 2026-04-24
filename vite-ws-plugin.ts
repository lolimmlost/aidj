/**
 * Vite WebSocket Plugin
 *
 * Adds WebSocket support to the Vite dev server.
 * In production, WebSocket is handled by the Node.js server entry.
 *
 * Uses a direct DB query to resolve the session token to a real user ID,
 * so that multiple devices with different session tokens for the same user
 * are grouped correctly for cross-device sync.
 */

import type { Plugin, ViteDevServer } from 'vite';
import { WebSocketServer } from 'ws';
import { setupPlaybackWebSocket } from './src/lib/services/playback-websocket';
import postgres from 'postgres';

// Lazy-init DB connection for session lookups
let sql: ReturnType<typeof postgres> | null = null;

function getDb() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error('[WS Dev] DATABASE_URL not set, cannot validate sessions');
      return null;
    }
    sql = postgres(url);
  }
  return sql;
}

/**
 * Extract real user ID from request by looking up the session token in the DB.
 *
 * Falls back to query param ?userId=xxx for manual testing.
 */
async function getUserIdFromRequest(request: import('http').IncomingMessage): Promise<string | null> {
  const url = new URL(request.url || '', `http://${request.headers.host}`);

  // Development: allow ?userId=xxx query param for testing
  const devUserId = url.searchParams.get('userId');
  if (devUserId) {
    console.log('[WS Dev] Using query param userId:', devUserId);
    return devUserId;
  }

  // Check for session cookie
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    console.log('[WS Dev] No cookie header, rejecting connection');
    return null;
  }

  const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
  if (!match) {
    console.log('[WS Dev] No valid session cookie found');
    return null;
  }

  const decoded = decodeURIComponent(match[1]);
  // better-auth cookie format: "{token}.{signature}" — extract just the token part
  const token = decoded.includes('.') ? decoded.split('.')[0] : decoded;
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const rows = await db`
      SELECT user_id FROM session
      WHERE token = ${token} AND expires_at > NOW()
      LIMIT 1
    `;

    if (rows.length === 0) {
      console.log('[WS Dev] Session token not found or expired');
      return null;
    }

    const userId = rows[0].user_id as string;
    console.log('[WS Dev] Resolved session to user:', userId);
    return userId;
  } catch (err) {
    console.error('[WS Dev] Session lookup error:', err);
    return null;
  }
}

/**
 * Clear the active-device fields if the disconnecting device matches.
 * Dev-mode mirror of `src/lib/auth/ws-playback-ops.ts`, using the same
 * postgres connection used for session lookups.
 */
async function clearActiveDeviceIfMatches(
  userId: string,
  deviceId: string,
): Promise<{ cleared: boolean; playStateUpdatedAt: string | null }> {
  const db = getDb();
  if (!db) {
    return { cleared: false, playStateUpdatedAt: null };
  }

  try {
    const rows = await db`
      UPDATE playback_sessions
      SET is_playing = false,
          active_device_id = NULL,
          active_device_name = NULL,
          active_device_type = NULL,
          play_state_updated_at = NOW(),
          updated_at = NOW()
      WHERE user_id = ${userId} AND active_device_id = ${deviceId}
      RETURNING play_state_updated_at
    `;

    if (rows.length === 0) {
      return { cleared: false, playStateUpdatedAt: null };
    }

    const ts = rows[0].play_state_updated_at as Date | string;
    const iso = typeof ts === 'string' ? new Date(ts).toISOString() : ts.toISOString();
    return { cleared: true, playStateUpdatedAt: iso };
  } catch (err) {
    console.error('[WS Dev] clearActiveDeviceIfMatches error:', err);
    return { cleared: false, playStateUpdatedAt: null };
  }
}

export function viteWebSocketPlugin(): Plugin {
  let wss: WebSocketServer | null = null;

  return {
    name: 'vite-playback-websocket',

    configureServer(server: ViteDevServer) {
      // Create WebSocket server without its own HTTP server
      wss = new WebSocketServer({ noServer: true });

      // Setup playback handlers
      setupPlaybackWebSocket(wss, getUserIdFromRequest, clearActiveDeviceIfMatches);

      // Handle upgrade requests
      server.httpServer?.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url || '', `http://${request.headers.host}`);

        // Only handle /ws/playback path
        if (url.pathname === '/ws/playback') {
          console.log('[WS] Upgrade request for /ws/playback');

          wss!.handleUpgrade(request, socket, head, (ws) => {
            wss!.emit('connection', ws, request);
          });
        }
        // Let other upgrade requests pass through (e.g., HMR)
      });

      console.log('[WS] WebSocket server initialized on /ws/playback');
    },

    closeBundle() {
      // Close WebSocket server when Vite closes
      if (wss) {
        wss.close();
        wss = null;
      }
      // Close DB connection
      if (sql) {
        sql.end();
        sql = null;
      }
    },
  };
}
