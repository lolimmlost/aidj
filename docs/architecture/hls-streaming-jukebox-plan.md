# HLS Streaming & Jukebox Architecture Plan

**Date:** 2026-01-21
**Updated:** 2026-02-08
**Context:** Implement resilient audio streaming with automatic network recovery and Spotify Connect-like jukebox functionality
**Framework:** React + TanStack Start (Zustand for state management)

---

## Problem Statement

### Current Issues

1. **Network Transitions Break Streams**
   - Switching from LTE to WiFi (or vice versa) breaks the HTTP connection
   - Brief network dropouts cause stream failures
   - Current recovery requires user to tap play again

2. **Direct MP3 Streaming Limitations**
   - Single HTTP connection for entire file
   - No built-in retry for partial failures
   - Seek operations can fail if connection is unstable

3. **No Cross-Device Control**
   - Can't control playback from another device
   - No "jukebox mode" for party scenarios
   - Queue is device-specific

### Current Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌────────────┐
│   Browser   │────▶│  /api/stream/$id │────▶│  Navidrome │
│   <audio>   │     │   (HTTP proxy)   │     │  (source)  │
└─────────────┘     └─────────────────┘     └────────────┘
       │
       └── Single HTTP connection
           - Breaks on network change
           - No segment retry
           - Connection-level recovery only
```

---

## Solution: HLS + Server-Side Playback State

### Why HLS (HTTP Live Streaming)?

| Feature | MP3 Direct | HLS |
|---------|-----------|-----|
| Segment-based | No | Yes (2-10s chunks) |
| Individual retry | No | Yes (per segment) |
| Adaptive bitrate | No | Yes (quality switching) |
| Network recovery | Poor | Excellent |
| Cache-friendly | Poor | Excellent (CDN/proxy) |
| Browser support | Native | hls.js (95%+ browsers) |

### Architecture Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                           │
├───────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐     ┌─────────────┐     ┌──────────────────┐    │
│  │   hls.js    │────▶│   <video>   │     │  WebSocket       │    │
│  │   player    │     │  (audio)    │     │  /ws/playback    │    │
│  └─────────────┘     └─────────────┘     └──────────────────┘    │
│        │                                          │               │
│        │ Fetch segments                          │ Control msgs  │
│        ▼                                          ▼               │
└────────┼──────────────────────────────────────────┼───────────────┘
         │                                          │
         ▼                                          ▼
┌────────────────────────────────────────────────────────────────────┐
│                         SERVER (Node.js)                           │
├────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐     ┌──────────────────────────────────┐ │
│  │  HLS Segment Server │     │   Playback Session Manager       │ │
│  │  /api/hls/$id/      │     │   - Queue state                  │ │
│  │  ├── stream.m3u8    │     │   - Current position             │ │
│  │  ├── seg-000.ts     │     │   - Active device                │ │
│  │  ├── seg-001.ts     │     │   - WebSocket broadcast          │ │
│  │  └── ...            │     └──────────────────────────────────┘ │
│  └─────────────────────┘                                          │
│           │                                                        │
│           │ On-demand transcoding                                  │
│           ▼                                                        │
│  ┌─────────────────────┐     ┌──────────────────────────────────┐ │
│  │       FFmpeg        │◀────│        Navidrome                 │ │
│  │   (segmenter)       │     │    /rest/stream (source)         │ │
│  └─────────────────────┘     └──────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: HLS Streaming Proxy

### 1.1 FFmpeg Segmenter Service

**File**: `src/lib/services/hls-segmenter.ts`

```typescript
import { spawn, ChildProcess } from 'child_process';
import { mkdir, rm, readFile, readdir, stat } from 'fs/promises';
import path from 'path';

interface SegmenterSession {
  songId: string;
  process: ChildProcess | null;
  outputDir: string;
  segmentCount: number;
  duration: number;
  isComplete: boolean;
  lastAccess: number;
  error?: string;
}

// In-memory session cache (could be Redis for multi-server)
const sessions = new Map<string, SegmenterSession>();

// Cleanup old sessions every 5 minutes
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const SEGMENT_DURATION = 4; // seconds per segment

// Codecs that can be copied directly without re-encoding
const HLS_COMPATIBLE_CODECS = ['aac', 'mp3'];

interface StreamInfo {
  codec: string;
  contentType: string;
}

// Probe stream to determine if we can skip transcoding
async function probeStream(url: string): Promise<StreamInfo | null> {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 'a:0',
      url,
    ]);

    let output = '';
    ffprobe.stdout?.on('data', (data) => { output += data.toString(); });
    ffprobe.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        const info = JSON.parse(output);
        const stream = info.streams?.[0];
        resolve(stream ? { codec: stream.codec_name, contentType: '' } : null);
      } catch {
        resolve(null);
      }
    });
    ffprobe.on('error', () => resolve(null));
  });
}

export async function getOrCreateHLSSession(
  songId: string,
  navidromeStreamUrl: string
): Promise<SegmenterSession> {
  // Check if session exists and is still valid
  const existing = sessions.get(songId);
  if (existing) {
    existing.lastAccess = Date.now();
    return existing;
  }

  // Create output directory
  const outputDir = path.join('/tmp/hls-cache', songId);
  await mkdir(outputDir, { recursive: true });

  const session: SegmenterSession = {
    songId,
    process: null,
    outputDir,
    segmentCount: 0,
    duration: 0,
    isComplete: false,
    lastAccess: Date.now(),
  };

  sessions.set(songId, session);

  // Probe stream to check if we can skip transcoding
  const streamInfo = await probeStream(navidromeStreamUrl);
  const canCopyCodec = streamInfo && HLS_COMPATIBLE_CODECS.includes(streamInfo.codec);

  // Build FFmpeg arguments
  // If source is already AAC/MP3, copy without re-encoding (faster, no quality loss)
  const audioCodecArgs = canCopyCodec
    ? ['-c:a', 'copy']  // Just copy, no transcoding
    : ['-c:a', 'aac', '-b:a', '256k', '-ar', '44100', '-ac', '2'];

  console.log(`[HLS] Starting session for ${songId}, codec: ${streamInfo?.codec || 'unknown'}, copy: ${canCopyCodec}`);

  const ffmpeg = spawn('ffmpeg', [
    '-i', navidromeStreamUrl,
    ...audioCodecArgs,
    '-f', 'hls',
    '-hls_time', String(SEGMENT_DURATION),
    '-hls_list_size', '0',
    '-hls_segment_filename', path.join(outputDir, 'seg-%03d.ts'),
    '-hls_flags', 'append_list+omit_endlist',
    path.join(outputDir, 'stream.m3u8'),
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  session.process = ffmpeg;

  ffmpeg.stderr?.on('data', (data) => {
    const output = data.toString();
    // Parse duration
    const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    if (durationMatch) {
      const [, hours, mins, secs] = durationMatch;
      session.duration =
        parseInt(hours) * 3600 +
        parseInt(mins) * 60 +
        parseFloat(secs);
    }
    // Capture errors
    if (output.includes('Error') || output.includes('error')) {
      session.error = output;
    }
  });

  ffmpeg.on('close', (code) => {
    session.isComplete = true;
    session.process = null;
    if (code !== 0) {
      session.error = `FFmpeg exited with code ${code}`;
      console.error(`[HLS] Segmenting failed for ${songId}: ${session.error}`);
    } else {
      console.log(`[HLS] Segmenting complete for ${songId}`);
    }
  });

  ffmpeg.on('error', (err) => {
    session.error = err.message;
    session.isComplete = true;
    console.error(`[HLS] FFmpeg error for ${songId}:`, err);
  });

  return session;
}

export async function getPlaylist(songId: string): Promise<string | null> {
  const session = sessions.get(songId);
  if (!session) return null;

  const playlistPath = path.join(session.outputDir, 'stream.m3u8');

  try {
    return await readFile(playlistPath, 'utf-8');
  } catch {
    return null;
  }
}

export async function getSegment(
  songId: string,
  segmentName: string
): Promise<Buffer | null> {
  const session = sessions.get(songId);
  if (!session) return null;

  const segmentPath = path.join(session.outputDir, segmentName);

  try {
    return await readFile(segmentPath);
  } catch {
    return null;
  }
}

// Cleanup expired sessions
setInterval(async () => {
  const now = Date.now();
  for (const [songId, session] of sessions) {
    if (now - session.lastAccess > SESSION_TIMEOUT_MS) {
      console.log(`[HLS] Cleaning up expired session: ${songId}`);
      if (session.process) {
        session.process.kill();
      }
      await rm(session.outputDir, { recursive: true, force: true });
      sessions.delete(songId);
    }
  }
}, 60 * 1000);
```

### 1.2 HLS API Routes

**File**: `src/routes/api/hls/$id/stream.m3u8.ts`

```typescript
import type { APIEvent } from '@solidjs/start/server';
import { getOrCreateHLSSession, getPlaylist } from '@/lib/services/hls-segmenter';
import { buildNavidromeStreamUrl } from '@/lib/services/navidrome';

export async function GET({ params }: APIEvent) {
  const { id: songId } = params;

  // Build Navidrome stream URL
  const navidromeUrl = await buildNavidromeStreamUrl(songId);

  // Get or create HLS session
  await getOrCreateHLSSession(songId, navidromeUrl);

  // Wait for playlist to be available (FFmpeg needs time to start)
  let playlist: string | null = null;
  for (let i = 0; i < 20; i++) {
    playlist = await getPlaylist(songId);
    if (playlist) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  if (!playlist) {
    return new Response('HLS stream not ready', { status: 503 });
  }

  return new Response(playlist, {
    headers: {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
    },
  });
}
```

**File**: `src/routes/api/hls/$id/$segment.ts`

```typescript
import type { APIEvent } from '@solidjs/start/server';
import { getSegment } from '@/lib/services/hls-segmenter';

export async function GET({ params }: APIEvent) {
  const { id: songId, segment } = params;

  const data = await getSegment(songId, segment);

  if (!data) {
    return new Response('Segment not found', { status: 404 });
  }

  return new Response(data, {
    headers: {
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'max-age=31536000', // Segments are immutable
    },
  });
}
```

### 1.3 Client-Side HLS Player

**File**: `src/lib/services/hls-player.ts`

```typescript
import Hls, { HlsConfig, Events, ErrorTypes } from 'hls.js';

export interface HLSPlayerConfig {
  onError?: (error: Error) => void;
  onRecovering?: () => void;
  onRecovered?: () => void;
  onBuffering?: (isBuffering: boolean) => void;
}

// Optimized hls.js config for network resilience
const HLS_CONFIG: Partial<HlsConfig> = {
  // Aggressive retry policy
  fragLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 10000,
      maxLoadTimeMs: 30000,
      timeoutRetry: {
        maxNumRetry: 8,
        retryDelayMs: 500,
        maxRetryDelayMs: 8000,
      },
      errorRetry: {
        maxNumRetry: 8,
        retryDelayMs: 500,
        maxRetryDelayMs: 8000,
        shouldRetry: () => true,
      },
    },
  },

  // Playlist loading (m3u8)
  manifestLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 10000,
      maxLoadTimeMs: 30000,
      timeoutRetry: {
        maxNumRetry: 5,
        retryDelayMs: 1000,
        maxRetryDelayMs: 8000,
      },
      errorRetry: {
        maxNumRetry: 5,
        retryDelayMs: 1000,
        maxRetryDelayMs: 8000,
        shouldRetry: () => true,
      },
    },
  },

  // Keep more buffer for resilience
  maxBufferLength: 30, // seconds
  maxMaxBufferLength: 60,

  // Faster start
  startLevel: -1, // Auto-select

  // Low latency settings
  lowLatencyMode: false, // Not needed for music
  backBufferLength: 30, // Keep 30s of played content

  // Enable FPS drop detection (helps with mobile)
  enableWorker: true,
};

export function createHLSPlayer(
  audioElement: HTMLAudioElement,
  config?: HLSPlayerConfig
): Hls | null {
  if (!Hls.isSupported()) {
    console.warn('[HLS] Not supported, falling back to native');
    return null;
  }

  const hls = new Hls(HLS_CONFIG);

  // Network error handling with recovery
  hls.on(Events.ERROR, (event, data) => {
    if (data.fatal) {
      switch (data.type) {
        case ErrorTypes.NETWORK_ERROR:
          console.warn('[HLS] Network error, attempting recovery...');
          config?.onRecovering?.();
          hls.startLoad();
          break;
        case ErrorTypes.MEDIA_ERROR:
          console.warn('[HLS] Media error, attempting recovery...');
          config?.onRecovering?.();
          hls.recoverMediaError();
          break;
        default:
          console.error('[HLS] Fatal error, cannot recover:', data);
          config?.onError?.(new Error(`HLS Fatal: ${data.type}`));
          hls.destroy();
          break;
      }
    } else {
      console.debug('[HLS] Non-fatal error:', data);
    }
  });

  // Recovery success
  hls.on(Events.FRAG_LOADED, () => {
    config?.onRecovered?.();
  });

  // Buffering state
  hls.on(Events.FRAG_BUFFERED, () => {
    config?.onBuffering?.(false);
  });

  hls.on(Events.FRAG_LOADING, () => {
    config?.onBuffering?.(true);
  });

  hls.attachMedia(audioElement);

  return hls;
}

export function loadHLSStream(hls: Hls, songId: string) {
  const streamUrl = `/api/hls/${songId}/stream.m3u8`;
  hls.loadSource(streamUrl);
}
```

### 1.4 Audio Player Integration (React)

**File**: `src/lib/hooks/useHLSAudio.ts`

```typescript
import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import Hls from 'hls.js';
import { createHLSPlayer, loadHLSStream } from '@/lib/services/hls-player';
import type { Song } from '@/lib/types/song';

// React hook to use HLS when available, fallback to direct stream
export function useHLSAudio(audioRef: RefObject<HTMLAudioElement | null>) {
  const hlsRef = useRef<Hls | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadSong = useCallback((song: Song) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Destroy previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setError(null);

    // Try HLS first
    if (Hls.isSupported()) {
      hlsRef.current = createHLSPlayer(audio, {
        onRecovering: () => setIsRecovering(true),
        onRecovered: () => setIsRecovering(false),
        onError: (err) => {
          console.error('[HLS] Falling back to direct stream:', err);
          setError(err);
          // Fallback to direct stream on HLS failure
          audio.src = song.url;
        },
      });

      if (hlsRef.current) {
        loadHLSStream(hlsRef.current, song.id);
        return;
      }
    }

    // Native HLS (Safari) or fallback
    if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      audio.src = `/api/hls/${song.id}/stream.m3u8`;
    } else {
      // Direct MP3 fallback
      audio.src = song.url;
    }
  }, [audioRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  return {
    loadSong,
    isRecovering,
    error,
    hls: hlsRef,
  };
}
```

---

## Phase 2: Server-Side Playback State (Jukebox)

### 2.1 Database Schema

**File**: `src/lib/db/schema/playback.schema.ts`

```typescript
import { pgTable, text, integer, real, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

// Playback sessions - one per user
export const playbackSessions = pgTable('playback_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Active device
  activeDeviceId: text('active_device_id'),
  activeDeviceName: text('active_device_name'),
  activeDeviceType: text('active_device_type'), // 'mobile', 'desktop', 'tablet'

  // Queue state
  queue: jsonb('queue').$type<QueueItem[]>().notNull().default([]),
  originalQueue: jsonb('original_queue').$type<QueueItem[]>().default([]),
  currentIndex: integer('current_index').notNull().default(0),

  // Playback state
  currentPositionMs: integer('current_position_ms').default(0),
  isPlaying: boolean('is_playing').default(false),
  volume: real('volume').default(0.5),
  isShuffled: boolean('is_shuffled').default(false),

  // Settings
  crossfadeEnabled: boolean('crossfade_enabled').default(true),
  crossfadeDuration: real('crossfade_duration').default(8),
  aiDJEnabled: boolean('ai_dj_enabled').default(false),

  // Timestamps
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deviceLastSeenAt: timestamp('device_last_seen_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('playback_sessions_user_id_idx').on(table.userId),
}));

// Device registry
export const devices = pgTable('devices', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceName: text('device_name').notNull(),
  deviceType: text('device_type').notNull(), // 'mobile', 'desktop', 'tablet'
  userAgent: text('user_agent'),
  lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('devices_user_id_idx').on(table.userId),
}));

// Type for queue items stored in JSONB
interface QueueItem {
  id: string;
  name?: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  url: string;
  albumId?: string;
  genre?: string;
}
```

### 2.2 Playback Session Manager

**File**: `src/lib/services/playback-session.ts`

```typescript
import { db } from '@/lib/db';
import { playbackSessions, devices } from '@/lib/db/schema/playback.schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Song } from '@/lib/types/song';

export interface PlaybackState {
  queue: Song[];
  originalQueue: Song[];
  currentIndex: number;
  currentPositionMs: number;
  isPlaying: boolean;
  volume: number;
  isShuffled: boolean;
  activeDevice: {
    id: string;
    name: string;
    type: string;
  } | null;
  updatedAt: Date;
}

export interface PlaybackUpdate {
  queue?: Song[];
  originalQueue?: Song[];
  currentIndex?: number;
  currentPositionMs?: number;
  isPlaying?: boolean;
  volume?: number;
  isShuffled?: boolean;
  deviceId: string;
  deviceName: string;
  deviceType: string;
}

// Get or create session for user
export async function getPlaybackSession(userId: string): Promise<PlaybackState> {
  let session = await db.query.playbackSessions.findFirst({
    where: eq(playbackSessions.userId, userId),
  });

  if (!session) {
    // Create new session
    const id = nanoid();
    await db.insert(playbackSessions).values({
      id,
      userId,
    });
    session = await db.query.playbackSessions.findFirst({
      where: eq(playbackSessions.userId, userId),
    });
  }

  return {
    queue: (session?.queue || []) as Song[],
    originalQueue: (session?.originalQueue || []) as Song[],
    currentIndex: session?.currentIndex ?? 0,
    currentPositionMs: session?.currentPositionMs ?? 0,
    isPlaying: session?.isPlaying ?? false,
    volume: session?.volume ?? 0.5,
    isShuffled: session?.isShuffled ?? false,
    activeDevice: session?.activeDeviceId ? {
      id: session.activeDeviceId,
      name: session.activeDeviceName || 'Unknown',
      type: session.activeDeviceType || 'unknown',
    } : null,
    updatedAt: session?.updatedAt ?? new Date(),
  };
}

// Update session state
export async function updatePlaybackSession(
  userId: string,
  update: PlaybackUpdate
): Promise<PlaybackState> {
  const { deviceId, deviceName, deviceType, ...stateUpdate } = update;

  await db.update(playbackSessions)
    .set({
      ...stateUpdate,
      activeDeviceId: deviceId,
      activeDeviceName: deviceName,
      activeDeviceType: deviceType,
      updatedAt: new Date(),
      deviceLastSeenAt: new Date(),
    })
    .where(eq(playbackSessions.userId, userId));

  // Register/update device
  await registerDevice(userId, deviceId, deviceName, deviceType);

  return getPlaybackSession(userId);
}

// Transfer playback to a different device
export async function transferPlayback(
  userId: string,
  targetDeviceId: string,
  play: boolean = true
): Promise<PlaybackState> {
  const device = await db.query.devices.findFirst({
    where: eq(devices.id, targetDeviceId),
  });

  if (!device) {
    throw new Error('Device not found');
  }

  await db.update(playbackSessions)
    .set({
      activeDeviceId: targetDeviceId,
      activeDeviceName: device.deviceName,
      activeDeviceType: device.deviceType,
      isPlaying: play,
      updatedAt: new Date(),
    })
    .where(eq(playbackSessions.userId, userId));

  return getPlaybackSession(userId);
}

// Device management
export async function registerDevice(
  userId: string,
  deviceId: string,
  deviceName: string,
  deviceType: string,
  userAgent?: string
) {
  await db.insert(devices)
    .values({
      id: deviceId,
      userId,
      deviceName,
      deviceType,
      userAgent,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: devices.id,
      set: {
        deviceName,
        deviceType,
        userAgent,
        lastSeenAt: new Date(),
      },
    });
}

export async function getUserDevices(userId: string) {
  return db.query.devices.findMany({
    where: eq(devices.userId, userId),
    orderBy: (devices, { desc }) => [desc(devices.lastSeenAt)],
  });
}
```

### 2.3 WebSocket Server for Real-Time Sync

**File**: `src/lib/services/playback-websocket.ts`

```typescript
import { WebSocket, WebSocketServer } from 'ws';
import { getSession } from '@/lib/auth/session';
import { getPlaybackSession, updatePlaybackSession, transferPlayback } from './playback-session';

// Connection registry by userId
const connections = new Map<string, Set<WebSocket>>();

// Message types
interface PlaybackMessage {
  type: 'state_update' | 'transfer' | 'command' | 'sync_request' | 'heartbeat';
  payload: any;
  deviceId: string;
}

interface PlaybackCommand {
  action: 'play' | 'pause' | 'next' | 'previous' | 'seek' | 'volume' | 'shuffle';
  value?: any;
}

export function setupPlaybackWebSocket(wss: WebSocketServer) {
  wss.on('connection', async (ws: WebSocket, request) => {
    // Authenticate
    const session = await getSession(request);
    if (!session?.userId) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const userId = session.userId;

    // Register connection
    if (!connections.has(userId)) {
      connections.set(userId, new Set());
    }
    connections.get(userId)!.add(ws);

    console.log(`[WS] User ${userId} connected, total: ${connections.get(userId)!.size}`);

    // Send current state on connect
    const state = await getPlaybackSession(userId);
    ws.send(JSON.stringify({ type: 'state', payload: state }));

    // Handle messages
    ws.on('message', async (data) => {
      try {
        const message: PlaybackMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'state_update':
            // Update state and broadcast to other devices
            const newState = await updatePlaybackSession(userId, {
              ...message.payload,
              deviceId: message.deviceId,
            });
            broadcastToUser(userId, ws, { type: 'state', payload: newState });
            break;

          case 'command':
            // Handle remote command (from another device)
            const command = message.payload as PlaybackCommand;
            handleCommand(userId, command, message.deviceId);
            break;

          case 'transfer':
            // Transfer playback to another device
            const { targetDeviceId, play } = message.payload;
            const transferred = await transferPlayback(userId, targetDeviceId, play);
            broadcastToAllDevices(userId, { type: 'transfer', payload: transferred });
            break;

          case 'sync_request':
            // Device requesting current state
            const currentState = await getPlaybackSession(userId);
            ws.send(JSON.stringify({ type: 'state', payload: currentState }));
            break;

          case 'heartbeat':
            // Keep connection alive
            ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
            break;
        }
      } catch (err) {
        console.error('[WS] Message error:', err);
      }
    });

    ws.on('close', () => {
      connections.get(userId)?.delete(ws);
      console.log(`[WS] User ${userId} disconnected`);
    });
  });
}

// Broadcast to all devices except sender
function broadcastToUser(userId: string, sender: WebSocket, message: any) {
  const userConnections = connections.get(userId);
  if (!userConnections) return;

  const data = JSON.stringify(message);
  for (const ws of userConnections) {
    if (ws !== sender && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

// Broadcast to all devices including sender
function broadcastToAllDevices(userId: string, message: any) {
  const userConnections = connections.get(userId);
  if (!userConnections) return;

  const data = JSON.stringify(message);
  for (const ws of userConnections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

// Handle remote commands
async function handleCommand(
  userId: string,
  command: PlaybackCommand,
  fromDeviceId: string
) {
  const state = await getPlaybackSession(userId);

  // Only allow commands if they're for the active device
  // or if there's no active device
  if (state.activeDevice && state.activeDevice.id !== fromDeviceId) {
    // This is a remote control command
    broadcastToAllDevices(userId, {
      type: 'remote_command',
      payload: command,
      fromDevice: fromDeviceId,
    });
  }
}
```

### 2.4 REST API Endpoints

**File**: `src/routes/api/playback/state.ts`

```typescript
import type { APIEvent } from '@solidjs/start/server';
import { getSession } from '@/lib/auth/session';
import { getPlaybackSession, updatePlaybackSession } from '@/lib/services/playback-session';

export async function GET(event: APIEvent) {
  const session = await getSession(event.request);
  if (!session?.userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const state = await getPlaybackSession(session.userId);
  return new Response(JSON.stringify(state), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(event: APIEvent) {
  const session = await getSession(event.request);
  if (!session?.userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await event.request.json();
  const state = await updatePlaybackSession(session.userId, body);

  return new Response(JSON.stringify(state), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**File**: `src/routes/api/playback/transfer.ts`

```typescript
import type { APIEvent } from '@solidjs/start/server';
import { getSession } from '@/lib/auth/session';
import { transferPlayback } from '@/lib/services/playback-session';

export async function POST(event: APIEvent) {
  const session = await getSession(event.request);
  if (!session?.userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { deviceId, play } = await event.request.json();
  const state = await transferPlayback(session.userId, deviceId, play ?? true);

  return new Response(JSON.stringify(state), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**File**: `src/routes/api/playback/devices.ts`

```typescript
import type { APIEvent } from '@solidjs/start/server';
import { getSession } from '@/lib/auth/session';
import { getUserDevices } from '@/lib/services/playback-session';

export async function GET(event: APIEvent) {
  const session = await getSession(event.request);
  if (!session?.userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const devices = await getUserDevices(session.userId);
  return new Response(JSON.stringify(devices), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

---

## Phase 3: Client Integration

### 3.1 Playback Sync Hook (React)

**File**: `src/lib/hooks/usePlaybackSync.ts`

```typescript
import { useState, useRef, useCallback, useEffect } from 'react';
import { useAudioStore } from '@/lib/stores/audio';
import { getDeviceId, getDeviceName, getDeviceType } from '@/lib/utils/device';
import { createReconnectingWebSocket } from '@/lib/utils/websocket';

interface UsePlaybackSyncOptions {
  enabled?: boolean;
  syncInterval?: number; // ms
}

export function usePlaybackSync(options: UsePlaybackSyncOptions = {}) {
  const { enabled = true, syncInterval = 5000 } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [remoteDevice, setRemoteDevice] = useState<{ id: string; name: string } | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Get device info once
  const deviceId = useRef(getDeviceId()).current;
  const deviceName = useRef(getDeviceName()).current;
  const deviceType = useRef(getDeviceType()).current;

  // Sync current state to server
  const syncToServer = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const state = useAudioStore.getState();
    ws.send(JSON.stringify({
      type: 'state_update',
      deviceId,
      payload: {
        queue: state.playlist,
        currentIndex: state.currentSongIndex,
        currentPositionMs: Math.round(state.currentTime * 1000),
        isPlaying: state.isPlaying,
        volume: state.volume,
        isShuffled: state.isShuffled,
        deviceId,
        deviceName,
        deviceType,
      },
    }));
  }, [deviceId, deviceName, deviceType]);

  // Handle state update from another device
  const handleRemoteState = useCallback((state: any) => {
    // Only update if from a different device
    if (state.activeDevice?.id === deviceId) return;

    console.log('[Sync] Received remote state update');

    // Update Zustand store (batched internally by Zustand)
    const store = useAudioStore.getState();
    if (state.queue) store.setPlaylist(state.queue);
    if (typeof state.currentIndex === 'number') {
      useAudioStore.setState({ currentSongIndex: state.currentIndex });
    }
    if (typeof state.isPlaying === 'boolean') store.setIsPlaying(state.isPlaying);
    if (typeof state.volume === 'number') store.setVolume(state.volume);
    if (typeof state.isShuffled === 'boolean') {
      useAudioStore.setState({ isShuffled: state.isShuffled });
    }

    // Track which device is active
    if (state.activeDevice && state.activeDevice.id !== deviceId) {
      setRemoteDevice({ id: state.activeDevice.id, name: state.activeDevice.name });
    }
  }, [deviceId]);

  // Handle playback transfer
  const handleTransfer = useCallback((state: any) => {
    if (state.activeDevice?.id === deviceId) {
      // Playback transferred TO this device
      console.log('[Sync] Playback transferred to this device');
      setRemoteDevice(null);
      handleRemoteState(state);
    } else {
      // Playback transferred AWAY from this device
      console.log('[Sync] Playback transferred to another device');
      useAudioStore.getState().setIsPlaying(false);
      setRemoteDevice({
        id: state.activeDevice?.id,
        name: state.activeDevice?.name || 'Another device',
      });
    }
  }, [deviceId, handleRemoteState]);

  // Handle remote control command
  const handleRemoteCommand = useCallback((command: any) => {
    console.log('[Sync] Remote command:', command);
    const store = useAudioStore.getState();

    switch (command.action) {
      case 'play':
        store.setIsPlaying(true);
        break;
      case 'pause':
        store.setIsPlaying(false);
        break;
      case 'next':
        store.nextSong();
        break;
      case 'previous':
        store.previousSong();
        break;
      case 'seek':
        store.setCurrentTime(command.value / 1000);
        break;
      case 'volume':
        store.setVolume(command.value);
        break;
      case 'shuffle':
        store.toggleShuffle();
        break;
    }
  }, []);

  // Connect effect
  useEffect(() => {
    if (!enabled) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsRef.current = createReconnectingWebSocket(
      `${protocol}//${window.location.host}/ws/playback`,
      {
        maxRetries: 10,
        retryDelayMs: 1000,
        maxRetryDelayMs: 30000,
        onOpen: () => {
          console.log('[Sync] WebSocket connected');
          setIsConnected(true);
          setConnectionError(null);
          wsRef.current?.send(JSON.stringify({ type: 'sync_request', deviceId }));
        },
        onClose: () => {
          console.log('[Sync] WebSocket disconnected');
          setIsConnected(false);
        },
        onError: () => {
          setConnectionError('Connection failed');
        },
        onMessage: (event) => {
          try {
            const message = JSON.parse(event.data);

            switch (message.type) {
              case 'state':
                handleRemoteState(message.payload);
                break;
              case 'transfer':
                handleTransfer(message.payload);
                break;
              case 'remote_command':
                handleRemoteCommand(message.payload);
                break;
            }
          } catch (err) {
            console.error('[Sync] Failed to parse message:', err);
          }
        },
      }
    );

    // Heartbeat every 30s
    heartbeatRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'heartbeat', deviceId }));
      }
    }, 30000);

    // Periodic sync
    syncIntervalRef.current = setInterval(syncToServer, syncInterval);

    // Visibility change handler
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        syncToServer();
      } else {
        wsRef.current?.send(JSON.stringify({ type: 'sync_request', deviceId }));
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      wsRef.current?.close();
    };
  }, [enabled, syncInterval, deviceId, handleRemoteState, handleTransfer, handleRemoteCommand, syncToServer]);

  // Public API
  const sendCommand = useCallback((command: { action: string; value?: any }) => {
    wsRef.current?.send(JSON.stringify({
      type: 'command',
      deviceId,
      payload: command,
    }));
  }, [deviceId]);

  const transferTo = useCallback((targetDeviceId: string, play: boolean = true) => {
    wsRef.current?.send(JSON.stringify({
      type: 'transfer',
      deviceId,
      payload: { targetDeviceId, play },
    }));
  }, [deviceId]);

  const takeControl = useCallback(() => {
    transferTo(deviceId, useAudioStore.getState().isPlaying);
  }, [deviceId, transferTo]);

  return {
    sendCommand,
    transferTo,
    takeControl,
    isConnected,
    remoteDevice,
    connectionError,
    syncNow: syncToServer,
  };
}
```

### 3.2 Reconnecting WebSocket Utility

**File**: `src/lib/utils/websocket.ts`

```typescript
interface ReconnectingWSOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (event: MessageEvent) => void;
}

export function createReconnectingWebSocket(
  url: string,
  options: ReconnectingWSOptions = {}
): WebSocket {
  const {
    maxRetries = 10,
    retryDelayMs = 1000,
    maxRetryDelayMs = 30000,
    onOpen,
    onClose,
    onError,
    onMessage,
  } = options;

  let ws: WebSocket;
  let retryCount = 0;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let isDestroyed = false;

  const connect = () => {
    if (isDestroyed) return;

    ws = new WebSocket(url);

    ws.onopen = () => {
      retryCount = 0; // Reset on successful connection
      onOpen?.();
    };

    ws.onclose = () => {
      onClose?.();

      if (isDestroyed) return;

      // Exponential backoff with jitter
      if (retryCount < maxRetries) {
        const delay = Math.min(
          retryDelayMs * Math.pow(2, retryCount) + Math.random() * 1000,
          maxRetryDelayMs
        );
        retryCount++;
        console.log(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${retryCount}/${maxRetries})`);
        retryTimeout = setTimeout(connect, delay);
      } else {
        console.error('[WS] Max retries exceeded');
      }
    };

    ws.onerror = (event) => {
      onError?.(event);
    };

    ws.onmessage = (event) => {
      onMessage?.(event);
    };
  };

  connect();

  // Return a proxy that wraps the WebSocket
  // This allows us to swap the underlying connection on reconnect
  return new Proxy({} as WebSocket, {
    get(_, prop) {
      if (prop === 'close') {
        return () => {
          isDestroyed = true;
          if (retryTimeout) clearTimeout(retryTimeout);
          ws?.close();
        };
      }
      return (ws as any)[prop];
    },
  });
}
```

### 3.3 Device Selector Component (React)

**File**: `src/components/device-selector.tsx`

```typescript
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Smartphone, Tablet, Wifi } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { usePlaybackSync } from '@/lib/hooks/usePlaybackSync';
import { getDeviceId } from '@/lib/utils/device';

const deviceIcons = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
} as const;

export function DeviceSelector() {
  const { transferTo, remoteDevice, takeControl } = usePlaybackSync();
  const currentDeviceId = useMemo(() => getDeviceId(), []);

  const { data: devices } = useQuery({
    queryKey: ['playback', 'devices'],
    queryFn: async () => {
      const res = await fetch('/api/playback/devices');
      if (!res.ok) throw new Error('Failed to fetch devices');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: state } = useQuery({
    queryKey: ['playback', 'state'],
    queryFn: async () => {
      const res = await fetch('/api/playback/state');
      if (!res.ok) throw new Error('Failed to fetch state');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const activeDevice = state?.activeDevice;
  const isThisDeviceActive = activeDevice?.id === currentDeviceId;

  return (
    <>
      {/* "Playing on another device" banner */}
      {remoteDevice && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-md text-sm">
          <Wifi className="h-4 w-4" />
          <span>Playing on {remoteDevice.name}</span>
          <Button size="sm" variant="ghost" onClick={takeControl}>
            Play here
          </Button>
        </div>
      )}

      {/* Device selector dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Wifi className="h-4 w-4" />
            {isThisDeviceActive ? 'This Device' : activeDevice?.name || 'Select Device'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {devices?.map((device: any) => {
            const Icon = deviceIcons[device.deviceType as keyof typeof deviceIcons] || Monitor;
            const isActive = device.id === activeDevice?.id;
            const isThis = device.id === currentDeviceId;

            return (
              <DropdownMenuItem
                key={device.id}
                onClick={() => transferTo(device.id)}
                className={isActive ? 'bg-primary/10' : ''}
              >
                <Icon className="h-4 w-4 mr-2" />
                {device.deviceName}
                {isThis && ' (This device)'}
                {isActive && !isThis && ' (Playing)'}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
```

---

## Phase 4: Feature Flags & Migration

### 4.1 Feature Flags

**File**: `src/lib/config/features.ts`

```typescript
export const features = {
  // HLS streaming (Phase 1)
  hlsStreaming: {
    enabled: process.env.FEATURE_HLS_STREAMING === 'true',
    fallbackOnError: true, // Fall back to direct stream on HLS errors
  },

  // Server-side playback state (Phase 2)
  serverPlaybackState: {
    enabled: process.env.FEATURE_SERVER_PLAYBACK === 'true',
    syncInterval: 5000, // ms
  },

  // Device management / jukebox (Phase 3)
  jukeboxMode: {
    enabled: process.env.FEATURE_JUKEBOX === 'true',
    allowMultipleDevices: true,
  },
};
```

### 4.2 Database Migration

**File**: `drizzle/0017_playback-sessions.sql`

```sql
-- Playback sessions table
CREATE TABLE "playback_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "active_device_id" text,
  "active_device_name" text,
  "active_device_type" text,
  "queue" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "original_queue" jsonb DEFAULT '[]'::jsonb,
  "current_index" integer DEFAULT 0 NOT NULL,
  "current_position_ms" integer DEFAULT 0,
  "is_playing" boolean DEFAULT false,
  "volume" real DEFAULT 0.5,
  "is_shuffled" boolean DEFAULT false,
  "crossfade_enabled" boolean DEFAULT true,
  "crossfade_duration" real DEFAULT 8,
  "ai_dj_enabled" boolean DEFAULT false,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "device_last_seen_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "playback_sessions_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);

--> statement-breakpoint
CREATE INDEX "playback_sessions_user_id_idx" ON "playback_sessions" USING btree ("user_id");

--> statement-breakpoint
-- Devices table
CREATE TABLE "devices" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "device_name" text NOT NULL,
  "device_type" text NOT NULL,
  "user_agent" text,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "devices_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);

--> statement-breakpoint
CREATE INDEX "devices_user_id_idx" ON "devices" USING btree ("user_id");
```

---

## Phase 5: WebSocket Server Setup

SolidStart doesn't have built-in WebSocket support. We need to set up a separate WebSocket server or use a plugin.

### 5.1 WebSocket Server (Separate Process)

**File**: `src/lib/server/websocket-server.ts`

```typescript
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { setupPlaybackWebSocket } from '@/lib/services/playback-websocket';

const PORT = parseInt(process.env.WS_PORT || '3001');

export function startWebSocketServer() {
  const server = createServer();
  const wss = new WebSocketServer({ server });

  setupPlaybackWebSocket(wss);

  server.listen(PORT, () => {
    console.log(`[WS] WebSocket server listening on port ${PORT}`);
  });

  return { server, wss };
}
```

### 5.2 Vite Plugin for Development

**File**: `vite-ws-plugin.ts`

```typescript
import type { Plugin, ViteDevServer } from 'vite';
import { WebSocketServer } from 'ws';
import { setupPlaybackWebSocket } from './src/lib/services/playback-websocket';

export function viteWebSocketPlugin(): Plugin {
  return {
    name: 'vite-ws-plugin',
    configureServer(server: ViteDevServer) {
      const wss = new WebSocketServer({ noServer: true });
      setupPlaybackWebSocket(wss);

      server.httpServer?.on('upgrade', (request, socket, head) => {
        if (request.url === '/ws/playback') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        }
      });
    },
  };
}
```

### 5.3 Production Setup Options

**Option A: Same Server (Recommended)**

Use a custom server entry that handles both HTTP and WebSocket:

```typescript
// server.ts (production entry)
import { createServer } from 'http';
import { handler } from './dist/server/entry-server.js';
import { WebSocketServer } from 'ws';
import { setupPlaybackWebSocket } from './src/lib/services/playback-websocket';

const server = createServer(handler);
const wss = new WebSocketServer({ noServer: true });

setupPlaybackWebSocket(wss);

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws/playback') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

server.listen(3000);
```

**Option B: Separate WebSocket Server**

Run WebSocket on a different port (easier for some hosting):

```bash
# Start both servers
node dist/server.js &       # Main app on :3000
node dist/ws-server.js &    # WebSocket on :3001
```

Client connects to `wss://your-domain.com:3001/ws/playback`

**Option C: Use Cloudflare Durable Objects**

For serverless deployments, use Cloudflare Durable Objects for WebSocket handling.

---

## Conflict Resolution Strategy

### Rules

When conflicts occur between devices, apply these rules in order:

```typescript
interface ConflictResolution {
  // Timestamp-based: most recent update wins
  timestampWins: true;

  // Active device priority: device currently playing has authority
  activeDevicePriority: true;

  // Merge strategy for specific fields
  mergeStrategies: {
    queue: 'last-write-wins';      // Full queue replacement
    currentIndex: 'last-write-wins';
    position: 'active-device-wins'; // Only active device updates position
    volume: 'device-local';         // Volume is per-device, not synced
    isPlaying: 'active-device-wins';
  };
}
```

### Implementation

**File**: `src/lib/services/conflict-resolver.ts`

```typescript
import type { PlaybackState, PlaybackUpdate } from './playback-session';

export interface ConflictContext {
  serverState: PlaybackState;
  incomingUpdate: PlaybackUpdate;
  isActiveDevice: boolean;
}

export function resolveConflict(ctx: ConflictContext): Partial<PlaybackUpdate> {
  const { serverState, incomingUpdate, isActiveDevice } = ctx;

  // If this is the active device, it has full authority
  if (isActiveDevice) {
    return incomingUpdate;
  }

  // Non-active device can only update certain fields
  const resolved: Partial<PlaybackUpdate> = {};

  // Queue changes: allowed from any device (e.g., adding songs from phone while desktop plays)
  if (incomingUpdate.queue) {
    resolved.queue = incomingUpdate.queue;
  }

  // Position updates: only from active device
  // (non-active device position is ignored)

  // Play/pause: only from active device (or explicitly taking control)
  if (incomingUpdate.isPlaying !== undefined && !isActiveDevice) {
    // This is a remote control command, broadcast instead of applying directly
    return { _remoteCommand: { action: incomingUpdate.isPlaying ? 'play' : 'pause' } } as any;
  }

  return resolved;
}

// Merge queue changes when both devices edited
export function mergeQueues(
  serverQueue: Song[],
  localQueue: Song[],
  baseQueue: Song[] // Queue at last sync point
): Song[] {
  // Simple strategy: last write wins
  // For more complex merge, could diff and apply additions/removals
  return localQueue;
}
```

### Offline Sync

When a device comes back online after being offline:

```typescript
async function syncAfterOffline(localState: PlaybackState) {
  const serverState = await fetch('/api/playback/state').then(r => r.json());

  // Compare timestamps
  const localTime = localState.updatedAt.getTime();
  const serverTime = new Date(serverState.updatedAt).getTime();

  if (localTime > serverTime) {
    // Local changes are newer, push to server
    await fetch('/api/playback/update', {
      method: 'POST',
      body: JSON.stringify(localState),
    });
  } else {
    // Server is newer, pull and apply
    applyServerState(serverState);
  }
}
```

---

## Queue Size Limits

### Enforcement

**File**: `src/lib/services/playback-session.ts` (add to updatePlaybackSession)

```typescript
const MAX_QUEUE_SIZE = 500;
const MAX_QUEUE_ITEM_SIZE = 2048; // bytes per item

export async function updatePlaybackSession(
  userId: string,
  update: PlaybackUpdate
): Promise<PlaybackState> {
  // Enforce queue size limit
  if (update.queue) {
    if (update.queue.length > MAX_QUEUE_SIZE) {
      console.warn(`[Playback] Queue exceeds ${MAX_QUEUE_SIZE} items, truncating`);
      update.queue = update.queue.slice(0, MAX_QUEUE_SIZE);
    }

    // Validate queue item size (prevent storing huge metadata)
    update.queue = update.queue.map(item => ({
      id: item.id,
      title: item.title?.slice(0, 200),
      artist: item.artist?.slice(0, 200),
      album: item.album?.slice(0, 200),
      duration: item.duration,
      url: item.url,
      albumId: item.albumId,
      genre: item.genre?.slice(0, 100),
    }));
  }

  // ... rest of update logic
}
```

### Client-Side Validation

```typescript
// In audio store
export function addToQueue(songs: Song[]) {
  const current = useAudioStore.getState().playlist;

  if (current.length + songs.length > MAX_QUEUE_SIZE) {
    const available = MAX_QUEUE_SIZE - current.length;
    if (available <= 0) {
      console.warn('Queue is full');
      return;
    }
    songs = songs.slice(0, available);
  }

  useAudioStore.setState({ playlist: [...current, ...songs] });
}
```

---

## Initial State Bootstrap

What happens when a user opens the app for the first time (no server session exists)?

### First-Time User Flow

```typescript
// In app initialization
async function initializePlayback() {
  try {
    const serverState = await fetch('/api/playback/state').then(r => r.json());

    if (serverState.queue.length === 0) {
      // New user with empty queue
      // Option 1: Show empty state with "Browse Library" CTA
      // Option 2: Auto-populate with recommendations
      // Option 3: Show onboarding

      // For now, just show empty state
      useAudioStore.setState({
        playlist: [],
        currentSongIndex: 0,
        isPlaying: false,
      });
    } else {
      // Existing session, restore state
      useAudioStore.setState({
        playlist: serverState.queue,
        currentSongIndex: serverState.currentIndex,
        isPlaying: false, // Don't auto-play on open
      });

      // If resuming, seek to last position
      if (serverState.currentPositionMs > 0) {
        const audio = getAudioElement();
        audio.currentTime = serverState.currentPositionMs / 1000;
      }
    }
  } catch (err) {
    // Offline or server error - use localStorage cache
    const cached = localStorage.getItem('playback_cache');
    if (cached) {
      const { queue, currentIndex } = JSON.parse(cached);
      useAudioStore.setState({ playlist: queue, currentSongIndex: currentIndex });
    }
  }
}
```

### Session Creation

The server automatically creates a session on first request:

```typescript
// In getPlaybackSession (already implemented)
if (!session) {
  const id = nanoid();
  await db.insert(playbackSessions).values({
    id,
    userId,
    queue: [],  // Empty queue for new users
  });
}
```

---

## Mobile-Specific Considerations

### Background Audio (PWA)

```typescript
// In audio initialization
function setupMediaSession() {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
      useAudioStore.getState().play();
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      useAudioStore.getState().pause();
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      useAudioStore.getState().previousSong();
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      useAudioStore.getState().nextSong();
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        useAudioStore.getState().setCurrentTime(details.seekTime);
      }
    });
  }
}

// Update metadata when song changes
function updateMediaSessionMetadata(song: Song) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album,
      artwork: song.albumArt ? [
        { src: song.albumArt, sizes: '512x512', type: 'image/jpeg' },
      ] : [],
    });
  }
}
```

### Battery-Aware Sync

```typescript
// Reduce sync frequency when on battery
function getSyncInterval(): number {
  const DEFAULT_INTERVAL = 5000;
  const BATTERY_SAVER_INTERVAL = 30000;

  if ('getBattery' in navigator) {
    navigator.getBattery().then((battery: any) => {
      if (!battery.charging && battery.level < 0.2) {
        return BATTERY_SAVER_INTERVAL;
      }
    });
  }

  return DEFAULT_INTERVAL;
}
```

### iOS Safari Quirks

```typescript
// iOS requires user interaction to play audio
function setupIOSAudioUnlock() {
  const audio = getAudioElement();

  const unlock = () => {
    // Create and play a silent buffer to unlock audio
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
    }).catch(() => {
      // Ignore - will retry on next interaction
    });

    document.removeEventListener('touchstart', unlock);
    document.removeEventListener('click', unlock);
  };

  document.addEventListener('touchstart', unlock, { once: true });
  document.addEventListener('click', unlock, { once: true });
}
```

### Service Worker for Offline Queue

```typescript
// In service-worker.ts
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'playback-sync') {
    event.waitUntil(syncPlaybackState());
  }
});

async function syncPlaybackState() {
  const cached = await caches.open('playback-cache');
  const pendingUpdates = await cached.match('/pending-updates');

  if (pendingUpdates) {
    const updates = await pendingUpdates.json();
    for (const update of updates) {
      await fetch('/api/playback/update', {
        method: 'POST',
        body: JSON.stringify(update),
      });
    }
    await cached.delete('/pending-updates');
  }
}
```

---

## Implementation Order

### Sprint 1: Foundation & Infrastructure
1. **WebSocket Server Setup**
   - Add Vite plugin for development
   - Create production server entry with WS upgrade handling
   - Test WebSocket connectivity
2. **Dependencies**
   - Install `hls.js`, `ws`
   - Verify FFmpeg available on server
   - Add `lucide-solid` for SolidJS icons

### Sprint 2: HLS Streaming (Network Recovery)
1. Create HLS segmenter service with codec detection
2. Create HLS API routes (`/api/hls/$id/stream.m3u8`, `/$segment.ts`)
3. Create `createHLSAudio` SolidJS hook
4. Add feature flag for gradual rollout
5. Test network recovery scenarios (LTE/WiFi switch)
6. Test codec copy vs transcode paths

### Sprint 3: Server-Side State
1. Create database schema and migration
2. Create playback session manager service
3. Add queue size limit enforcement
4. Create conflict resolver service
5. Create REST API endpoints
6. Add initial state bootstrap logic

### Sprint 4: Real-Time Sync
1. Create `createPlaybackSync` SolidJS hook
2. Create reconnecting WebSocket utility
3. Add visibility change handlers
4. Implement conflict resolution
5. Add offline sync support

### Sprint 5: Jukebox UI
1. Create DeviceSelector component (SolidJS)
2. Add "Playing on [Device]" banner
3. Add "Play here" take control button
4. Add remote control functionality
5. Test multi-device scenarios

### Sprint 6: Mobile & Polish
1. Add MediaSession API for lock screen controls
2. Add battery-aware sync frequency
3. Add iOS audio unlock handling
4. Add service worker for offline queue
5. Update PWA manifest

### Sprint 7: Testing & Cleanup
1. Write unit tests for conflict resolver
2. Write integration tests for WebSocket
3. Write E2E tests for cross-device scenarios
4. Performance testing (queue limits, sync frequency)
5. Documentation updates

---

## Testing Strategy

### Automated Tests

#### Unit Tests

**File**: `src/lib/services/__tests__/conflict-resolver.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { resolveConflict, mergeQueues } from '../conflict-resolver';

describe('ConflictResolver', () => {
  it('should allow active device full authority', () => {
    const result = resolveConflict({
      serverState: { queue: [], currentIndex: 0 },
      incomingUpdate: { queue: [song1], currentIndex: 1 },
      isActiveDevice: true,
    });

    expect(result.queue).toEqual([song1]);
    expect(result.currentIndex).toBe(1);
  });

  it('should only allow queue changes from non-active device', () => {
    const result = resolveConflict({
      serverState: { queue: [], currentIndex: 0, isPlaying: true },
      incomingUpdate: { queue: [song1], isPlaying: false },
      isActiveDevice: false,
    });

    expect(result.queue).toEqual([song1]);
    expect(result.isPlaying).toBeUndefined(); // Not allowed
  });

  it('should convert play/pause from non-active to remote command', () => {
    const result = resolveConflict({
      serverState: { isPlaying: true },
      incomingUpdate: { isPlaying: false },
      isActiveDevice: false,
    });

    expect(result._remoteCommand).toEqual({ action: 'pause' });
  });
});

describe('mergeQueues', () => {
  it('should use last write wins by default', () => {
    const result = mergeQueues(
      [song1, song2],    // server
      [song1, song3],    // local
      [song1]            // base
    );

    expect(result).toEqual([song1, song3]);
  });
});
```

**File**: `src/lib/services/__tests__/playback-session.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPlaybackSession, updatePlaybackSession } from '../playback-session';

describe('PlaybackSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create new session for new user', async () => {
    const session = await getPlaybackSession('new-user-id');

    expect(session.queue).toEqual([]);
    expect(session.currentIndex).toBe(0);
    expect(session.isPlaying).toBe(false);
  });

  it('should enforce queue size limit', async () => {
    const hugeQueue = Array.from({ length: 600 }, (_, i) => ({
      id: `song-${i}`,
      title: `Song ${i}`,
    }));

    const result = await updatePlaybackSession('user-id', {
      queue: hugeQueue,
      deviceId: 'device-1',
      deviceName: 'Test',
      deviceType: 'desktop',
    });

    expect(result.queue.length).toBe(500); // MAX_QUEUE_SIZE
  });

  it('should truncate long metadata fields', async () => {
    const longTitle = 'A'.repeat(500);
    const result = await updatePlaybackSession('user-id', {
      queue: [{ id: '1', title: longTitle }],
      deviceId: 'device-1',
      deviceName: 'Test',
      deviceType: 'desktop',
    });

    expect(result.queue[0].title.length).toBe(200);
  });
});
```

#### Integration Tests

**File**: `src/lib/services/__tests__/playback-websocket.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { startWebSocketServer } from '../websocket-server';

describe('PlaybackWebSocket Integration', () => {
  let server: ReturnType<typeof startWebSocketServer>;
  let ws1: WebSocket;
  let ws2: WebSocket;

  beforeAll(async () => {
    server = startWebSocketServer();
    await new Promise(r => setTimeout(r, 100)); // Wait for server start
  });

  afterAll(() => {
    ws1?.close();
    ws2?.close();
    server?.server.close();
  });

  it('should broadcast state updates to other devices', async () => {
    ws1 = new WebSocket('ws://localhost:3001/ws/playback');
    ws2 = new WebSocket('ws://localhost:3001/ws/playback');

    await Promise.all([
      new Promise(r => ws1.on('open', r)),
      new Promise(r => ws2.on('open', r)),
    ]);

    const messagePromise = new Promise<any>((resolve) => {
      ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'state') resolve(msg);
      });
    });

    // Device 1 sends state update
    ws1.send(JSON.stringify({
      type: 'state_update',
      deviceId: 'device-1',
      payload: { queue: [{ id: 'song-1' }], currentIndex: 0 },
    }));

    const received = await messagePromise;
    expect(received.payload.queue).toEqual([{ id: 'song-1' }]);
  });

  it('should handle transfer playback', async () => {
    // ... similar test for transfer
  });
});
```

#### E2E Tests

**File**: `e2e/jukebox.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Jukebox Cross-Device', () => {
  test('should transfer playback between devices', async ({ browser }) => {
    // Create two browser contexts (simulating two devices)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Login on both
    await page1.goto('/');
    await page2.goto('/');
    // ... login steps

    // Device 1 starts playing
    await page1.click('[data-testid="play-button"]');
    await expect(page1.locator('[data-testid="now-playing"]')).toBeVisible();

    // Device 2 should show "Playing on Device 1"
    await expect(page2.locator('[data-testid="remote-device-banner"]')).toContainText('Playing on');

    // Transfer to Device 2
    await page2.click('[data-testid="take-control-button"]');

    // Device 2 should now be playing
    await expect(page2.locator('[data-testid="now-playing"]')).toBeVisible();

    // Device 1 should show "Playing on Device 2"
    await expect(page1.locator('[data-testid="remote-device-banner"]')).toContainText('Playing on');

    await context1.close();
    await context2.close();
  });

  test('should sync queue changes across devices', async ({ browser }) => {
    // Similar setup...

    // Add song to queue on Device 1
    await page1.click('[data-testid="add-to-queue"]');

    // Device 2 should see updated queue
    await expect(page2.locator('[data-testid="queue-count"]')).toContainText('1');
  });
});
```

### Manual Testing Checklist

#### Network Recovery
- [ ] Play song, toggle airplane mode briefly, verify auto-recovery
- [ ] Play song, switch from WiFi to LTE, verify continuation
- [ ] Play song, switch from LTE to WiFi, verify continuation
- [ ] Verify no user interaction needed for recovery
- [ ] Verify position maintained after recovery
- [ ] Verify buffering indicator shows during recovery

#### HLS Streaming
- [ ] Verify HLS playlist generated correctly
- [ ] Verify segments load independently
- [ ] Verify individual segment retry on failure
- [ ] Verify fallback to direct stream if HLS fails
- [ ] Verify Safari native HLS works
- [ ] Verify no transcoding for AAC/MP3 sources (check logs)

#### Jukebox
- [ ] Open app on phone, verify device registered
- [ ] Open app on desktop, verify both devices shown
- [ ] Transfer from phone to desktop, verify queue moves
- [ ] Send play/pause from desktop to phone
- [ ] Verify "Playing on [Device]" shows correctly
- [ ] Verify "Play here" button works to take control
- [ ] Verify queue edits sync within 5 seconds

#### Conflict Resolution
- [ ] Edit queue on two devices simultaneously
- [ ] Go offline, make changes, come back online
- [ ] Verify active device position takes priority
- [ ] Verify non-active device can still add to queue

#### Mobile-Specific
- [ ] Verify lock screen controls work (iOS/Android)
- [ ] Verify background audio continues
- [ ] Verify notification controls work
- [ ] Test battery saver mode reduces sync frequency
- [ ] Test offline queue caching

---

## Performance Considerations

| Aspect | Impact | Mitigation |
|--------|--------|------------|
| FFmpeg CPU | High during transcoding | Cache segments, lazy start |
| Disk I/O | HLS segments on disk | Use /tmp, cleanup job |
| WebSocket connections | Memory per connection | Connection limits, heartbeat timeout |
| JSONB queue | Size grows with queue | Limit queue to 500 songs |
| State sync frequency | Network/DB load | Debounce, batch updates |

---

## Hybrid Architecture: Server State + Local Playback

### Design Principle

This is a **Spotify Connect-style hybrid** where:

- **Server owns:** Queue, playlist, current song index, playback position, shuffle state
- **Device handles:** Actual audio playback, buffering, local caching for offline/instant UI

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SERVER (Source of Truth)                         │
├─────────────────────────────────────────────────────────────────────────┤
│  playback_sessions                                                       │
│  ├── queue: Song[]           ← Server owns the queue                    │
│  ├── currentIndex: number    ← Server knows what's playing              │
│  ├── positionMs: number      ← Server tracks position (synced from device) │
│  ├── isPlaying: boolean      ← Server knows play state                  │
│  ├── activeDeviceId          ← Server knows which device is playing     │
│  └── updatedAt               ← Conflict resolution timestamp            │
└─────────────────────────────────────────────────────────────────────────┘
         │                                           │
         │  GET /api/playback/state                  │  POST /api/playback/update
         │  (device fetches queue on open)           │  (device reports position/state)
         ▼                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DEVICE (Local Playback)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  localStorage (cache only, NOT source of truth)                          │
│  ├── queue: Song[]           ← Cached for instant UI, synced from server│
│  ├── currentIndex            ← Cached, synced from server               │
│  └── lastSyncedAt            ← When cache was last updated              │
│                                                                          │
│  Audio Engine (device-local)                                             │
│  ├── <audio> element         ← Device plays audio locally               │
│  ├── currentTime             ← Device tracks real-time position         │
│  ├── volume                  ← Device controls local volume             │
│  └── bufferedRanges          ← Device handles buffering                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

#### 1. Device Opens App
```
Device                              Server
   │                                   │
   │──── GET /api/playback/state ─────▶│
   │◀─── { queue, index, position } ───│
   │                                   │
   │ Update localStorage cache         │
   │ Load song at queue[index]         │
   │ Seek to position (if resuming)    │
```

#### 2. User Plays/Skips on Device
```
Device                              Server
   │                                   │
   │ User clicks "Next"                │
   │ Audio engine loads next song      │
   │                                   │
   │── POST /api/playback/update ─────▶│ (debounced, e.g., 2s)
   │   { currentIndex, positionMs,     │
   │     isPlaying, deviceId }         │
   │                                   │
   │◀── { updatedAt, activeDevice } ───│
   │                                   │
   │ WebSocket broadcasts to           │
   │ other connected devices           │
```

#### 3. Another Device Takes Over
```
Phone (playing)                    Server                    Desktop (idle)
   │                                 │                           │
   │                                 │◀── Transfer to desktop ───│
   │                                 │                           │
   │◀── WS: { type: 'transfer' } ────│                           │
   │                                 │──── WS: { queue, pos } ──▶│
   │ Stop playback                   │                           │
   │ Show "Playing on Desktop"       │            Resume playback│
```

### localStorage as Cache (NOT source of truth)

```typescript
// React/Zustand version - uses Zustand store directly
import { useAudioStore } from '@/lib/stores/audio';

// On app open: Fetch from server, update cache
async function initPlayback() {
  try {
    const serverState = await fetch('/api/playback/state').then(r => r.json());

    // Update localStorage cache
    localStorage.setItem('playback_cache', JSON.stringify({
      queue: serverState.queue,
      currentIndex: serverState.currentIndex,
      lastSyncedAt: Date.now(),
    }));

    // Load into audio store for playback (Zustand batches internally)
    const store = useAudioStore.getState();
    store.setPlaylist(serverState.queue);
    useAudioStore.setState({ currentSongIndex: serverState.currentIndex });
  } catch (err) {
    console.error('[Playback] Failed to fetch server state:', err);
    // Will use cached state from getInitialState
  }
}

// Show cached data instantly, then sync
function getInitialState() {
  const cached = localStorage.getItem('playback_cache');
  if (cached) {
    try {
      const { queue, currentIndex } = JSON.parse(cached);
      // Show immediately for instant UI (Zustand batches internally)
      const store = useAudioStore.getState();
      store.setPlaylist(queue);
      useAudioStore.setState({ currentSongIndex: currentIndex });
    } catch (err) {
      console.error('[Playback] Failed to parse cache:', err);
    }
  }
  // Then fetch fresh state from server (may override)
  initPlayback();
}
```

### Why This Model?

| Aspect | Server-Owned State | Device-Local Playback |
|--------|-------------------|----------------------|
| Queue edits | ✅ Server persists, syncs to all devices | |
| Song skips | ✅ Server tracks current index | |
| Position | ✅ Server stores, device reports periodically | |
| Actual audio | | ✅ Device streams from Navidrome |
| Buffering | | ✅ Device handles locally |
| Volume | | ✅ Device-specific (not synced) |
| Offline | | ✅ Uses localStorage cache |

---

## Garbage Collection

### Overview

Multiple resources accumulate over time and need cleanup:

| Resource | Location | Cleanup Trigger |
|----------|----------|-----------------|
| HLS segments | `/tmp/hls-cache/` | Session timeout (5 min idle) |
| FFmpeg processes | In-memory | Session timeout |
| Playback sessions | Database | User deletion or 90-day inactivity |
| Devices | Database | 30-day inactivity |
| Listening history | Database | Configurable retention (default: 1 year) |
| WebSocket connections | In-memory | Heartbeat timeout (60s) |

### 1. HLS Segment Cleanup (Already Planned)

```typescript
// In hls-segmenter.ts
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

setInterval(async () => {
  const now = Date.now();
  for (const [songId, session] of sessions) {
    if (now - session.lastAccess > SESSION_TIMEOUT_MS) {
      console.log(`[HLS] Cleaning up: ${songId}`);
      session.process?.kill('SIGTERM');
      await rm(session.outputDir, { recursive: true, force: true });
      sessions.delete(songId);
    }
  }
}, 60 * 1000); // Check every minute
```

### 2. Stale Device Cleanup

**File**: `src/lib/services/garbage-collector.ts`

```typescript
import { db } from '@/lib/db';
import { devices, playbackSessions, listeningHistory } from '@/lib/db/schema';
import { lt, sql } from 'drizzle-orm';

const DEVICE_RETENTION_DAYS = 30;
const SESSION_RETENTION_DAYS = 90;
const HISTORY_RETENTION_DAYS = 365;

// Remove devices not seen in 30 days
export async function cleanupStaleDevices() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DEVICE_RETENTION_DAYS);

  const result = await db.delete(devices)
    .where(lt(devices.lastSeenAt, cutoff))
    .returning({ id: devices.id });

  console.log(`[GC] Removed ${result.length} stale devices`);
  return result.length;
}

// Remove playback sessions inactive for 90 days
export async function cleanupStaleSessions() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SESSION_RETENTION_DAYS);

  const result = await db.delete(playbackSessions)
    .where(lt(playbackSessions.deviceLastSeenAt, cutoff))
    .returning({ id: playbackSessions.id });

  console.log(`[GC] Removed ${result.length} stale playback sessions`);
  return result.length;
}

// Remove listening history older than 1 year
export async function cleanupOldHistory() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);

  const result = await db.delete(listeningHistory)
    .where(lt(listeningHistory.playedAt, cutoff))
    .returning({ id: listeningHistory.id });

  console.log(`[GC] Removed ${result.length} old history entries`);
  return result.length;
}

// Run all cleanup tasks
export async function runGarbageCollection() {
  console.log('[GC] Starting garbage collection...');

  const results = {
    devices: await cleanupStaleDevices(),
    sessions: await cleanupStaleSessions(),
    history: await cleanupOldHistory(),
    timestamp: new Date().toISOString(),
  };

  console.log('[GC] Complete:', results);
  return results;
}
```

### 3. Scheduled Cleanup Job

**Option A: Cron-style interval (simple)**

```typescript
// In server startup (e.g., src/entry-server.tsx or a startup hook)
import { runGarbageCollection } from '@/lib/services/garbage-collector';

// Run GC daily at startup + every 24 hours
if (process.env.NODE_ENV === 'production') {
  runGarbageCollection(); // Initial cleanup on deploy

  setInterval(() => {
    runGarbageCollection();
  }, 24 * 60 * 60 * 1000); // Every 24 hours
}
```

**Option B: API endpoint for manual/scheduled trigger**

**File**: `src/routes/api/admin/gc.ts`

```typescript
import type { APIEvent } from '@solidjs/start/server';
import { runGarbageCollection } from '@/lib/services/garbage-collector';

export async function POST(event: APIEvent) {
  // Verify admin auth or internal cron secret
  const authHeader = event.request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const results = await runGarbageCollection();

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 4. Disk Space Monitoring

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const HLS_CACHE_DIR = '/tmp/hls-cache';
const MAX_CACHE_SIZE_MB = 500; // Alert if cache exceeds 500MB

export async function checkDiskUsage() {
  try {
    const { stdout } = await execAsync(`du -sm ${HLS_CACHE_DIR} 2>/dev/null || echo "0"`);
    const sizeMB = parseInt(stdout.split('\t')[0], 10);

    if (sizeMB > MAX_CACHE_SIZE_MB) {
      console.warn(`[GC] HLS cache size warning: ${sizeMB}MB exceeds ${MAX_CACHE_SIZE_MB}MB`);
      // Could trigger aggressive cleanup or alert
      return { warning: true, sizeMB, maxMB: MAX_CACHE_SIZE_MB };
    }

    return { warning: false, sizeMB };
  } catch (err) {
    console.error('[GC] Disk check failed:', err);
    return { error: true };
  }
}
```

### 5. WebSocket Connection Cleanup

```typescript
// In playback-websocket.ts
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 60000;  // 60 seconds without heartbeat = dead

// Track last heartbeat per connection
const lastHeartbeat = new WeakMap<WebSocket, number>();

wss.on('connection', (ws, request) => {
  lastHeartbeat.set(ws, Date.now());

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (message.type === 'heartbeat') {
      lastHeartbeat.set(ws, Date.now());
      ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
    }
  });
});

// Cleanup dead connections every 30 seconds
setInterval(() => {
  const now = Date.now();
  wss.clients.forEach((ws) => {
    const last = lastHeartbeat.get(ws) || 0;
    if (now - last > HEARTBEAT_TIMEOUT) {
      console.log('[WS] Terminating dead connection');
      ws.terminate();
    }
  });
}, HEARTBEAT_INTERVAL);
```

### 6. Configuration

**File**: `src/lib/config/gc.ts`

```typescript
export const gcConfig = {
  // Retention periods (days)
  deviceRetentionDays: parseInt(process.env.GC_DEVICE_RETENTION_DAYS || '30'),
  sessionRetentionDays: parseInt(process.env.GC_SESSION_RETENTION_DAYS || '90'),
  historyRetentionDays: parseInt(process.env.GC_HISTORY_RETENTION_DAYS || '365'),

  // HLS cache
  hlsSessionTimeoutMs: parseInt(process.env.GC_HLS_TIMEOUT_MS || '300000'), // 5 min
  hlsMaxCacheSizeMB: parseInt(process.env.GC_HLS_MAX_SIZE_MB || '500'),

  // WebSocket
  wsHeartbeatIntervalMs: 30000,
  wsHeartbeatTimeoutMs: 60000,

  // Cleanup schedule
  cleanupIntervalMs: parseInt(process.env.GC_INTERVAL_MS || '86400000'), // 24 hours
};
```

### Cleanup Summary

| Task | Frequency | Retention |
|------|-----------|-----------|
| HLS segments | Every 60s | 5 min idle |
| Dead WebSockets | Every 30s | 60s no heartbeat |
| Stale devices | Daily | 30 days |
| Inactive sessions | Daily | 90 days |
| Listening history | Daily | 1 year |
| Disk space check | Daily | Alert at 500MB |

---

## Dependencies

### NPM Packages
```json
{
  "hls.js": "^1.5.0",
  "ws": "^8.16.0",
  "@types/ws": "^8.5.0",
  "lucide-solid": "^0.300.0"
}
```

### Dev Dependencies
```json
{
  "vitest": "^1.0.0",
  "@playwright/test": "^1.40.0"
}
```

### System Dependencies
- FFmpeg 4.4+ with AAC encoder (for HLS segmenting)
- FFprobe (for codec detection, usually bundled with FFmpeg)
- Node.js 18+ (native WebSocket support)

### Deployment Requirements
- WebSocket support (most hosts support this)
- `/tmp` directory with write access (for HLS cache)
- At least 500MB temp storage for HLS segments

---

## Rollback Plan

If issues occur:
1. **HLS Issues**: Feature flag disables HLS, falls back to direct stream
2. **WebSocket Issues**: Client detects disconnect, uses REST polling
3. **State Sync Issues**: Local state takes priority, manual sync button

---

## References

- [hls.js Documentation](https://github.com/video-dev/hls.js/blob/master/docs/API.md)
- [HLS Specification](https://datatracker.ietf.org/doc/html/rfc8216)
- [FFmpeg HLS Muxer](https://ffmpeg.org/ffmpeg-formats.html#hls-2)
- [Spotify Connect Protocol](https://github.com/librespot-org/librespot)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- Existing: [Cross-Device Sync Research](./cross-device-sync-research.md)

---

## Revision History

### 2026-02-08 Update
- **Fixed:** Converted all React code to SolidJS (`createSignal`, `createEffect`, `onCleanup`, `batch`)
- **Added:** WebSocket server setup (Phase 5) with Vite plugin and production options
- **Added:** Conflict resolution strategy with explicit rules
- **Added:** Queue size limits (500 items) with enforcement
- **Added:** Initial state bootstrap for new users
- **Added:** Mobile-specific considerations (MediaSession, battery-aware sync, iOS quirks)
- **Added:** Reconnecting WebSocket utility with exponential backoff
- **Added:** "Playing on [Device]" banner with take control button
- **Added:** Automated tests (unit, integration, E2E)
- **Added:** HLS codec detection to skip transcoding when possible
- **Added:** Error handling in HLS segmenter
- **Updated:** Implementation order to 7 sprints with clearer dependencies

### 2026-01-21 Initial
- Initial architecture plan
