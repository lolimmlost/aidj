# AIDJ Development Backlog

> **Last Updated:** 2026-01-27
> **Current Branch:** `feat/crossfade-v2`

---

## Legend

| Status | Meaning |
|--------|---------|
| 🔴 | Not started |
| 🟡 | In progress |
| 🟢 | Complete |
| 🔵 | Testing |
| ⚪ | Blocked / On hold |

---

## In Testing

### iOS Audio Resilience - Phase 1: Stall Watchdog
**Status:** 🔵 Testing
**Branch:** `feat/crossfade-v2`
**Commit:** `d0dc367`

- [x] Stall watchdog refs
- [x] `checkAndResumeAudioContext()` helper
- [x] `attemptStallRecovery()` with escalating strategies
- [x] Watchdog interval (2s check, 5s threshold)
- [x] Stalled event handler with false-positive filtering
- [x] Visibility handler using centralized recovery
- [ ] **iOS device testing**

**Test Scenarios:**
- [ ] Buffer underrun mid-playback
- [ ] Return from background after long idle
- [ ] Bluetooth disconnect/reconnect
- [ ] Lock screen for extended period

---

## High Priority

### iOS Audio Resilience - Remaining Phases
**Status:** 🔴 Not started
**Plan:** `docs/architecture/ios-audio-resilience-plan.md`

| Phase | Description | Priority | Effort |
|-------|-------------|----------|--------|
| 2 | Stalled event handler | 🟢 Done | - |
| 3 | AudioContext state check | 🟢 Done | - |
| 4 | Network recovery (`online` event) | Low | Low |
| 5 | Edge case hardening (both decks have progress, infinite duration) | Low | Low |

---

### AI DJ Mode - Hybrid Recommendation System
**Status:** 🔴 Not started
**Plan:** `docs/architecture/ai-dj-mode-hybrid-plan.md`

Pre-computed candidate pools for zero-latency AI DJ startup.

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Database: `ai_dj_candidate_pool` table | 🔴 |
| 2 | Service: Candidate pool generator | 🔴 |
| 3 | Service: Initial queue builder | 🔴 |
| 4 | BPM/Energy trajectory algorithm | 🔴 |
| 5 | API endpoint `/api/ai-dj/generate-queue` | 🔴 |
| 6 | UI: Empty queue → AI DJ curates | 🔴 |
| 7 | UI: Colored duration bar indicator | 🔴 |

**Depends on:** Profile-based recommendations (see below)

---

### Profile-Based Recommendations (AI DJ Foundation)
**Status:** 🟡 Partially complete
**Plan:** `.claude/plans/glowing-churning-naur.md`

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Sync liked songs to feedback table | 🔴 |
| 2 | Enhance compound score with liked bonus | 🔴 |
| 3 | Profile-based recommendation getter | 🔴 |
| 4 | Drip-feed trigger (every 3 songs) | 🔴 |
| 5 | AI DJ settings UI (interval slider) | 🔴 |
| 6 | Background profile update endpoint | 🔴 |

**New Tables Needed:**
- `artistAffinities`
- `temporalPreferences`
- `ai_dj_candidate_pool`

---

## Medium Priority

### PlayerBar Refactoring
**Status:** 🔴 Not started
**Plan:** `docs/architecture/player-bar-refactor-plan.md`

Current size: ~2100 lines → Target: ~300 lines

| Phase | Extract To | Risk | Status |
|-------|-----------|------|--------|
| 1 | `AlbumArt.tsx` | Low | 🔴 |
| 2 | `usePlayerKeyboard.ts` | Low | 🔴 |
| 3 | `useStallRecovery.ts` | Medium | 🔴 |
| 4 | `useMediaSession.ts` | Medium | 🔴 |
| 5 | `useCrossfade.ts` | High | 🔴 |
| 6 | `useDualDeckAudio.ts` | High | 🔴 |

**Depends on:** iOS audio testing complete

---

### TypeScript Errors Cleanup
**Status:** 🔴 Not started

Pre-existing type errors in codebase (not blocking builds):

| File | Issue |
|------|-------|
| `DJFeatures.tsx` | Invalid route `/dj/mixer` |
| `DashboardHero.tsx` | Invalid route `/library` |
| `ai-dj-control.tsx` | Invalid route `/settings/recommendations` |
| `DiscoveryFeed.tsx` | Missing exports `TimeSlot`, `ListeningContext` |
| `AppLayout.tsx` | Dynamic route type issues |
| `ArtistsList.tsx` | Missing `albumCount` on Artist type |
| `playlist-import-dialog.tsx` | Type mismatches |
| `OfflineIndicator.tsx` | Missing tooltip component |

---

## Low Priority

### iOS Audio - Network Recovery
**Status:** 🔴 Not started

Listen for `online` event and resume stalled playback.

```typescript
window.addEventListener('online', handleOnline);
```

---

### iOS Audio - Edge Cases
**Status:** 🔴 Not started

- Both decks have progress → use higher `currentTime` as tiebreaker
- Infinite duration (live streams) → skip crossfade

---

### DJ Matching Enhancements
**Status:** 🔴 Not started

- Key compatibility scoring (Camelot wheel)
- Energy curve visualization
- Manual BPM tap detection

---

## Completed (Recent)

### iOS Crossfade Fixes
**Status:** 🟢 Complete
**Branch:** `feat/crossfade-v2`

- [x] Fix old deck playing after crossfade on phone unlock
- [x] Fix crossfade fade-in by starting interval after play() succeeds
- [x] Fix mobile crossfade by priming both audio decks
- [x] Fix lock screen pause button not responding
- [x] Fix stall after unpause due to priming conflict
- [x] Add buffer stall detection on visibility change

### Other Recent
- [x] Add 'More Like This' button to queue panel
- [x] Add DJ matching (BPM/Energy/Key) and queue seeding features

---

## Ideas / Future

- [ ] Offline mode with downloaded tracks
- [ ] Spotify/Apple Music import
- [ ] Social features (share playlists, follow friends)
- [ ] Podcast support
- [ ] Sleep timer
- [ ] Equalizer
- [ ] Lyrics sync (karaoke mode)
- [ ] Party mode (multiple users queue songs)

---

## Notes

- Always test iOS changes on actual device before merging
- Keep `debug=true` localStorage flag for audio debugging
- Crossfade system uses silent data URLs to clear decks safely
