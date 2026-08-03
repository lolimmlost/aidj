# Changelog

All notable changes to AIDJ are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versions use [Semantic Versioning](https://semver.org/).

---

## [1.5.0] — 2026-08-03

### Added
- **Listening sessions** — materialize sessions from listening history as first-class DB entities with computed stats (skip rate, completion rate, genre/artist distribution, source mix, temporal context)
- Session rating API — binary "liked" rating to feed back into AI DJ
- Session insights API — compares liked vs unrated sessions to surface patterns (preferred genres, time-of-day, diversity)
- **Library reconciliation** — detects and remaps ghost song IDs when Picard retags or Lidarr moves files (#106)
  - Duration-based fallback matching for Picard-retagged songs
  - Native Navidrome API fallback search
  - MeTube-parsed title variant matching
  - DrizzleQueryError `.cause.code` fix for Postgres duplicate detection

### Changed
- Liked songs sync now uses Navidrome native API for starred songs
- Both sync buttons in the UI rebuild the liked songs playlist consistently
- Improved playlist import matching for Spotify multi-artist songs and Lidarr artist selection

### Fixed
- Toast notifications now use swipe-to-dismiss instead of close button

---

## [1.4.0] — 2026-07-28

### Changed
- **TypeScript 6** + stable React Compiler (`babel-plugin-react-compiler` 1.0) (#103)
- **ESLint 10** toolchain upgrade (#102)
- **Design system overhaul** — semantic status tokens, dead-code purge, theme-compliant colors (#104)
- Docker base image bumped from node 20-slim to 26-slim (#85)
- Removed committed credentials from defaults and screenshot spec (#101)

### Added
- Fullscreen chassis visualizer + playlist UX improvements (#98)
- Lidarr: unmonitor other albums on single-song add, split semicolon artists

### Fixed
- Seed `Math.random` in shuffle tests to kill artist-separation flake (#100)
- Removed broken e2e CI job with restoration notes (#99)

---

## [1.3.0] — 2026-05-16

### Added
- **Listening analytics overhaul**
  - `listening_history.source` column — tags every play with origin (ai_dj/autoplay/radio/manual)
  - Plays-by-source pie chart on Listening tab
  - Top played artists + songs cards on Listening tab
- **Now Playing fullscreen chassis** — unified fullscreen player with lyrics-as-mode and ModeSwitcher pill
- **Seeded radio** — start radio from any artist, genre, album, or playlist with length/variety constraints
  - StartRadioButton component wired into playlist, album, artist, and queue UIs
  - Save radio as playlist
  - Genre-coherent adjacent slice for artist radio
- **Artist co-occurrence graph** — session-based affinity scoring for better recommendations
- **Design system** — branded typography (Unbounded + Syne wordmark), DS tier-1 utilities, unified tooltip theme
- Auto-refresh affinity profile after N plays

### Changed
- Analytics dashboards share StatCard primitive, consistent styling across Overview/Quality/Activity/Discovery/Listening tabs
- Stat cards responsive 4-up grid with mobile-friendly breakpoints
- Source label mapping normalized across analytics and A/B tests

### Fixed
- iOS PWA pitch-shift on lock/unlock — two-layer muting, crossfade warmup 500→1000ms
- Playback resume from saved position after hard refresh
- Cross-device sync: gate click-to-play and startRadio when another device is active, ignore own-device echo, clear stale active-device on WS disconnect
- Similar artist resolution via song-level artist tag with server-side fallback
- Mobile player bar: compact single-line Title · Artist layout
- Analytics: real month-over-month calculations, proper genre data, correct discovery analytics API responses

---

## [1.2.0] — 2026-04-21

### Added
- **Aurral integration Phase 1** — artist metadata enrichment from external knowledge base (#76)
- **Aurral integration Phase 2** — UI enrichment with artist metadata hero + dashboard discovery recommendations
  - MusicBrainz fallback for type/country/year when Aurral omits them
  - Actionable similar artists with image error handling and tag dedup
- Auto cache warming for artist metadata

### Changed
- Cover art system unified — single endpoint, admin gate, onboarding auto-fetch
- Auto-fetch refactored to job-based polling with live progress bar
- Artist bubble avatars unified across dashboard, sidebar, and browse page

### Fixed
- Song loader timeout handling + Aurral test coverage (#82)
- Aurral add-artist fallback when global search returns empty (#83)
- Load artist photos for Aurral dashboard discovery recommendations (#75)

---

## [1.1.0] — 2026-04-01

### Added
- **Dual-deck web audio crossfade** — two HTMLAudioElement instances for gapless crossfade playback
- **Production deployment** — Dockerfile, Docker Compose, Coolify integration
- **User onboarding wizard** — artist picker, liked songs sync, Last.fm import (Stories 9.1–9.3)
- **Admin dashboard** — user stats, session management, role-based access control
- **Spotify playlist import** — OAuth flow and URL paste methods
- **2FA/OTP** — TOTP authentication with security email templates via Resend
- **Per-user Navidrome accounts** — each AIDJ user gets their own Navidrome account for stars/playlists/scrobbles
- **Cross-device playback sync** — WebSocket-based Spotify Connect-style control
- **Smart playlists** — Navidrome native API integration
- **Fullscreen player** — swipe album art to change songs, repeat mode (off/all/one), queue button, lyrics modal
- **Cover art system** — Deezer artist images, batch auto-fetch, gradient initial placeholders
- **Radio shuffle** — mood-based radio from dashboard pills
- **PWA identity** — prevents iOS opening wrong app from media controls
- **Invite page** — QR code for user onboarding with branded download

### Changed
- PlayerBar refactored — dual-deck audio hooks extracted, mobile bar compacted
- Artists pages restyled — circular bubbles, cinematic hero, horizontal discography
- Login page redesigned with animated queue carousel
- Toast system centralized with per-type durations and glass-card styling
- Mobile hamburger replaced with fixed top bar including safe-area support

### Fixed
- iOS AudioContext state management — auto-resume after Siri/phone interrupts, pitch-shift recovery
- Audio stream error handling — auto-skip on stream failure, XML error detection
- Session TTL reduced from 7 days to 1 day with expired session pruning
- Liked songs sync — heart icon reflects actual state, unstarring removes from playlist
- Production server static serving and auth cookie handling

---

## [1.0.0] — 2026-03-28

### Added
- Core music interface with TanStack Start (SSR + API routes)
- Navidrome integration (Subsonic-compatible API) for all music data
- AI DJ recommendation engine with multi-signal scoring (Last.fm, compound, diversity, temporal, skip, feedback)
- Background discovery system for offline suggestion generation
- Playlist management with create, edit, delete, and song management
- Listening history tracking with play duration and skip detection
- User preferences system with dashboard settings
- Music identity profiling
- Library search and browsing
- WebSocket infrastructure for real-time features
- Service worker for PWA offline support

[1.5.0]: https://github.com/lolimmlost/aidj/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/lolimmlost/aidj/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/lolimmlost/aidj/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/lolimmlost/aidj/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/lolimmlost/aidj/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/lolimmlost/aidj/releases/tag/v1.0.0
