# Changelog

All notable changes to AIDJ are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versions use [Semantic Versioning](https://semver.org/).

---

## [1.6.0-rc.2] — 2026-11-18

> **Release candidate.** Everything merged to `main` since 1.5.0, about 100 PRs. It replaces rc.1, which was never tagged.

### ✨ Highlights

- 🎛️ **DJ Transition Lab.** A continuous mix that locks the next song, beat-matches inside a tempo window and learns from the transitions you like. It can record live sets and render saved ones offline.
- 🔊 **House speakers.** Send the AI DJ to your Music Assistant speakers and hand playback back to your phone.
- ❤️ **Liked Songs, rebuilt.** Navidrome stars are the single source of truth, and every device stays in sync.
- 📥 **Get the songs you're missing.** Import review sends unmatched songs to Lidarr or YouTube (MeTube), and a stricter matcher stops duplicate downloads.
- 🔎 **Smarter search.** Recent searches are kept per user. "Did you mean …?" catches artists you already own, "two pac" finds 2Pac, and typing no longer fights you.

### Added

**DJ & playback**
- DJ Transition Lab (`/dj/lab`)
  - Lock-next, blind A/B and a transition picker
  - Tempo window and tempo jumps; hard transitions by default (8-bar build, 2-bar cut)
  - Queue-after-lock and liked transitions
  - Live set recording and offline rendering of saved sets
  - (#367, #380, #387–#389, #393, #394)
- Transition learning: transitions are mined from your listening and feed a flag-gated re-ranker in the recommendation scorer, validated offline on held-out data
- House speakers via Music Assistant (#244, #246, #247)
- Sleep timer (#171), spread shuffle everywhere (#249), scrobble at a threshold you set (#248)

**Search**
- Recent searches are kept per user and include the songs, artists and albums you open (#399)
- **Did you mean …?** When MusicBrainz resolves a search to an artist already in your library ("21 pilots" → twenty one pilots), you get a link to it instead of a download offer (#342)
- Number spellings find the artist: "two pac" and "2 pac" → 2Pac, "twenty one" ↔ "21". Artist matching ignores spaces and punctuation, so "acdc" finds AC/DC (#342)

**Library & import**
- YouTube (MeTube) fallback (#131, #145, #231)
  - Per-song downloads from import review, with auto-retry and parallel downloads
  - A result matcher, plus guards against re-downloading songs already in the library
- Import review has clearer prompts, and unmatched or skipped songs can be sent to download (#411)
- Lidarr downloader helper and a manual queue script (#412)
- Playlists mirror to Navidrome as real playlists (#178, #200)
- Chosic CSV exports are recognized in playlist import (#204)

**Look & feel**
- Mobile bottom tab bar, View Transitions (Now Playing sheet, album-art morphs), like burst + double-tap to like + haptics, and per-page tab titles (#278, #283, #287, #289)
- Share links unfurl with the album or artist cover (#361), and a featured mix card on the dashboard (#351)
- A PWA-safe debug toggle: tap the title bar 5 times

**Privacy**
- Search engines index only the landing page, via `robots.txt` and `noindex` (#418)

### Changed

- **Liked Songs** rebuilt around Navidrome stars (#124, #130, #138, #139)
  - One `setSongLiked()` write-through
  - A deterministic Liked Songs playlist
  - Server-authoritative feedback broadcast over WebSocket
- One transactional `repointSongId` owns every song-id move (#221, #254), and one canonical artist/title parser (#219)
- Playlist radio uses representative seeds plus a share of the playlist's own tracks (#309)
- Unreachable download, search and matcher paths, dead components and dead CSS are removed (#253, #261, #262)
- Repo polish: MIT license, community files and an accurate README (#317)

### Fixed

**Playback & speakers**
- Navidrome 0.64: ids cached before the 0.64 re-encode keep working (#397)
- A song picked during speaker hand-off no longer also plays on the phone (#398)
- Recovery from a frozen playback clock (#170); radio after a cold iOS launch (#311); muted decks after a mid-crossfade pick (#296)

**Search & matching**
- When Aurral hangs, search says "Download service is restarting" instead of hiding the artist for 24 h (#336, #342)
- Typing mid-word no longer throws the cursor to the end, and search waits for a pause instead of running on every keystroke (#342)
- Matcher (#419, #421)
  - Ignores feat credits and compares artist lists
  - Gates auto-matches
  - Matches YouTube-rip uploads and credit-only title segments

**Playlists & import**
- Huge playlists no longer crash the page, because the song list is virtualized (#420)
- Deleted playlists no longer come back on sync (#160), and sync no longer duplicates songs (#127)
- Import and Sync no longer show when you have no playlists (#400)
- You can like songs from the playlist view on phones (#395)
- Import has its own rate-limit bucket (#128)
- No more "undefined songs queued" toast after Download missing (#415)

**Account & app**
- 2FA (#316)
  - Enabling it works, and login asks for the code
  - Email OTP
  - Only configured social logins are shown
- Login returns you to the link you opened (#341)
- The Discovery "pending" badge no longer counts every suggestion ever made (#312)
- The library reconciliation scheduler starts on prod boot, and the Tasks trigger works (#267)
- UI fixes
  - Blurred backdrop over sidebars (#289)
  - Queue panel respects the safe-area inset (#304)
  - Desktop speaker button placement (#331)
  - Tasks and mobile Library Growth nav links (#408)

### Security

- Signed-in users no longer get Navidrome admin rights (#364), and the Navidrome proxies require a session (#363)
- `/api/config` no longer leaks credentials to unauthenticated callers (#245)
- Patched advisories
  - TanStack Start reflected XSS, GHSA-qx66-fv34-fjm8 (#332)
  - vite dev-server (#344)
  - seroval and source-map-js (#315)
  - undici and zod (#414)
  - in-range npm audit findings (#195)
- The npm-audit CI gate enforces high and critical findings, and it's green (#198, #269, #414)

### 🙌 New Contributors

- [@Yumejichi](https://github.com/Yumejichi): Tasks and mobile Library Growth nav links (#408)
- [@Robalexg](https://github.com/Robalexg): recent searches per user (#399)
- [@RichardGabelman](https://github.com/RichardGabelman): keep the app out of search engines (#418)

Thank you all!

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
