/**
 * NativeAudio — web↔native playback bridge (Capacitor plugin) — SPIKE.
 *
 * This is the entire surface area that has to move off the web audio pipeline
 * to fix background / lock-screen playback on iOS (#165, #166). Everything else
 * about AIDJ stays in the WKWebView and keeps talking to the server.
 *
 * On iOS (Capacitor native), `registerPlugin` binds to the Swift implementation
 * in mobile/ios-plugin/NativeAudioPlugin.swift. On the web (and SSR), there is
 * no native host, so we fall back to a no-op shim and the app keeps using the
 * existing dual-deck HTMLAudioElement path unchanged. Guard usage with
 * `isNativeAudioAvailable()`.
 *
 * Design mirrors the crossfade contract in src/lib/stores/audio.ts so the store
 * can delegate to native playback without changing its own state model:
 *   - the web app remains the source of truth for QUEUE + recommendations
 *   - native owns the actual sample playback, crossfade ramps, and Now Playing
 *   - native emits position/state/ended events back so the store stays in sync
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** A track the native player can stream directly (Navidrome stream URL). */
export interface NativeTrack {
  /** AIDJ song id — echoed back in events so the store can correlate. */
  id: string;
  /** Fully-resolved, auth'd stream URL (Navidrome). Native just plays it. */
  url: string;
  title: string;
  artist: string;
  album?: string;
  /** Lock-screen artwork URL (optional). */
  artworkUrl?: string;
  /** Seconds, for MPNowPlayingInfo position state (optional). */
  durationSec?: number;
}

export interface NativePlaybackState {
  songId: string | null;
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  /** AVAudioSession state, incl. iOS-only 'interrupted'. */
  audioState: 'running' | 'suspended' | 'interrupted' | 'ended' | 'idle';
}

export interface NativeAudioPlugin {
  /** Configure AVAudioSession category=.playback so audio survives lock/background. */
  prepare(): Promise<void>;

  /** Load + begin playing a track on the primary player. */
  play(track: NativeTrack): Promise<void>;

  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(options: { positionSec: number }): Promise<void>;

  /**
   * Gapless/crossfade to the next track: native preloads `track` on the second
   * AVPlayer and ramps gains over `durationMs`. This is the dual-deck crossfade,
   * done natively so it survives backgrounding (the web version does not).
   */
  crossfadeTo(options: { track: NativeTrack; durationMs: number }): Promise<void>;

  /** Push current queue so lock-screen next/prev + preloading work natively. */
  setQueue(options: { tracks: NativeTrack[]; currentIndex: number }): Promise<void>;

  getState(): Promise<NativePlaybackState>;

  /** Position ticks (~1Hz) for the scrubber + MPNowPlayingInfo. */
  addListener(
    eventName: 'positionChange',
    cb: (s: NativePlaybackState) => void,
  ): Promise<PluginListenerHandle>;

  /** Track finished — store advances the queue / triggers next recommendation. */
  addListener(
    eventName: 'trackEnded',
    cb: (s: { songId: string }) => void,
  ): Promise<PluginListenerHandle>;

  /** Lock-screen / headset command → store reacts (Media Session equivalent). */
  addListener(
    eventName: 'remoteCommand',
    cb: (c: { command: 'play' | 'pause' | 'next' | 'previous'; }) => void,
  ): Promise<PluginListenerHandle>;

  /** AVAudioSession interruption began/ended (call, Siri, route change). */
  addListener(
    eventName: 'audioStateChange',
    cb: (s: NativePlaybackState) => void,
  ): Promise<PluginListenerHandle>;
}

/** True only inside the iOS Capacitor shell with the native plugin present. */
export function isNativeAudioAvailable(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'ios' &&
    Capacitor.isPluginAvailable('NativeAudio')
  );
}

/**
 * Web/SSR no-op shim. Keeps every call safe to make from shared store code:
 * on the web these resolve/immediately no-op and the existing HTMLAudioElement
 * pipeline stays in charge.
 */
const webShim: NativeAudioPlugin = {
  async prepare() {},
  async play() {},
  async pause() {},
  async resume() {},
  async seek() {},
  async crossfadeTo() {},
  async setQueue() {},
  async getState() {
    return { songId: null, isPlaying: false, positionSec: 0, durationSec: 0, audioState: 'idle' };
  },
  async addListener() {
    return { remove: async () => {} } as PluginListenerHandle;
  },
};

/**
 * The plugin handle. `registerPlugin` returns the native proxy on iOS and the
 * provided web fallback everywhere else, so importing this is always safe.
 */
export const NativeAudio: NativeAudioPlugin = registerPlugin<NativeAudioPlugin>('NativeAudio', {
  web: webShim,
});
