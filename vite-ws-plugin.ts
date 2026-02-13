/**
 * Vite WebSocket Plugin
 *
 * Adds WebSocket support to the Vite dev server.
 * In production, WebSocket is handled by the Node.js server entry.
 *
 * NOTE: This plugin uses a simplified dev-only auth approach because
 * the full auth module uses path aliases (~/) that can't be resolved
 * in the Vite plugin context. Production uses proper auth via server.ts.
 */

import type { Plugin, ViteDevServer } from 'vite';
import { WebSocketServer } from 'ws';
import { setupPlaybackWebSocket } from './src/lib/services/playback-websocket';

/**
 * Extract session/user ID from request (Development Only)
 *
 * For development, we use a simplified auth check:
 * 1. Query param ?userId=xxx for testing
 * 2. Session cookie presence for authenticated users
 *
 * Production uses proper session validation in server.ts
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

  // In development, allow connection if there's a session cookie
  // The actual session validation happens on API calls
  if (cookieHeader.includes('better-auth.session_token')) {
    // Extract a stable identifier from the session token for dev purposes
    // This isn't cryptographically secure but works for dev sync testing
    const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
    if (match) {
      // Use first 8 chars of token as pseudo-user-id for dev
      const tokenPrefix = match[1].substring(0, 8);
      console.log('[WS Dev] Session cookie found, dev user:', tokenPrefix);
      return `dev-${tokenPrefix}`;
    }
    console.log('[WS Dev] Session cookie found, allowing dev connection');
    return 'dev-authenticated-user';
  }

  console.log('[WS Dev] No valid session cookie found');
  return null;
}

export function viteWebSocketPlugin(): Plugin {
  let wss: WebSocketServer | null = null;

  return {
    name: 'vite-playback-websocket',

    configureServer(server: ViteDevServer) {
      // Create WebSocket server without its own HTTP server
      wss = new WebSocketServer({ noServer: true });

      // Setup playback handlers
      setupPlaybackWebSocket(wss, getUserIdFromRequest);

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
    },
  };
}
