# TODO

## Audio / iOS

- [x] Improve fade-in smoothness when transitioning back from iOS background — there's still a slight audible pause. The settle delay (30ms quick bounce / 150ms long interrupt) before the 200ms fade-in in `useWebAudioGraph.ts` may be too aggressive. Consider starting reconnect at a low non-zero gain instead of 0, or reducing the settle delay.

- [ ] Fix cross-device skip: rapid skips from iPhone leave desktop with `isPlaying=false` and WS disconnect
- [ ] Cross-device playback handoff: when user is playing music on phone and also has desktop session open, when song ends on phone the desktop session should pick up playback (Spotify Connect-style transfer)
- [ ] Cross-device position sync: when phone is playing and desktop opens, pressing play on desktop resumes from the initial sync position instead of the phone's current position. WebSocket should continuously broadcast current playback position so other sessions stay up to date.

## Performance

- [ ] Media Session handlers re-registering excessively — `PlayerBar.tsx` sets up Media Session handlers ~50+ times per page load due to an effect re-running too often. Needs dep array audit or guard to only register once per song change.
- [ ] React hydration error #418 on every page load — SSR/client HTML mismatch. Likely a component rendering differently on server vs client (e.g. reading localStorage, window, or timestamps during SSR).

## UI / UX

- [ ] Add fullscreen song view — tap album art or expand button to show immersive full-screen now-playing with large artwork, controls, lyrics, and swipe-to-dismiss
- [x] Improve toasts — centralized toast wrapper with per-type durations (success 3s, error 6s, info 4s, warning 5s), close buttons, max 4 visible
- [ ] Logout page invalidation — invalidate router/query cache on sign-out for instant redirect to login instead of stale page flash
- [x] Redesign login page — improve visual design, branding, and UX

## DevOps

- [ ] Switch Coolify deployment back to `main` branch and merge `feat/web-audio-crossfade` into `main`

## Lidarr / Downloads

- [ ] Add option to monitor a specific album or song in Lidarr instead of pulling full artist discography — check how the CSV playlist import handles this (it likely uses `POST /api/v1/album` or search+add per album rather than artist-level monitoring)
- [ ] Make playlist import easier — support pasting a playlist link (Spotify, YouTube Music, Apple Music) and auto-resolve tracks instead of requiring manual CSV upload
