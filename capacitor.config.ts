import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for the AIDJ native-shell SPIKE.
 *
 * Strategy: this is NOT a bundled offline app. AIDJ is a TanStack Start SSR
 * app with server API routes, better-auth cookies, a WebSocket sync channel,
 * and audio streamed from Navidrome — all of which already run on the deployed
 * server. So the native shell just points a WKWebView at the live server
 * (`server.url`) and loads the real app unchanged. Zero SSR-bundling work.
 *
 * The ONLY thing we add natively is audio playback (the NativeAudio plugin),
 * because a WKWebView has the same WebKit background-audio limits as Safari —
 * wrapping the web audio pipeline would NOT fix the background/lock-screen
 * failures (issues #165 / #166). Playback moves to AVQueuePlayer +
 * AVAudioSession + MPNowPlayingInfoCenter; the web app sends it commands.
 *
 * Set CAP_SERVER_URL to target a different environment (dev box, LAN IP for
 * on-device testing against `npm run dev`, etc.).
 */
const serverUrl = process.env.CAP_SERVER_URL ?? 'https://dev3.appahouse.com';

const config: CapacitorConfig = {
  appId: 'com.appahouse.aidj',
  appName: 'AIDJ',
  // webDir is required by the CLI even in server.url mode; a throwaway folder
  // with a placeholder index.html satisfies `cap sync` without bundling the app.
  webDir: 'mobile/www',
  server: {
    url: serverUrl,
    cleartext: false,
    // Allow the app's own origin + the Navidrome stream host through WKWebView.
    allowNavigation: ['dev3.appahouse.com', '*.appahouse.com'],
  },
  ios: {
    // Required entitlement for background audio is added in Xcode
    // (UIBackgroundModes: audio) — see mobile/README.md.
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
