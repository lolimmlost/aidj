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

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

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
