# TODO

## Audio / iOS

- [ ] Improve fade-in smoothness when transitioning back from iOS background — there's still a slight audible pause. The settle delay (30ms quick bounce / 150ms long interrupt) before the 200ms fade-in in `useWebAudioGraph.ts` may be too aggressive. Consider starting reconnect at a low non-zero gain instead of 0, or reducing the settle delay.

- [ ] Fix cross-device skip: rapid skips from iPhone leave desktop with `isPlaying=false` and WS disconnect

## UI / UX

- [ ] Add fullscreen song view — tap album art or expand button to show immersive full-screen now-playing with large artwork, controls, lyrics, and swipe-to-dismiss
- [ ] Improve toasts — review all toast usage for appropriate timeouts, consolidate duplicate toasts, and ensure error toasts persist longer than success toasts
- [ ] Logout page invalidation — invalidate router/query cache on sign-out for instant redirect to login instead of stale page flash
- [ ] Redesign login page — improve visual design, branding, and UX

## Lidarr / Downloads

- [ ] Add option to monitor a specific album or song in Lidarr instead of pulling full artist discography — check how the CSV playlist import handles this (it likely uses `POST /api/v1/album` or search+add per album rather than artist-level monitoring)
- [ ] Make playlist import easier — support pasting a playlist link (Spotify, YouTube Music, Apple Music) and auto-resolve tracks instead of requiring manual CSV upload
