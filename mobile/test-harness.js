/**
 * NativeAudio spike test harness.
 *
 * Paste into the WKWebView console (Safari → Develop → your device → AIDJ app)
 * while the native shell is running, to exercise the bridge WITHOUT touching
 * the store. On the web (no native plugin) every call is a safe no-op.
 *
 * Get a real Navidrome stream URL from the running app, e.g. in the console:
 *   window.__AIDJ_TEST_URL = <a stream url the app is already using>
 */
(async () => {
  const { NativeAudio, isNativeAudioAvailable } = await import('/src/lib/mobile/native-audio.ts');
  console.log('[spike] native audio available:', isNativeAudioAvailable());

  await NativeAudio.addListener('trackEnded', (e) => console.log('[spike] trackEnded', e));
  await NativeAudio.addListener('remoteCommand', (e) => console.log('[spike] remoteCommand', e));
  await NativeAudio.addListener('audioStateChange', (s) => console.log('[spike] audioState', s.audioState));

  await NativeAudio.prepare();

  const url = window.__AIDJ_TEST_URL;
  if (!url) return console.warn('[spike] set window.__AIDJ_TEST_URL to a Navidrome stream url first');

  await NativeAudio.play({ id: 'test-1', url, title: 'Spike Track', artist: 'AIDJ' });
  console.log('[spike] playing — now LOCK THE SCREEN and confirm audio continues for 10+ min');

  // Expose helpers for manual poking:
  window.__spike = {
    pause: () => NativeAudio.pause(),
    resume: () => NativeAudio.resume(),
    state: () => NativeAudio.getState().then((s) => console.table(s)),
    crossfade: (u) => NativeAudio.crossfadeTo({ track: { id: 'test-2', url: u, title: 'Next', artist: 'AIDJ' }, durationMs: 2000 }),
  };
  console.log('[spike] helpers: __spike.pause() / .resume() / .state() / .crossfade(url)');
})();
