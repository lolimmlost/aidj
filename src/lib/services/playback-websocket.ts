/**
 * Playback WebSocket Service
 *
 * Handles real-time playback state sync between devices.
 * Used for Spotify Connect-style jukebox functionality.
 */

import type { WebSocket, WebSocketServer } from 'ws';

// Connection registry by userId
const connections = new Map<string, Set<WebSocket>>();

// Track last heartbeat per connection
const lastHeartbeat = new WeakMap<WebSocket, number>();

// Message types
interface PlaybackMessage {
  type: 'state_update' | 'transfer' | 'command' | 'sync_request' | 'heartbeat';
  payload?: any;
  deviceId: string;
}

interface PlaybackCommand {
  action: 'play' | 'pause' | 'next' | 'previous' | 'seek' | 'volume' | 'shuffle';
  value?: any;
}

// Session lookup function (to be implemented with your auth)
type GetUserIdFromRequest = (request: any) => Promise<string | null>;

/**
 * Setup WebSocket handlers for playback sync
 */
export function setupPlaybackWebSocket(
  wss: WebSocketServer,
  getUserId: GetUserIdFromRequest
) {
  // Heartbeat check - terminate dead connections
  const HEARTBEAT_TIMEOUT = 60000; // 60 seconds
  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    wss.clients.forEach((ws: WebSocket) => {
      const last = lastHeartbeat.get(ws) || 0;
      if (now - last > HEARTBEAT_TIMEOUT) {
        console.log('[WS] Terminating dead connection');
        ws.terminate();
      }
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', async (ws: WebSocket, request: any) => {
    // Get user ID from session
    const userId = await getUserId(request);
    if (!userId) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Register connection
    if (!connections.has(userId)) {
      connections.set(userId, new Set());
    }
    connections.get(userId)!.add(ws);
    lastHeartbeat.set(ws, Date.now());

    const deviceCount = connections.get(userId)!.size;
    console.log(`[WS] User ${userId} connected (${deviceCount} device${deviceCount > 1 ? 's' : ''})`);

    // Handle messages
    ws.on('message', async (data: Buffer) => {
      try {
        const message: PlaybackMessage = JSON.parse(data.toString());

        // Update heartbeat on any message
        lastHeartbeat.set(ws, Date.now());

        switch (message.type) {
          case 'state_update':
            // Broadcast state to other devices of this user
            broadcastToUser(userId, ws, {
              type: 'state',
              payload: message.payload,
            });
            break;

          case 'command':
            // Forward command to all devices
            broadcastToAllDevices(userId, {
              type: 'remote_command',
              payload: message.payload as PlaybackCommand,
              fromDevice: message.deviceId,
            });
            break;

          case 'transfer':
            // Notify all devices about transfer
            broadcastToAllDevices(userId, {
              type: 'transfer',
              payload: message.payload,
            });
            break;

          case 'sync_request':
            // Request current state from other devices
            broadcastToUser(userId, ws, {
              type: 'sync_request',
              requestingDevice: message.deviceId,
            });
            break;

          case 'heartbeat':
            // Already updated lastHeartbeat, just acknowledge
            ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
            break;
        }
      } catch (err) {
        console.error('[WS] Message error:', err);
      }
    });

    ws.on('close', () => {
      connections.get(userId)?.delete(ws);
      const remaining = connections.get(userId)?.size || 0;
      console.log(`[WS] User ${userId} disconnected (${remaining} remaining)`);

      if (remaining === 0) {
        connections.delete(userId);
      }
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error for user ${userId}:`, err);
    });
  });
}

/**
 * Broadcast to all devices of a user except the sender
 */
function broadcastToUser(userId: string, sender: WebSocket, message: any) {
  const userConnections = connections.get(userId);
  if (!userConnections) return;

  const data = JSON.stringify(message);
  let sent = 0;

  for (const ws of userConnections) {
    if (ws !== sender && ws.readyState === 1) { // WebSocket.OPEN = 1
      ws.send(data);
      sent++;
    }
  }

  if (sent > 0) {
    console.log(`[WS] Broadcast to ${sent} device(s) for user ${userId}`);
  }
}

/**
 * Broadcast to all devices of a user including sender
 */
function broadcastToAllDevices(userId: string, message: any) {
  const userConnections = connections.get(userId);
  if (!userConnections) return;

  const data = JSON.stringify(message);
  let sent = 0;

  for (const ws of userConnections) {
    if (ws.readyState === 1) { // WebSocket.OPEN = 1
      ws.send(data);
      sent++;
    }
  }

  console.log(`[WS] Broadcast to all ${sent} device(s) for user ${userId}`);
}

/**
 * Get count of connected devices for a user
 */
export function getConnectedDeviceCount(userId: string): number {
  return connections.get(userId)?.size || 0;
}

/**
 * Check if a user has any connected devices
 */
export function hasConnectedDevices(userId: string): boolean {
  const userConnections = connections.get(userId);
  return userConnections ? userConnections.size > 0 : false;
}
