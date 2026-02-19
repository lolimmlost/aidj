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
// Guard flag: prevents the store subscription from re-broadcasting state
// that was just received from a remote device (avoids ping-pong loops)
let applyingRemoteState = false;
// Module-level WS reference for sending messages from outside the hook
let _wsRef: WebSocket | null = null;

/**
 * Send a custom message to other devices via the playback WebSocket.
 * Used for cross-device cache invalidation (e.g., feedback/like updates).
 */
export function sendPlaybackMessage(type: string, payload?: Record<string, unknown>): void {
  if (!_wsRef || _wsRef.readyState !== WebSocket.OPEN) return;
  const deviceInfo = getDeviceInfo();
  _wsRef.send(JSON.stringify({ type, deviceId: deviceInfo.deviceId, payload }));
}

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
      applyingRemoteState = true;
      store.applyServerState(server);
      applyingRemoteState = false;
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
      originalQueue: (state.originalPlaylist ?? []).map(toSyncSong),
      currentIndex: state.currentSongIndex,
      currentPositionMs: Math.floor((state.currentTime ?? 0) * 1000),
      isPlaying: state.isPlaying,
      volume: state.volume,
      isShuffled: state.isShuffled,
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
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
      // with song info AND apply queue/position to the main PlayerBar.
      // Wrap the ENTIRE handler in applyingRemoteState to prevent the store
      // subscription from detecting intermediate state changes and re-broadcasting.
      const payload = msg.payload as Record<string, unknown> | undefined;
      if (!payload) break;

      applyingRemoteState = true;
      try {
        // Extract current song info from the queue
        const queue = payload.queue as Array<{ name?: string; title?: string; artist?: string; duration?: number }> | undefined;
        const currentIndex = payload.currentIndex as number | undefined;
        const currentSong = queue && typeof currentIndex === 'number' ? queue[currentIndex] : null;
        const remoteIsPlaying = (payload.isPlaying as boolean) ?? false;

        // TAKEOVER: If remote device started playing and local is also playing,
        // the device with the newer playStateUpdatedAt wins. Pause the loser.
        if (remoteIsPlaying && store.isPlaying) {
          const remotePlayTs = (payload.playStateUpdatedAt as string) ?? '';
          const localPlayTs = store.playStateUpdatedAt ?? '';
          if (remotePlayTs > localPlayTs) {
            // Remote device started playing more recently — pause local playback
            console.log('[PlaybackSync] Remote device took over playback, pausing local');
            store.markUserPause();
            store.setIsPlaying(false);
            // Pause the actual audio element
            if (typeof document !== 'undefined') {
              document.querySelectorAll('audio').forEach(a => {
                if (!a.paused) a.pause();
              });
            }
          }
        }

        // Update the remote device indicator (green bubble)
        if (store.setRemoteDevice) {
          store.setRemoteDevice({
            deviceId: (payload.deviceId as string) ?? null,
            deviceName: (payload.deviceName as string) ?? null,
            isPlaying: remoteIsPlaying,
            songName: currentSong?.title || currentSong?.name || null,
            artist: currentSong?.artist || null,
            currentPositionMs: (payload.currentPositionMs as number) ?? undefined,
            durationMs: currentSong?.duration ? currentSong.duration * 1000 : undefined,
            updatedAt: Date.now(),
          });
        }

        // Also apply the full state to the main PlayerBar (queue, position, etc.)
        // so the desktop shows the same song the mobile is playing
        if (store.applyServerState && payload.queue) {
          store.applyServerState({
            queue: payload.queue as PlaybackStateResponse['queue'],
            originalQueue: (payload.originalQueue ?? payload.queue) as PlaybackStateResponse['originalQueue'],
            currentIndex: (payload.currentIndex as number) ?? 0,
            currentPositionMs: (payload.currentPositionMs as number) ?? 0,
            isPlaying: remoteIsPlaying,
            volume: (payload.volume as number) ?? store.volume,
            isShuffled: (payload.isShuffled as boolean) ?? false,
            activeDevice: {
              id: (payload.deviceId as string) ?? null,
              name: (payload.deviceName as string) ?? null,
              type: null,
            },
            queueUpdatedAt: (payload.queueUpdatedAt as string) ?? '',
            positionUpdatedAt: (payload.positionUpdatedAt as string) ?? '',
            playStateUpdatedAt: (payload.playStateUpdatedAt as string) ?? '',
            updatedAt: new Date().toISOString(),
          });
        }
      } finally {
        applyingRemoteState = false;
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

    case 'feedback_update': {
      // Another device liked/unliked a song — dispatch a custom event
      // so React Query caches can be invalidated
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('playback-feedback-update', {
          detail: msg.payload,
        }));
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
        // Going to background — only sync if this device is actively playing.
        // A paused device shouldn't overwrite the active player's state on the server.
        if (useAudioStore.getState().isPlaying) {
          debouncedSync.flush();
          pushStateToServer();
        }
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
    _wsRef = ws;

    // 3. Fetch server state on mount
    fetchAndReconcileState();

    // 4. Subscribe to audio store changes — only sync when meaningful state changes
    // Initialize prevState so the first subscription fire (from Zustand rehydration)
    // doesn't look like a change and stamp a fresh timestamp that blocks server state
    const initialState = useAudioStore.getState();
    prevStateRef.current = {
      playlistLength: initialState.playlist.length,
      currentSongIndex: initialState.currentSongIndex,
      isPlaying: initialState.isPlaying,
      volume: initialState.volume,
      isShuffled: initialState.isShuffled,
    };

    const unsub = useAudioStore.subscribe((state) => {
      // Skip if we're applying state received from a remote device
      // to avoid ping-pong re-broadcasting. Still update prevState
      // so we don't detect a phantom change on the next real update.
      if (applyingRemoteState) {
        prevStateRef.current = {
          playlistLength: state.playlist.length,
          currentSongIndex: state.currentSongIndex,
          isPlaying: state.isPlaying,
          volume: state.volume,
          isShuffled: state.isShuffled,
        };
        return;
      }

      const prev = prevStateRef.current;
      if (!prev) return; // Not yet initialized
      const queueChanged = prev.playlistLength !== state.playlist.length
        || prev.currentSongIndex !== state.currentSongIndex
        || prev.isShuffled !== state.isShuffled;
      const playStateChanged = prev.isPlaying !== state.isPlaying;
      const volumeChanged = prev.volume !== state.volume;

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

      if (playStateChanged) {
        // Play state changes broadcast immediately (no debounce) so the
        // remote device pauses/resumes without a perceptible delay.
        broadcastStateViaWS(wsRef.current);
        pushStateToServer();
      } else if (queueChanged || volumeChanged) {
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
      _wsRef = null;
    };
  }, [deviceInfo]);
}
