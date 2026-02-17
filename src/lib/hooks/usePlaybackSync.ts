/**
 * Cross-Device Playback Sync Hook
 *
 * Connects the audio store to the server via:
 * - REST API for persistent state (on mount, visibility change, debounced writes)
 * - WebSocket for real-time sync between devices
 *
 * Uses per-field timestamps for conflict resolution.
 */

import { useEffect, useRef, useMemo } from 'react';
import { useAudioStore } from '../stores/audio';
import { createReconnectingWebSocket } from '../utils/websocket';
import { getDeviceInfo } from '../utils/device';
import { toSyncSong } from '../types/sync';
import type { PlaybackStateResponse } from '../types/sync';

// Debounce delay for pushing state to server (ms)
const SYNC_DEBOUNCE_MS = 2000;
// Heartbeat interval (ms)
const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * Debounce a function call. Returns a cancel function.
 */
function createDebounced(fn: () => void, delay: number): { trigger: () => void; cancel: () => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    trigger: () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delay);
    },
    cancel: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    flush: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        fn();
      }
    },
  };
}

/**
 * Push current audio store state to server via REST.
 * Always stamps positionUpdatedAt with the current time so the server
 * has an accurate timestamp for conflict resolution.
 */
async function pushStateToServer(): Promise<void> {
  const state = useAudioStore.getState();
  const deviceInfo = getDeviceInfo();
  const now = new Date().toISOString();

  // Stamp positionUpdatedAt so the server has a fresh timestamp
  useAudioStore.setState({ positionUpdatedAt: now });

  try {
    await fetch('/api/playback/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        queue: state.playlist.map(toSyncSong),
        originalQueue: (state.originalPlaylist ?? []).map(toSyncSong),
        currentIndex: state.currentSongIndex,
        currentPositionMs: Math.floor((state.currentTime ?? 0) * 1000),
        isPlaying: state.isPlaying,
        volume: state.volume,
        isShuffled: state.isShuffled,
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        queueUpdatedAt: state.queueUpdatedAt ?? now,
        positionUpdatedAt: now,
        playStateUpdatedAt: state.playStateUpdatedAt ?? now,
      }),
    });
  } catch (err) {
    console.warn('[PlaybackSync] Failed to push state:', err);
  }
}

/**
 * Fetch server state and reconcile with local state
 */
async function fetchAndReconcileState(): Promise<void> {
  try {
    const res = await fetch('/api/playback/state', {
      credentials: 'include',
    });
    if (!res.ok) return;

    const server: PlaybackStateResponse = await res.json();
    const store = useAudioStore.getState();

    // Apply server state where it's newer
    if (store.applyServerState) {
      store.applyServerState(server);
    }
  } catch (err) {
    console.warn('[PlaybackSync] Failed to fetch state:', err);
  }
}

/**
 * Broadcast state update to other devices via WebSocket
 */
function broadcastStateViaWS(ws: WebSocket | null): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const state = useAudioStore.getState();
  const deviceInfo = getDeviceInfo();

  ws.send(JSON.stringify({
    type: 'state_update',
    deviceId: deviceInfo.deviceId,
    payload: {
      queue: state.playlist.map(toSyncSong),
      currentIndex: state.currentSongIndex,
      currentPositionMs: Math.floor((state.currentTime ?? 0) * 1000),
      isPlaying: state.isPlaying,
      volume: state.volume,
      isShuffled: state.isShuffled,
      queueUpdatedAt: state.queueUpdatedAt,
      positionUpdatedAt: state.positionUpdatedAt,
      playStateUpdatedAt: state.playStateUpdatedAt,
    },
  }));
}

/**
 * Handle incoming WS messages from other devices
 */
function handleIncomingMessage(
  msg: Record<string, unknown>,
  deviceId: string,
): void {
  const store = useAudioStore.getState();

  switch (msg.type) {
    case 'state': {
      // Another device pushed state — update remote device indicator
      // with song info so we can display what's playing remotely
      const payload = msg.payload as Record<string, unknown> | undefined;
      if (payload && store.setRemoteDevice) {
        // Extract current song info from the queue
        const queue = payload.queue as Array<{ name?: string; title?: string; artist?: string; duration?: number }> | undefined;
        const currentIndex = payload.currentIndex as number | undefined;
        const currentSong = queue && typeof currentIndex === 'number' ? queue[currentIndex] : null;

        store.setRemoteDevice({
          deviceId: (payload.deviceId as string) ?? null,
          deviceName: (payload.deviceName as string) ?? null,
          isPlaying: (payload.isPlaying as boolean) ?? false,
          songName: currentSong?.title || currentSong?.name || null,
          artist: currentSong?.artist || null,
          currentPositionMs: (payload.currentPositionMs as number) ?? undefined,
          durationMs: currentSong?.duration ? currentSong.duration * 1000 : undefined,
          updatedAt: Date.now(),
        });
      }
      break;
    }

    case 'remote_command': {
      // Another device sent a command to this device
      const payload = msg.payload as { action: string; value?: unknown } | undefined;
      if (!payload) break;

      // Only apply if this device is the active player
      if (!store.isPlaying) break;

      switch (payload.action) {
        case 'play':
          store.setIsPlaying(true);
          break;
        case 'pause':
          store.markUserPause();
          store.setIsPlaying(false);
          break;
        case 'next':
          store.nextSong();
          break;
        case 'previous':
          store.previousSong();
          break;
        case 'seek':
          if (typeof payload.value === 'number') {
            store.setCurrentTime(payload.value);
          }
          break;
        case 'volume':
          if (typeof payload.value === 'number') {
            store.setVolume(payload.value);
          }
          break;
      }
      break;
    }

    case 'transfer': {
      // Playback transferred between devices
      const payload = msg.payload as { targetDeviceId?: string; play?: boolean } | undefined;
      if (!payload) break;

      if (payload.targetDeviceId === deviceId) {
        // Transfer TO this device — fetch full state from server and apply
        fetchAndReconcileState();
      } else if (store.isPlaying) {
        // Transfer AWAY from this device — pause and show indicator
        store.markUserPause();
        store.setIsPlaying(false);
        if (store.setRemoteDevice) {
          store.setRemoteDevice({
            deviceId: payload.targetDeviceId ?? null,
            deviceName: null,
            isPlaying: true,
          });
        }
      }
      break;
    }

    case 'sync_request': {
      // Another device wants our state — respond if we're playing
      if (store.isPlaying) {
        // The WS server already broadcasts our response
        // We just need to push our current state
        pushStateToServer();
      }
      break;
    }
  }
}

/**
 * Main hook: call this once at the app level (e.g., in PlayerBar)
 */
export function usePlaybackSync(): void {
  const wsRef = useRef<WebSocket | null>(null);
  const deviceInfo = useMemo(() => getDeviceInfo(), []);

  // Track previous state values to detect actual changes
  const prevStateRef = useRef<{
    playlistLength: number;
    currentSongIndex: number;
    isPlaying: boolean;
    volume: number;
    isShuffled: boolean;
  } | null>(null);

  useEffect(() => {
    // Create debounced sync inside effect where ref access is valid
    const debouncedSync = createDebounced(() => {
      pushStateToServer();
      broadcastStateViaWS(wsRef.current);
    }, SYNC_DEBOUNCE_MS);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Going to background — flush any pending sync immediately
        debouncedSync.flush();
        pushStateToServer();
      } else {
        // Coming back — check for updates from other devices
        fetchAndReconcileState();
      }
    };

    // 1. Register device
    fetch('/api/playback/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(deviceInfo),
    }).catch(err => console.warn('[PlaybackSync] Device registration failed:', err));

    // 2. Connect WebSocket
    const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/playback`;
    const ws = createReconnectingWebSocket(wsUrl, {
      onOpen: () => {
        console.log('[PlaybackSync] WebSocket connected');
        // Request state from other devices
        ws.send(JSON.stringify({
          type: 'sync_request',
          deviceId: deviceInfo.deviceId,
        }));
      },
      onMessage: (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'heartbeat_ack') return;
          handleIncomingMessage(msg, deviceInfo.deviceId);
        } catch (err) {
          console.warn('[PlaybackSync] Failed to parse WS message:', err);
        }
      },
    });
    wsRef.current = ws;

    // 3. Fetch server state on mount
    fetchAndReconcileState();

    // 4. Subscribe to audio store changes — only sync when meaningful state changes
    const unsub = useAudioStore.subscribe((state) => {
      const prev = prevStateRef.current;
      const queueChanged = !prev
        || prev.playlistLength !== state.playlist.length
        || prev.currentSongIndex !== state.currentSongIndex
        || prev.isShuffled !== state.isShuffled;
      const playStateChanged = !prev || prev.isPlaying !== state.isPlaying;
      const volumeChanged = !prev || prev.volume !== state.volume;

      prevStateRef.current = {
        playlistLength: state.playlist.length,
        currentSongIndex: state.currentSongIndex,
        isPlaying: state.isPlaying,
        volume: state.volume,
        isShuffled: state.isShuffled,
      };

      // Stamp per-field timestamps on change
      const now = new Date().toISOString();
      const tsUpdate: Record<string, string> = {};
      if (queueChanged) tsUpdate.queueUpdatedAt = now;
      if (playStateChanged) tsUpdate.playStateUpdatedAt = now;
      if (Object.keys(tsUpdate).length > 0) {
        useAudioStore.setState(tsUpdate);
      }

      if (queueChanged || playStateChanged || volumeChanged) {
        debouncedSync.trigger();
      }
    });

    // 5. Visibility change handler
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 6. Heartbeat
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'heartbeat',
          deviceId: deviceInfo.deviceId,
        }));
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      unsub();
      debouncedSync.cancel();
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      ws.close();
      wsRef.current = null;
    };
  }, [deviceInfo]);
}
