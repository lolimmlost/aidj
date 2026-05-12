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

// Track which deviceId each ws represents (captured from first message carrying one)
const wsDeviceIds = new WeakMap<WebSocket, string>();

// Message types
interface PlaybackMessage {
  type: 'state_update' | 'transfer' | 'command' | 'sync_request' | 'heartbeat' | 'feedback_update';
  payload?: Record<string, unknown>;
  deviceId: string;
}

interface PlaybackCommand {
  action: 'play' | 'pause' | 'next' | 'previous' | 'seek' | 'volume' | 'shuffle';
  value?: string | number | boolean;
}

// Session lookup function (to be implemented with your auth)
type GetUserIdFromRequest = (request: import('http').IncomingMessage) => Promise<string | null>;

// Optional DB hook to clear the active-device fields when a device disconnects.
// Returns `cleared: true` only if the disconnecting device was in fact the
// active player. `playStateUpdatedAt` is the new server timestamp used by the
// client-side conflict-resolution merge.
export type ClearActiveDevice = (
  userId: string,
  deviceId: string,
) => Promise<{ cleared: boolean; playStateUpdatedAt: string | null }>;

/**
 * Setup WebSocket handlers for playback sync
 */
export function setupPlaybackWebSocket(
  wss: WebSocketServer,
  getUserId: GetUserIdFromRequest,
  clearActiveDevice?: ClearActiveDevice,
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

  wss.on('connection', async (ws: WebSocket, request: import('http').IncomingMessage) => {
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
      const raw = data.toString();
      try {
        const message: PlaybackMessage = JSON.parse(raw);

        // Update heartbeat on any message
        lastHeartbeat.set(ws, Date.now());

        // Capture the deviceId this ws represents so we can detect a stale
        // active-device entry when the connection closes.
        if (message.deviceId && !wsDeviceIds.has(ws)) {
          wsDeviceIds.set(ws, message.deviceId);
          console.log(`[WS RX] user=${userId} device=${message.deviceId} bound to socket (first message)`);
        }

        // Compact RX summary so the transfer/command/state flow is traceable
        // in the log. Pulls only the fields that matter for diagnosis.
        const fromDevice = message.deviceId ?? '?';
        let summary = `type=${message.type} from=${fromDevice}`;
        if (message.type === 'transfer') {
          const p = message.payload as { targetDeviceId?: string; targetDeviceName?: string; play?: boolean } | undefined;
          summary += ` target=${p?.targetDeviceId ?? '?'} targetName=${JSON.stringify(p?.targetDeviceName ?? null)} play=${p?.play ?? '?'}`;
        } else if (message.type === 'command') {
          const p = message.payload as { action?: string; value?: unknown } | undefined;
          summary += ` action=${p?.action ?? '?'}` + (p?.value !== undefined ? ` value=${JSON.stringify(p.value)}` : '');
        } else if (message.type === 'state_update') {
          const p = message.payload as { isPlaying?: boolean; deviceId?: string; deviceName?: string; currentIndex?: number; playStateUpdatedAt?: string } | undefined;
          summary += ` isPlaying=${p?.isPlaying ?? '?'} senderName=${JSON.stringify(p?.deviceName ?? null)} idx=${p?.currentIndex ?? '?'}`;
        }
        if (message.type !== 'heartbeat') {
          console.log(`[WS RX] ${summary}`);
        }

        switch (message.type) {
          case 'state_update':
            // Broadcast state to other devices of this user
            broadcastToUser(userId, ws, {
              type: 'state',
              payload: message.payload,
            }, 'state');
            break;

          case 'command':
            // Forward transport commands (play/pause/next/prev/seek/volume) to ALL
            // devices including the sender. Sent by sendRemoteCommand() when a
            // non-playing device triggers a control action. The receiving handler
            // only executes on the device with isPlaying === true.
            broadcastToAllDevices(userId, {
              type: 'remote_command',
              payload: message.payload as PlaybackCommand,
              fromDevice: message.deviceId,
            }, 'remote_command');
            break;

          case 'transfer':
            // Notify all devices about transfer
            broadcastToAllDevices(userId, {
              type: 'transfer',
              payload: message.payload,
            }, 'transfer');
            break;

          case 'sync_request':
            // Request current state from other devices
            broadcastToUser(userId, ws, {
              type: 'sync_request',
              requestingDevice: message.deviceId,
            }, 'sync_request');
            break;

          case 'feedback_update':
            // Broadcast feedback changes (like/unlike) to other devices
            broadcastToUser(userId, ws, {
              type: 'feedback_update',
              payload: message.payload,
            }, 'feedback_update');
            break;

          case 'heartbeat':
            // Already updated lastHeartbeat, just acknowledge
            ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
            break;

          default:
            // Surface unknown message types — silently dropped messages are
            // a common cause of "I sent X but the other device didn't react."
            console.warn(`[WS RX] ⚠️ unknown message type — dropped: ${JSON.stringify(message).slice(0, 200)}`);
        }
      } catch (err) {
        // Include the raw payload (truncated) so we can see what failed to parse.
        console.error(`[WS] ⚠️ Message error: ${(err as Error).message} — raw=${raw.slice(0, 200)}`);
      }
    });

    ws.on('close', async () => {
      connections.get(userId)?.delete(ws);
      const remaining = connections.get(userId)?.size || 0;
      console.log(`[WS] User ${userId} disconnected (${remaining} remaining)`);

      // If the closing device was the active player, clear server-side state
      // so other devices drop out of remote-control mode with a dead target.
      const deviceId = wsDeviceIds.get(ws);
      if (deviceId && clearActiveDevice) {
        try {
          const { cleared, playStateUpdatedAt } = await clearActiveDevice(userId, deviceId);
          if (cleared && playStateUpdatedAt) {
            console.log(`[WS] Cleared stale active device for user ${userId} (was ${deviceId})`);
            // Notify remaining devices so their remoteDevice indicator flips off.
            broadcastToAllDevices(userId, {
              type: 'state',
              payload: {
                isPlaying: false,
                deviceId: null,
                deviceName: null,
                playStateUpdatedAt,
              },
            }, 'state-cleared-on-disconnect');
          }
        } catch (err) {
          console.error('[WS] Error clearing active device on disconnect:', err);
        }
      }

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
 * Broadcast to all devices of a user except the sender. `typeForLog` is the
 * outgoing message's `type` field, used only for diagnostic logging.
 */
function broadcastToUser(userId: string, sender: WebSocket, message: Record<string, unknown>, typeForLog: string) {
  const userConnections = connections.get(userId);
  if (!userConnections) return;

  const data = JSON.stringify(message);
  let sent = 0;
  let skippedClosed = 0;

  for (const ws of userConnections) {
    if (ws !== sender) {
      if (ws.readyState === 1) {
        ws.send(data);
        sent++;
      } else {
        skippedClosed++;
      }
    }
  }

  const skipNote = skippedClosed > 0 ? ` (skipped ${skippedClosed} closed)` : '';
  console.log(`[WS TX] type=${typeForLog} to=${sent} device(s) (excluding sender)${skipNote}`);
}

/**
 * Broadcast to all devices of a user including sender. `typeForLog` is the
 * outgoing message's `type` field, used only for diagnostic logging.
 */
function broadcastToAllDevices(userId: string, message: Record<string, unknown>, typeForLog: string) {
  const userConnections = connections.get(userId);
  if (!userConnections) {
    console.warn(`[WS TX] ⚠️ type=${typeForLog} dropped — no connections for user ${userId}`);
    return;
  }

  const data = JSON.stringify(message);
  let sent = 0;
  let skippedClosed = 0;

  for (const ws of userConnections) {
    if (ws.readyState === 1) {
      ws.send(data);
      sent++;
    } else {
      skippedClosed++;
    }
  }

  const skipNote = skippedClosed > 0 ? ` (skipped ${skippedClosed} closed)` : '';
  console.log(`[WS TX] type=${typeForLog} to=ALL ${sent} device(s)${skipNote}`);
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
