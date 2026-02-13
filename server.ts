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
import { WebSocketServer } from 'ws';
import { setupPlaybackWebSocket } from './src/lib/services/playback-websocket';
import { getUserIdFromRequest } from './src/lib/auth/ws-session';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  // Import the built handler
  // In production, this will be the compiled output
  let handler: any;

  try {
    // Try to import from build output first
    const mod = await import('./.output/server/index.mjs');
    handler = mod.default || mod.handler || mod;
    console.log('[Server] Loaded handler from .output/server/index.mjs');
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
  setupPlaybackWebSocket(wss, getUserIdFromRequest);

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
