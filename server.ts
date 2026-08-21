/**
 * Production Server Entry with WebSocket Support
 *
 * This server wraps the TanStack Start handler and adds
 * WebSocket support for playback sync (Spotify Connect-style).
 *
 * Usage:
 *   npm run build
 *   npm run start:ws  (or: npx tsx server.ts)
 */

import { createServer } from 'http';
import { join } from 'path';
import { WebSocketServer } from 'ws';
import { toNodeHandler } from 'srvx/node';
import sirv from 'sirv';
import { setupPlaybackWebSocket } from './src/lib/services/playback-websocket';
import { getUserIdFromRequest } from './src/lib/auth/ws-session';
import { clearActiveDeviceIfMatches } from './src/lib/auth/ws-playback-ops';
import { db } from './src/lib/db';
import { user } from './src/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { initializeReconciliation } from './src/lib/services/library-reconciliation';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Bootstrap server-lifetime background jobs. This is the ONLY prod boot hook —
 * `vite-ws-plugin.ts` is dev-only, so without this the reconciliation scheduler
 * is never initialized on prod and its 6-hour timer is never armed.
 *
 * Reconciliation is a single-user singleton, so we run it for the owner: the
 * `RECONCILIATION_USER_ID` env override, else the earliest `admin` user, else
 * the earliest user. Failures never block server startup.
 */
async function bootstrapBackgroundJobs() {
  try {
    let userId: string | undefined = process.env.RECONCILIATION_USER_ID?.trim() || undefined;

    if (!userId) {
      const admins = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.role, 'admin'))
        .orderBy(asc(user.createdAt))
        .limit(1);
      userId = admins[0]?.id;
    }
    if (!userId) {
      const anyUser = await db
        .select({ id: user.id })
        .from(user)
        .orderBy(asc(user.createdAt))
        .limit(1);
      userId = anyUser[0]?.id;
    }
    if (!userId) {
      console.warn('[Server] No user found — skipping library reconciliation bootstrap');
      return;
    }

    await initializeReconciliation(userId);
    console.log(`[Server] Library reconciliation bootstrapped for user ${userId}`);
  } catch (err) {
    console.error('[Server] Failed to bootstrap background jobs:', err);
  }
}

async function start() {
  // Import the built handler and convert to a proper Node handler
  // srvx/node's toNodeHandler correctly handles Set-Cookie splitting,
  // streaming responses, and lazy Request body conversion.
  let handler: (req: import('http').IncomingMessage, res: import('http').ServerResponse) => void;

  try {
    // Serve static assets from dist/client/ (CSS, JS, images, etc.)
    const serve = sirv(join(import.meta.dirname, 'dist/client'), {
      immutable: true,
      maxAge: 31536000, // 1 year for hashed assets
    });

    const mod = await import('./dist/server/server.js');
    const fetchHandler = mod.default?.fetch || mod.default;
    const ssrHandler = toNodeHandler(fetchHandler);

    // Static files first, then SSR/API handler
    handler = (req, res) => {
      serve(req, res, () => ssrHandler(req, res));
    };
    console.log('[Server] Loaded handler from dist/server/server.js');
  } catch (err) {
    console.error('[Server] Failed to load handler:', err);
    console.error('[Server] Make sure to run `npm run build` first');
    process.exit(1);
  }

  // Create HTTP server
  const server = createServer(handler);

  // Create WebSocket server
  const wss = new WebSocketServer({ noServer: true });

  // Setup playback WebSocket handlers
  setupPlaybackWebSocket(wss, getUserIdFromRequest, clearActiveDeviceIfMatches);

  // Handle upgrade requests
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);

    if (url.pathname === '/ws/playback') {
      console.log('[WS] Upgrade request for /ws/playback');

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      // Reject unknown WebSocket paths
      socket.destroy();
    }
  });

  // Start server
  server.listen(PORT, HOST, () => {
    console.log(`[Server] Listening on http://${HOST}:${PORT}`);
    console.log(`[Server] WebSocket available at ws://${HOST}:${PORT}/ws/playback`);
    // Fire-and-forget: never let background bootstrap block/kill the listener.
    void bootstrapBackgroundJobs();
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('[Server] Shutting down...');
    wss.close(() => {
      console.log('[Server] WebSocket server closed');
    });
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('[Server] Force exit after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
