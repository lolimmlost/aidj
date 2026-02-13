---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
inputDocuments: ['docs/analysis/product-brief-aidj-mobile-2025-12-14.md', 'docs/prd.md']
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 1
workflowType: 'prd'
lastStep: 4
project_name: 'AIDJ Mobile'
user_name: 'Dev Gansta'
date: '2025-12-14'
---

# Product Requirements Document - AIDJ Mobile

**Author:** Dev Gansta
**Date:** 2025-12-14

---

## Executive Summary

**AIDJ Mobile** is a privacy-first, mobile-first music companion app that transforms your self-hosted Navidrome library into an intelligent personal DJ experience.

**The Promise:** The more you use AIDJ, the smarter it gets. Your DJ grows with you.

Positioned as *"Your Personal DJ That Actually Knows You,"* AIDJ solves a core frustration: homelab enthusiasts who self-host their music libraries lack a cohesive, intelligent mobile experience. Existing Navidrome clients provide basic playback but miss the smart features modern listeners expect. The streaming services offer intelligence but at the cost of privacy and ownership.

AIDJ bridges this gap: **smart features without sacrificing self-hosted privacy.**

*AIDJ aims to be the Immich of music - the obvious choice for self-hosters who want intelligence without surveillance.*

### Why Not Just Use Spotify?

| Spotify | AIDJ |
|---------|------|
| Your listening data trains their algorithm | Your data stays on your server |
| Songs disappear when licenses change | You own your library forever |
| Monthly fees forever | One-time setup, free forever |
| Algorithm optimizes for engagement | DJ optimizes for YOUR taste |

### Why AIDJ Exists

Every existing Navidrome client treats you like a database administrator. AIDJ treats you like a music lover. It learns what you like, suggests what you'll love, and gets out of the way so you can just... listen.

### What Makes This Special

| Differentiator | Why It Matters |
|----------------|----------------|
| **Intelligence First** | Not just a player - AIDJ learns, recommends, and evolves with your taste |
| **Privacy-First Architecture** | Direct connection to your Navidrome - no cloud, no tracking |
| **Nudge Mode** | Steer the vibe without breaking flow - double-tap "more like this" |
| **DJ DNA** | Built with crossfade, BPM matching on the roadmap - not bolted on later |
| **Spotify-Level Polish** | Premium UX for self-hosters - not "developer art" |

### MVP Focus (2 Weeks)

Reliable iOS/Android playback with flawless background audio, library browsing, search, queue management, and polished UI.

### Long-term Vision

A personal AI DJ that knows your taste, grows your library automatically via Lidarr, and creates professional-quality mixes with crossfade and beat matching.

---

## Project Classification

**Technical Type:** Mobile App (React Native/Expo - iOS & Android)
**Domain:** Consumer Entertainment (Music Streaming)
**Complexity:** Standard
**Project Context:** Mobile-first architecture with optional web companion

### Critical Technical Requirement

iOS AVAudioSession with `.playback` category via `react-native-track-player` for uninterrupted background audio. This is the non-negotiable foundation - if background audio fails, the app fails.

### Classification Details

| Aspect | Decision |
|--------|----------|
| **Platform Strategy** | Cross-platform via Expo SDK 54+ |
| **Primary Target** | iOS & Android equal priority |
| **Audio Engine** | react-native-track-player (not expo-av) |
| **API Integration** | REST (Subsonic API via Navidrome) |
| **Web Companion** | Optional future addition, not MVP |
| **Offline Support** | Not MVP, potential v2 feature |
| **Store Distribution** | TestFlight beta → App Store / Play Store |

### Technical Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Expo SDK 54+ |
| **Audio** | react-native-track-player |
| **Navigation** | Expo Router |
| **State** | Zustand |
| **Server State** | TanStack Query |
| **Styling** | NativeWind (Tailwind) |
| **Secure Storage** | expo-secure-store |

---

## Success Criteria

### User Success

**The North Star:** Background audio works reliably for all-day listening with graceful handling of system interruptions.

> *"Play music at 9am, use phone normally, music still playing at 5pm with no manual intervention."*

| Metric | Definition | Target | Timeframe |
|--------|------------|--------|-----------|
| **Background Reliability** | User says "it just works" | No complaints | Week 1 |
| **Daily Driver** | App is primary music player | Used every day | Week 1 post-MVP |
| **No Spotify Regression** | Haven't opened Spotify for music | 0 sessions | Month 1 |
| **Discovery Moments** | Found forgotten songs in own library | 10+ rediscoveries | Month 1 |
| **Nudge Usage** | "More like this" gesture used | Weekly | v1.1 |

**Key "Aha" Moments:**
1. Background audio that actually works on iOS
2. "More like this" instantly shifts the queue
3. First recommendation that's actually good
4. Rediscovering a forgotten track in own library

### Business Success

For a personal/homelab project with community growth potential:

| Objective | Metric | Target |
|-----------|--------|--------|
| **Community Validation** | GitHub stars | 100+ in 3 months |
| **Launch Impact** | r/selfhosted post engagement | 50+ upvotes |
| **Word of Mouth** | Friends/family using it | 3+ users on instance |
| **Sustainability** | Time using vs maintaining | Using > Maintaining |

### Technical Success

**Background Audio Test Matrix:**

| Scenario | Pass Criteria |
|----------|---------------|
| 2-hour background session | No unexpected stops |
| Incoming phone call | Pauses, resumes after call ends |
| Alarm interruption | Pauses, resumes after dismiss |
| Lock/unlock cycle | Continues playing |
| App switch (multitasking) | Continues playing |
| App killed from memory | Continues via iOS audio session |
| Network interruption | Shows clear error, resumes when network returns |

**UI Quality Checklist:**

| Test | Pass Criteria |
|------|---------------|
| Album art rendering | No pixelation, loads <500ms |
| Navigation transitions | <300ms, smooth |
| Scroll performance | 60fps, no jank |
| Touch targets | All buttons >44px |
| Dark mode contrast | All text readable (4.5:1 ratio) |

**Quality Gate:** Would you be proud to show this to a friend? If not, it's not done.

### Measurable Outcomes

**MVP Success (2 weeks):**
- [ ] Background audio passes "Day in the Life" test
- [ ] Library browsing is fast and responsive
- [ ] Search returns results quickly
- [ ] Queue management feels intuitive
- [ ] Lock screen controls work perfectly
- [ ] Now Playing screen looks beautiful
- [ ] No crashes during normal use
- [ ] Setup takes < 5 minutes

**v1.1 Success (1 month post-MVP):**
- [ ] LastFM recommendations are actually good
- [ ] "More like this" influences next songs noticeably
- [ ] Scrobbles appearing in LastFM account
- [ ] Haven't opened Spotify in weeks

**v1.2 Success (2-3 months):**
- [ ] Weekly listening feels curated, not random
- [ ] Lyrics display works for most songs
- [ ] Friends/brother asking how to set it up
- [ ] Never looked back to Spotify

---

## Product Scope

### MVP - Minimum Viable Product (2 Weeks)

**Core Deliverables:**

| Feature | Priority | Acceptance Criteria |
|---------|----------|---------------------|
| Auth (Better Auth) | P0 | Clean login flow, credentials persist |
| Navidrome Connection | P0 | Direct connection, stored in SecureStore |
| Library Browse | P0 | Artist → Album → Song navigation |
| Search | P0 | Search songs/artists/albums |
| Audio Playback | P0 | Play, pause, skip, seek |
| Background Audio | P0 | "Day in the Life" test passes |
| Lock Screen Controls | P0 | Play/pause, skip, previous |
| Queue Management | P0 | View, reorder, remove |
| Scrobble to Navidrome | P1 | Track plays recorded |

**UI Requirements:**
- Now Playing screen is hero (30% of UI effort)
- Purple/indigo dark theme
- Spotify-level polish, not developer art

### Growth Features (Post-MVP)

**v1.0.1 - Polish Sprint (1 week):**
- UI micro-animations
- Haptic feedback refinement
- Edge case polish

**v1.1 - "The Intelligence" (2-4 weeks):**
- LastFM scrobbling
- LastFM recommendations
- "More like this" nudge gesture
- Basic preference learning
- AIDJ personality messages

**v1.2 - "The Experience" (1-2 months):**
- Lyrics (fallback chain)
- Listening recaps (weekly/monthly)
- Smart playlists
- Multi-user profiles

### Vision (Future)

**v2 - "The DJ Dream" (3-6 months):**
- Crossfade transitions
- BPM-aware browsing
- Lidarr integration (discover → download → play)
- Beat matching for seamless mixes
- Pro DJ set-building mode

**Long-term:**
> *"AIDJ becomes the default way you interact with your music. It knows your taste better than any streaming service, grows your library intelligently, and creates mixes that feel like a personal DJ crafted them just for you."*

---

## User Journeys

### Journey 1: Daily Commute (Primary Use Case)

**Persona:** Marcus, daily commuter
**Context:** Morning commute, phone in pocket, earbuds in
**Goal:** Uninterrupted music from door to desk

**Flow:**
1. **6:45 AM** - Marcus unlocks phone, opens AIDJ
2. Sees "Now Playing" screen with last session's queue
3. Taps play - music starts immediately
4. Locks phone, puts in pocket
5. **Lock screen experience:** Album art, play/pause, skip visible
6. Uses lock screen skip button to change song
7. **7:10 AM** - Phone call interrupts
   - Music pauses automatically
   - After call ends, music resumes from same position
8. Continues listening through subway (network drops)
   - Buffered audio continues
   - When signal returns, next song loads seamlessly
9. **8:30 AM** - Arrives at office, pauses via earbuds
10. Later, opens Spotify - realizes they don't need to

**Success Criteria:**
- Zero unexpected stops during 1.5 hour commute
- Lock screen controls work every time
- Phone call handling is seamless
- Network transitions are invisible

---

### Journey 2: First-Time Setup

**Persona:** Alex, new user
**Context:** Just installed app, has Navidrome running
**Goal:** Playing music within 5 minutes

**Flow:**
1. Opens AIDJ for first time
2. Clean welcome screen - "Connect Your Music"
3. Enters Navidrome URL (app validates format)
4. Enters username/password
5. **Connection test:** App shows "Testing connection..."
6. Success! "Found 3,247 songs"
7. Brief onboarding (swipeable, skippable):
   - "Swipe up for queue"
   - "Double-tap for more like this" (v1.1)
   - "Your music, your server, your rules"
8. Lands on Library view
9. Taps first artist, first album, first song
10. Music plays - **first "aha" moment**
11. Locks phone - music continues - **second "aha" moment**

**Success Criteria:**
- Setup completes in under 5 minutes
- No technical jargon in UI
- First song plays within 60 seconds of completing setup
- Onboarding teaches gestures without being annoying

---

### Journey 3: Error Recovery & Edge Cases

**Persona:** Any user
**Context:** Things go wrong
**Goal:** Graceful recovery, never lose user's trust

**Scenarios:**

**A. Network Loss Mid-Song:**
- Current song continues (buffered)
- Next song: "Waiting for connection..." with subtle indicator
- Network returns: Resumes automatically, no user action needed
- Never shows scary technical errors

**B. Server Unreachable:**
- Clear message: "Can't reach your Navidrome server"
- Retry button
- Last successful connection info shown
- Option to check server URL in settings

**C. Phone Call Handling:**
- Music pauses instantly when call starts
- No overlap, no audio glitches
- Resumes 1 second after call ends
- Works for all call types (cellular, FaceTime, WhatsApp)

**D. App Killed From Memory:**
- iOS: Audio session continues via system
- Reopening app: Returns to Now Playing with correct state
- No "where was I?" confusion

**E. Dead Battery Recovery:**
- On next app open: Queue restored
- Current position in song: As close as possible
- Graceful state recovery

**F. Server Reboot (Navidrome restarts):**
- Brief connection error shown
- Automatic retry with exponential backoff
- When server returns, seamless reconnection
- No need to re-enter credentials

**Success Criteria:**
- Every error has a human-readable message
- Recovery is automatic when possible
- User never feels "stuck"
- Technical details hidden but available if needed

---

### Journey 4: First Week Trust Building

**Persona:** Jamie, skeptical user
**Context:** Week 1 of using AIDJ, comparing to Spotify
**Goal:** Become daily driver

**Day-by-Day:**

**Day 1:** Setup, plays familiar albums, tests background audio
**Day 2:** Tries queue management, reorders songs, removes some
**Day 3:** Uses search for first time - finds obscure track quickly
**Day 4:** Shows friend the app - **demo moment**
- Friend asks "Is that Spotify?"
- Jamie says "No, it's my own server"
- **Pride moment** - app looks premium, not "developer project"

**Day 5:** Long listening session (3+ hours) - no issues
**Day 6:** Tries to break it - rapid skipping, app switching
**Day 7:** Realizes they haven't opened Spotify all week

**Trust Signals:**
- Consistent behavior (no surprises)
- Beautiful UI (not embarrassing to show)
- Lock screen always works
- Search is fast and accurate
- Queue behaves predictably

---

### Journey 5: Library Exploration

**Persona:** Taylor, large library owner (10,000+ songs)
**Context:** Wants to rediscover forgotten music
**Goal:** Find something they haven't heard in years

**Flow:**
1. Opens Library tab
2. Scrolls through Artists (smooth, no jank)
3. Alphabetical index on side for quick jumping
4. Taps random artist from years ago
5. Sees album grid - art loads quickly
6. Taps album - sees track list
7. **"Oh, I forgot about this album!"**
8. Long-press song → "Play Album" / "Add to Queue"
9. Chooses "Play Album"
10. Explores more artists while current album plays
11. Builds mental list of albums to revisit

**Success Criteria:**
- Scrolling 1000+ artists is smooth
- Album art loads progressively (placeholder → real)
- Navigation is intuitive (back button always works)
- Can browse while playing without interruption
- Long-press reveals contextual options

---

## Domain Requirements

### Domain Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     AIDJ Mobile Domain                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │   Artist    │────▶│   Album     │────▶│    Song     │       │
│  │             │ 1:N │             │ 1:N │             │       │
│  │ - id        │     │ - id        │     │ - id        │       │
│  │ - name      │     │ - title     │     │ - title     │       │
│  │ - imageUrl  │     │ - artistId  │     │ - albumId   │       │
│  │ - genres[]  │     │ - year      │     │ - duration  │       │
│  └─────────────┘     │ - coverArt  │     │ - track#    │       │
│                      │ - songCount │     │ - streamUrl │       │
│                      └─────────────┘     └─────────────┘       │
│                                                 │               │
│  ┌─────────────┐     ┌─────────────┐           │               │
│  │   Queue     │◀────│ QueueItem   │◀──────────┘               │
│  │             │ 1:N │             │                            │
│  │ - items[]   │     │ - song      │                            │
│  │ - current   │     │ - position  │                            │
│  │ - shuffle   │     │ - addedAt   │                            │
│  │ - repeat    │     └─────────────┘                            │
│  └─────────────┘                                                │
│        │                                                        │
│        ▼                                                        │
│  ┌─────────────┐     ┌─────────────┐                           │
│  │ PlaybackState│    │  Connection │                           │
│  │             │     │             │                           │
│  │ - isPlaying │     │ - serverUrl │                           │
│  │ - position  │     │ - username  │                           │
│  │ - duration  │     │ - status    │                           │
│  │ - buffering │     │ - lastSync  │                           │
│  └─────────────┘     └─────────────┘                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Core Entities

| Entity | Description | Source |
|--------|-------------|--------|
| **Artist** | Music creator with associated albums | Navidrome API |
| **Album** | Collection of songs with shared metadata | Navidrome API |
| **Song** | Individual playable track | Navidrome API |
| **Queue** | Ordered list of songs to play | Local state |
| **PlaybackState** | Current playback status and position | Local + Track Player |
| **Connection** | Navidrome server configuration | SecureStore |
| **User** | Authenticated app user | Better Auth |

### Business Rules

**Playback Rules:**
1. Only one song plays at a time
2. Queue must have at least one song to start playback
3. When queue ends: stop (no auto-repeat by default)
4. Skip forward always advances; skip back within 3s restarts current song
5. Shuffle randomizes remaining queue, not played songs

**Connection Rules:**
1. Server URL must be valid HTTPS (or HTTP for local/LAN)
2. Credentials stored encrypted in SecureStore
3. Connection validated on app launch
4. Auto-reconnect on network recovery

**Scrobbling Rules:**
1. Scrobble after 50% of song OR 4 minutes (whichever first)
2. Skip before threshold: no scrobble
3. Scrobble to Navidrome immediately
4. LastFM scrobbling (v1.1): queue if offline, send when connected

**Queue Rules:**
1. Playing a song clears queue and adds that song
2. "Add to Queue" appends without disrupting playback
3. "Play Next" inserts after current song
4. Reordering preserves currently playing song
5. Queue persists across app restarts

### Data Flow

```
┌──────────┐     ┌──────────────┐     ┌────────────────┐
│ Navidrome│◀───▶│ AIDJ Mobile  │◀───▶│ Track Player   │
│  Server  │ REST│   App        │ RN  │  (Background)  │
└──────────┘     └──────────────┘     └────────────────┘
                        │
                        ▼
                 ┌──────────────┐
                 │  SecureStore │
                 │  (Encrypted) │
                 └──────────────┘
```

**MVP Data Sources:**
- **Navidrome API**: All music metadata, streaming URLs, scrobbles
- **SecureStore**: Server credentials, connection config
- **Zustand + MMKV**: Queue state, playback preferences, UI state
- **Track Player**: Audio session, lock screen, remote controls

### Glossary

| Term | Definition |
|------|------------|
| **Scrobble** | Recording a song play (after threshold) |
| **Queue** | Upcoming songs list |
| **Now Playing** | Currently active/paused song |
| **Nudge** | "More like this" gesture to influence recommendations (v1.1) |
| **Background Audio** | Playback that continues when app is not in foreground |
| **Lock Screen Controls** | iOS/Android media controls on lock screen |
| **Subsonic API** | REST protocol used by Navidrome |

---

## Functional Requirements

### FR-1: Authentication & Connection

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-1.1 | User can log in with Better Auth | P0 | Email/password login works |
| FR-1.2 | User can configure Navidrome server | P0 | URL + credentials stored securely |
| FR-1.3 | App validates Navidrome connection | P0 | Shows success/error clearly |
| FR-1.4 | Credentials persist across app restarts | P0 | No re-login required after close |
| FR-1.5 | User can disconnect/change server | P1 | Settings option to reconfigure |
| FR-1.6 | Connection status indicator | P1 | Visual feedback when connected/disconnected |

### FR-2: Library Browsing

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-2.1 | Browse all artists alphabetically | P0 | Scrollable list, A-Z index |
| FR-2.2 | View artist's albums | P0 | Grid/list of albums with art |
| FR-2.3 | View album's songs | P0 | Track list with duration, number |
| FR-2.4 | Pull to refresh library | P1 | Manual sync with Navidrome |
| FR-2.5 | Album art displayed throughout | P0 | Cover art on albums, songs, now playing |
| FR-2.6 | Recently played quick access | P2 | Quick access to recent history |

### FR-3: Search

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-3.1 | Global search across library | P0 | Single search bar, searches all |
| FR-3.2 | Search artists | P0 | Finds artists by name |
| FR-3.3 | Search albums | P0 | Finds albums by title |
| FR-3.4 | Search songs | P0 | Finds songs by title |
| FR-3.5 | Instant results as you type | P1 | Results appear while typing |
| FR-3.6 | Clear recent searches | P2 | Option to clear search history |

### FR-4: Audio Playback

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-4.1 | Play/Pause toggle | P0 | Single tap toggles state |
| FR-4.2 | Skip to next song | P0 | Advances to next in queue |
| FR-4.3 | Skip to previous song | P0 | Within 3s: restart, after: previous |
| FR-4.4 | Seek within song | P0 | Drag progress bar |
| FR-4.5 | Background audio playback | P0 | Continues when app backgrounded |
| FR-4.6 | Lock screen controls | P0 | Play/pause/skip from lock screen |
| FR-4.7 | Control Center integration (iOS) | P0 | Shows in iOS Control Center |
| FR-4.8 | Notification controls (Android) | P0 | Persistent notification with controls |
| FR-4.9 | Headphone button support | P1 | Play/pause from headphone buttons |
| FR-4.10 | CarPlay/Android Auto (basic) | P2 | Basic playback in car systems |

### FR-5: Queue Management

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-5.1 | View current queue | P0 | See upcoming songs |
| FR-5.2 | Reorder queue items | P0 | Drag to reorder |
| FR-5.3 | Remove song from queue | P0 | Swipe or button to remove |
| FR-5.4 | Clear entire queue | P1 | One-tap clear all |
| FR-5.5 | Add song to end of queue | P0 | "Add to Queue" action |
| FR-5.6 | Play song next | P0 | "Play Next" action |
| FR-5.7 | Shuffle toggle | P1 | Randomize remaining queue |
| FR-5.8 | Repeat mode (off/one/all) | P1 | Toggle repeat behavior |
| FR-5.9 | Queue persists across restarts | P0 | Resume where left off |

### FR-6: Now Playing

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-6.1 | Display current song info | P0 | Title, artist, album |
| FR-6.2 | Display album art (large) | P0 | High-quality cover image |
| FR-6.3 | Progress indicator | P0 | Elapsed/remaining time |
| FR-6.4 | Mini player (collapsed) | P0 | Persistent bar when browsing |
| FR-6.5 | Expand mini to full player | P0 | Swipe up or tap to expand |
| FR-6.6 | Swipe gestures for skip | P1 | Swipe left/right to skip |

### FR-7: Scrobbling

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-7.1 | Scrobble to Navidrome | P1 | Plays recorded in Navidrome |
| FR-7.2 | Scrobble threshold (50%/4min) | P1 | Only scrobbles after threshold |
| FR-7.3 | Now Playing submission | P2 | Shows "now playing" in Navidrome |

### FR-8: Settings

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-8.1 | View connection settings | P0 | See current server config |
| FR-8.2 | Edit connection settings | P1 | Change server URL/credentials |
| FR-8.3 | Log out | P1 | Clear credentials, return to login |
| FR-8.4 | App version display | P2 | Show current app version |

### Feature Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| **P0** | 26 | Must have for MVP - app doesn't work without these |
| **P1** | 11 | Should have - significantly improves experience |
| **P2** | 5 | Nice to have - polish features |

---

## Non-Functional Requirements

### NFR-1: Performance

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| NFR-1.1 | App launch time | <3 seconds | Cold start to interactive |
| NFR-1.2 | Song start latency | <2 seconds | Tap to audio playing |
| NFR-1.3 | Search response | <500ms | Keystroke to results |
| NFR-1.4 | Navigation transitions | <300ms | Screen to screen |
| NFR-1.5 | Album art load | <500ms | Placeholder to image |
| NFR-1.6 | List scroll | 60fps | No frame drops during scroll |
| NFR-1.7 | Memory usage | <200MB | Normal operation |
| NFR-1.8 | Battery impact | <5%/hour | Background playback |

### NFR-2: Reliability

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| NFR-2.1 | Background audio uptime | 99.9% | No unexpected stops |
| NFR-2.2 | Crash rate | <0.1% | Sessions without crash |
| NFR-2.3 | Network recovery | Automatic | Resume after connectivity loss |
| NFR-2.4 | State persistence | 100% | Queue survives app restart |
| NFR-2.5 | Phone call recovery | 100% | Resume after call ends |
| NFR-2.6 | Alarm recovery | 100% | Resume after alarm dismissed |

### NFR-3: Security

| ID | Requirement | Priority | Implementation |
|----|-------------|----------|----------------|
| NFR-3.1 | Credential encryption | P0 | expo-secure-store (Keychain/Keystore) |
| NFR-3.2 | No plaintext secrets | P0 | Never log or store unencrypted |
| NFR-3.3 | HTTPS preferred | P0 | Warn on HTTP (allow for LAN) |
| NFR-3.4 | Session management | P1 | Better Auth handles tokens |
| NFR-3.5 | No analytics/tracking | P0 | Privacy-first, no telemetry |

### NFR-4: Compatibility

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-4.1 | iOS version | iOS 15.1+ |
| NFR-4.2 | Android version | API 24+ (Android 7.0) |
| NFR-4.3 | Navidrome version | 0.49.0+ (Subsonic API) |
| NFR-4.4 | Screen sizes | Phone only (MVP), tablet stretch |
| NFR-4.5 | Orientation | Portrait only (MVP) |

### NFR-5: Usability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-5.1 | Touch targets | ≥44x44pt (iOS), ≥48x48dp (Android) |
| NFR-5.2 | Contrast ratio | ≥4.5:1 for text |
| NFR-5.3 | Loading indicators | For any operation >300ms |
| NFR-5.4 | Error messages | Human-readable, actionable |
| NFR-5.5 | Onboarding time | <5 minutes to first song |

### NFR-6: Scalability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-6.1 | Library size | 50,000+ songs smooth |
| NFR-6.2 | Queue size | 1,000+ songs |
| NFR-6.3 | Search corpus | Full library indexed |
| NFR-6.4 | Concurrent streams | 1 (single user) |

### NFR-7: Maintainability

| ID | Requirement | Implementation |
|----|-------------|----------------|
| NFR-7.1 | Code structure | Feature-based organization |
| NFR-7.2 | Type safety | TypeScript strict mode |
| NFR-7.3 | State management | Zustand with clear boundaries |
| NFR-7.4 | API abstraction | Service layer isolates Navidrome |
| NFR-7.5 | Error boundaries | React error boundaries throughout |

---

## UX Requirements

### Design System

**Theme:** Dark-first with purple/indigo accents
**Inspiration:** Spotify's polish, Apple Music's elegance, but uniquely AIDJ

#### Color Palette

| Role | Color | Usage |
|------|-------|-------|
| **Background Primary** | `#0a0118` | Main app background |
| **Background Secondary** | `#1a0f2e` | Cards, elevated surfaces |
| **Surface** | `#2d1b4e` | Interactive elements |
| **Primary Accent** | `#8b5cf6` | Buttons, highlights |
| **Secondary Accent** | `#6366f1` | Secondary actions |
| **Text Primary** | `#ffffff` | Headlines, important text |
| **Text Secondary** | `#a1a1aa` | Descriptions, metadata |
| **Success** | `#22c55e` | Positive feedback |
| **Error** | `#ef4444` | Errors, warnings |

#### Typography

| Element | Size | Weight | Usage |
|---------|------|--------|-------|
| **H1** | 32pt | Bold | Screen titles |
| **H2** | 24pt | Semibold | Section headers |
| **H3** | 18pt | Medium | Card titles |
| **Body** | 16pt | Regular | Primary content |
| **Caption** | 14pt | Regular | Secondary info |
| **Micro** | 12pt | Medium | Timestamps, metadata |

### Screen Hierarchy

```
┌─────────────────────────────────────────┐
│              Navigation                  │
│  ┌─────────────────────────────────────┐│
│  │                                     ││
│  │         CONTENT AREA                ││
│  │                                     ││
│  │                                     ││
│  │                                     ││
│  │                                     ││
│  │                                     ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │         MINI PLAYER                 ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │    Home  |  Search  |  Library      ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

### Screen Specifications

#### Now Playing (Hero Screen - 30% UI Effort)

**Layout:**
- Full-screen album art (with gradient overlay)
- Song title (large, prominent)
- Artist name (secondary)
- Album name (tertiary, tappable)
- Progress bar with timestamps
- Play/Pause (center, large)
- Skip Previous/Next (flanking)
- Queue button (top right)
- Collapse/down arrow (top left)

**Interactions:**
- Swipe down: Collapse to mini player
- Tap album art: Toggle controls visibility
- Long press album art: Show album info
- Swipe left/right: Skip prev/next (P1)

**Visual Details:**
- Album art: Rounded corners (16px)
- Gradient: Bottom fade to enable text readability
- Progress bar: Purple accent, scrubable
- Touch targets: 48px minimum

#### Mini Player

**Layout:**
- Fixed at bottom, above tab bar
- Album art thumbnail (40x40)
- Song title (truncated)
- Play/Pause button
- Progress indicator (thin line)

**Interactions:**
- Tap anywhere: Expand to full Now Playing
- Tap play/pause: Toggle without expanding
- Swipe up: Expand (gesture)

#### Library Screen

**Tabs:** Artists | Albums | Songs (horizontal scroll)

**Artists View:**
- Alphabetical list
- Artist avatar (circular)
- Artist name
- Album count badge
- A-Z quick scroll index (right edge)

**Albums View:**
- Grid layout (2 columns)
- Album cover (square, rounded)
- Album title below
- Artist name (caption)

**Songs View:**
- List layout
- Track number
- Song title
- Artist - Album (caption)
- Duration

#### Search Screen

**Layout:**
- Search bar (always visible, top)
- Recent searches (when empty)
- Results categorized: Artists, Albums, Songs
- "See All" for each category

**Interactions:**
- Auto-focus search bar on tab
- Instant results as typing
- Tap result: Navigate to item
- Long press: Show context menu

#### Queue Screen

**Access:** Tap queue icon from Now Playing

**Layout:**
- "Now Playing" highlighted at top
- "Up Next" section with upcoming songs
- Drag handles for reorder
- Swipe to remove

**Actions:**
- Clear Queue button
- Shuffle toggle
- Repeat mode toggle

### Interaction Patterns

| Pattern | Implementation |
|---------|----------------|
| **Tap** | Primary action on buttons, list items |
| **Long Press** | Context menu (Play, Play Next, Add to Queue) |
| **Swipe Horizontal** | Delete (queue items) |
| **Swipe Vertical** | Expand/collapse Now Playing |
| **Pull Down** | Refresh (library) |
| **Drag** | Reorder queue |

### Animation Guidelines

| Element | Duration | Easing |
|---------|----------|--------|
| Screen transitions | 250ms | ease-out |
| Button press | 100ms | ease-in-out |
| Mini player expand | 300ms | spring |
| List item appear | 150ms | ease-out |
| Loading pulse | 1.5s | infinite |

### Accessibility

| Requirement | Implementation |
|-------------|----------------|
| VoiceOver/TalkBack | All interactive elements labeled |
| Dynamic Type | Text scales with system setting |
| Reduce Motion | Respect system animation preference |
| Color Contrast | 4.5:1 minimum for text |
| Touch Targets | 44pt minimum on iOS, 48dp on Android |

### Error States

| State | Visual Treatment |
|-------|------------------|
| **No Connection** | Banner with retry button |
| **Loading** | Skeleton UI, not spinners |
| **Empty State** | Illustration + helpful message |
| **Error** | Red accent, clear message, retry option |
| **Offline** | Muted UI, "Offline" badge |

### Empty States

| Screen | Message | Action |
|--------|---------|--------|
| **Library Empty** | "Your library is empty" | Check connection |
| **Search No Results** | "No matches found" | Suggest alternatives |
| **Queue Empty** | "Nothing queued" | Browse library |

---

## Technical Requirements

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AIDJ Mobile App                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Presentation Layer                        │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │   │
│  │  │  Screens │  │Components│  │  Hooks   │  │Navigation│    │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     State Layer                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │   │
│  │  │   Zustand    │  │TanStack Query│  │ Track Player │      │   │
│  │  │ (UI State)   │  │(Server State)│  │   (Audio)    │      │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Service Layer                             │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │   │
│  │  │  Navidrome   │  │    Auth      │  │   Storage    │      │   │
│  │  │   Service    │  │   Service    │  │   Service    │      │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
        │ Navidrome │   │Better Auth│   │SecureStore│
        │  Server   │   │  Server   │   │  (Local)  │
        └───────────┘   └───────────┘   └───────────┘
```

### Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Framework** | Expo | SDK 54+ | Cross-platform foundation |
| **Language** | TypeScript | 5.x | Type safety |
| **UI** | React Native | 0.76+ | Native components |
| **Navigation** | Expo Router | 4.x | File-based routing |
| **Styling** | NativeWind | 4.x | Tailwind for RN |
| **Audio** | react-native-track-player | 4.x | Background audio |
| **UI State** | Zustand | 5.x | Simple state management |
| **Server State** | TanStack Query | 5.x | Caching, sync |
| **Storage** | expo-secure-store | Latest | Encrypted credentials |
| **Persistence** | MMKV | Latest | Fast local storage |

### Project Structure

```
aidj-mobile/
├── app/                      # Expo Router screens
│   ├── (tabs)/               # Tab-based navigation
│   │   ├── index.tsx         # Home/Now Playing
│   │   ├── search.tsx        # Search screen
│   │   └── library.tsx       # Library screen
│   ├── (auth)/               # Auth flow
│   │   ├── login.tsx         # Login screen
│   │   └── setup.tsx         # Navidrome setup
│   ├── artist/[id].tsx       # Artist detail
│   ├── album/[id].tsx        # Album detail
│   ├── queue.tsx             # Queue management
│   └── _layout.tsx           # Root layout
├── components/               # Reusable components
│   ├── ui/                   # Base UI components
│   ├── player/               # Player-related
│   │   ├── MiniPlayer.tsx
│   │   ├── NowPlaying.tsx
│   │   └── Controls.tsx
│   ├── library/              # Library-related
│   └── common/               # Shared components
├── lib/                      # Core logic
│   ├── services/             # API services
│   │   ├── navidrome.ts      # Navidrome API client
│   │   ├── auth.ts           # Better Auth client
│   │   └── track-player.ts   # Audio service
│   ├── stores/               # Zustand stores
│   │   ├── player.ts         # Playback state
│   │   ├── queue.ts          # Queue state
│   │   └── settings.ts       # App settings
│   ├── hooks/                # Custom hooks
│   │   ├── usePlayer.ts
│   │   ├── useQueue.ts
│   │   └── useNapidromeQuery.ts
│   └── utils/                # Utilities
├── constants/                # App constants
│   ├── colors.ts             # Color palette
│   └── config.ts             # App config
└── types/                    # TypeScript types
    ├── navidrome.ts          # Navidrome API types
    └── player.ts             # Player types
```

### Critical Implementation: Background Audio

**react-native-track-player Configuration:**

```typescript
// Must be registered in index.js BEFORE expo-router
import TrackPlayer from 'react-native-track-player';

TrackPlayer.registerPlaybackService(() => require('./lib/services/playback'));

// Playback service (runs in background)
module.exports = async function() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => TrackPlayer.seekTo(e.position));
};
```

**iOS Requirements (app.json):**
```json
{
  "ios": {
    "infoPlist": {
      "UIBackgroundModes": ["audio"]
    }
  }
}
```

**Android Requirements:**
- Foreground service notification (handled by react-native-track-player)
- `WAKE_LOCK` permission (automatic)

### API Integration: Navidrome/Subsonic

**Base Endpoints Used:**

| Endpoint | Purpose | MVP |
|----------|---------|-----|
| `ping` | Connection test | Yes |
| `getArtists` | Artist list | Yes |
| `getArtist` | Artist detail | Yes |
| `getAlbum` | Album detail | Yes |
| `search3` | Global search | Yes |
| `stream` | Audio streaming | Yes |
| `getCoverArt` | Album artwork | Yes |
| `scrobble` | Record play | Yes |

**Authentication:**
- Username + password → MD5 token
- Token sent with every request as query params
- Stored encrypted in SecureStore

### State Management Strategy

| State Type | Solution | Persistence |
|------------|----------|-------------|
| **UI State** | Zustand | Session only |
| **Queue** | Zustand + MMKV | Persisted |
| **Server Data** | TanStack Query | Cache |
| **Credentials** | SecureStore | Encrypted |
| **Playback** | Track Player | OS-managed |

### Error Handling Strategy

```typescript
// API errors
try {
  const result = await navidromeService.getArtists();
} catch (error) {
  if (error instanceof NetworkError) {
    // Show offline banner
  } else if (error instanceof AuthError) {
    // Redirect to login
  } else {
    // Generic error toast
  }
}

// Audio errors
TrackPlayer.addEventListener(Event.PlaybackError, (error) => {
  // Log error, show toast, try next track
});
```

### Testing Strategy

| Type | Tool | Coverage Target |
|------|------|-----------------|
| **Unit** | Jest | Services, hooks |
| **Component** | React Native Testing Library | UI components |
| **E2E** | Detox (v2) | Critical flows |
| **Manual** | Device testing | Background audio matrix |

### Build & Distribution

| Stage | Method |
|-------|--------|
| **Development** | Expo Go (limited), Dev Client |
| **iOS Beta** | TestFlight via EAS Build |
| **Android Beta** | APK/Internal Testing |
| **Production** | App Store / Play Store |

**EAS Build Configuration:**
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

### Dependencies (MVP)

```json
{
  "dependencies": {
    "expo": "~54.0.0",
    "expo-router": "~4.0.0",
    "expo-secure-store": "~14.0.0",
    "react-native-track-player": "^4.1.0",
    "zustand": "^5.0.0",
    "@tanstack/react-query": "^5.0.0",
    "nativewind": "^4.0.0",
    "react-native-mmkv": "^3.0.0",
    "react-native-gesture-handler": "~2.20.0",
    "react-native-reanimated": "~3.16.0"
  }
}
```

---

## Epic Breakdown

### Epic 1: Project Foundation

**Goal:** Establish project structure and core infrastructure
**Dependencies:** None

| Story | Description | Priority | Points |
|-------|-------------|----------|--------|
| 1.1 | Initialize Expo project with SDK 54+ | P0 | 2 |
| 1.2 | Configure TypeScript strict mode | P0 | 1 |
| 1.3 | Set up NativeWind (Tailwind) | P0 | 2 |
| 1.4 | Configure Expo Router navigation | P0 | 2 |
| 1.5 | Set up Zustand stores structure | P0 | 2 |
| 1.6 | Configure TanStack Query | P0 | 2 |
| 1.7 | Create base UI component library | P0 | 3 |
| 1.8 | Set up color theme constants | P0 | 1 |

**Acceptance Criteria:**
- App builds and runs on iOS simulator and Android emulator
- Navigation between placeholder screens works
- Dark theme applied throughout
- TypeScript compilation with no errors

---

### Epic 2: Authentication & Connection

**Goal:** User can log in and connect to Navidrome
**Dependencies:** Epic 1

| Story | Description | Priority | Points |
|-------|-------------|----------|--------|
| 2.1 | Create login screen UI | P0 | 3 |
| 2.2 | Integrate Better Auth client | P0 | 3 |
| 2.3 | Create Navidrome setup screen | P0 | 3 |
| 2.4 | Implement Navidrome connection test | P0 | 2 |
| 2.5 | Store credentials in SecureStore | P0 | 2 |
| 2.6 | Auto-login on app launch | P0 | 2 |
| 2.7 | Connection error handling | P0 | 2 |
| 2.8 | Logout functionality | P1 | 1 |

**Acceptance Criteria:**
- User can create account / log in
- User can enter Navidrome URL and credentials
- Connection validated with "ping" endpoint
- Credentials persist across app restarts
- Clear error messages on failure

---

### Epic 3: Core Audio Playback

**Goal:** Background audio that "just works"
**Dependencies:** Epic 2

| Story | Description | Priority | Points |
|-------|-------------|----------|--------|
| 3.1 | Integrate react-native-track-player | P0 | 5 |
| 3.2 | Configure iOS background audio mode | P0 | 3 |
| 3.3 | Configure Android foreground service | P0 | 3 |
| 3.4 | Implement play/pause/skip controls | P0 | 3 |
| 3.5 | Implement seek functionality | P0 | 2 |
| 3.6 | Lock screen controls integration | P0 | 3 |
| 3.7 | Phone call interruption handling | P0 | 3 |
| 3.8 | Network error recovery | P0 | 3 |
| 3.9 | Playback state persistence | P0 | 3 |

**Acceptance Criteria:**
- Audio plays from Navidrome stream URLs
- Background playback continues indefinitely
- Lock screen shows album art and controls
- Phone calls pause/resume correctly
- "Day in the Life" test passes

---

### Epic 4: Queue Management

**Goal:** Intuitive queue with persistence
**Dependencies:** Epic 3

| Story | Description | Priority | Points |
|-------|-------------|----------|--------|
| 4.1 | Create queue data model | P0 | 2 |
| 4.2 | Implement "Play" (replace queue) | P0 | 2 |
| 4.3 | Implement "Add to Queue" | P0 | 2 |
| 4.4 | Implement "Play Next" | P0 | 2 |
| 4.5 | Create queue screen UI | P0 | 3 |
| 4.6 | Implement drag-to-reorder | P0 | 3 |
| 4.7 | Implement swipe-to-remove | P0 | 2 |
| 4.8 | Queue persistence with MMKV | P0 | 3 |
| 4.9 | Shuffle toggle | P1 | 2 |
| 4.10 | Repeat mode toggle | P1 | 2 |

**Acceptance Criteria:**
- Queue visible and manageable
- Drag reorder works smoothly
- Queue survives app restart
- Currently playing song highlighted

---

### Epic 5: Now Playing Screen

**Goal:** Beautiful, functional hero screen
**Dependencies:** Epic 3, Epic 4

| Story | Description | Priority | Points |
|-------|-------------|----------|--------|
| 5.1 | Create full Now Playing layout | P0 | 5 |
| 5.2 | Album art display with gradient | P0 | 3 |
| 5.3 | Playback controls component | P0 | 3 |
| 5.4 | Progress bar with seek | P0 | 3 |
| 5.5 | Create Mini Player component | P0 | 3 |
| 5.6 | Mini to full expand animation | P0 | 3 |
| 5.7 | Swipe gestures for skip | P1 | 2 |
| 5.8 | Queue button integration | P0 | 1 |

**Acceptance Criteria:**
- Now Playing screen is visually polished
- Mini player visible when browsing
- Smooth expand/collapse transition
- Progress bar accurate and scrubbable
- "Would show to a friend" quality

---

### Epic 6: Library Browsing

**Goal:** Fast, smooth library navigation
**Dependencies:** Epic 2

| Story | Description | Priority | Points |
|-------|-------------|----------|--------|
| 6.1 | Create Navidrome API service | P0 | 5 |
| 6.2 | Artist list with TanStack Query | P0 | 3 |
| 6.3 | Artist list UI with A-Z index | P0 | 3 |
| 6.4 | Artist detail screen | P0 | 3 |
| 6.5 | Album grid/list view | P0 | 3 |
| 6.6 | Album detail screen | P0 | 3 |
| 6.7 | Song list component | P0 | 2 |
| 6.8 | Album art caching | P0 | 2 |
| 6.9 | Long-press context menu | P0 | 3 |
| 6.10 | Pull-to-refresh | P1 | 1 |

**Acceptance Criteria:**
- Browse Artist → Album → Songs
- Scrolling 1000+ items is smooth (60fps)
- Album art loads progressively
- Long press shows play options

---

### Epic 7: Search

**Goal:** Fast, accurate search across library
**Dependencies:** Epic 6

| Story | Description | Priority | Points |
|-------|-------------|----------|--------|
| 7.1 | Create search screen UI | P0 | 3 |
| 7.2 | Integrate Navidrome search3 API | P0 | 3 |
| 7.3 | Instant results as typing | P1 | 2 |
| 7.4 | Categorized results display | P0 | 3 |
| 7.5 | Search result navigation | P0 | 2 |
| 7.6 | Recent searches (local) | P2 | 2 |

**Acceptance Criteria:**
- Search returns results in <500ms
- Results grouped by Artist/Album/Song
- Tap result navigates correctly
- Search works across all content types

---

### Epic 8: Scrobbling

**Goal:** Record plays to Navidrome
**Dependencies:** Epic 3

| Story | Description | Priority | Points |
|-------|-------------|----------|--------|
| 8.1 | Implement scrobble threshold logic | P1 | 2 |
| 8.2 | Integrate Navidrome scrobble API | P1 | 2 |
| 8.3 | "Now Playing" submission | P2 | 1 |
| 8.4 | Scrobble retry on failure | P1 | 2 |

**Acceptance Criteria:**
- Plays recorded in Navidrome after threshold
- Skips don't count as scrobbles
- Failed scrobbles retry automatically

---

### Epic 9: Polish & QA

**Goal:** Production-ready quality
**Dependencies:** All previous epics

| Story | Description | Priority | Points |
|-------|-------------|----------|--------|
| 9.1 | Error boundary implementation | P0 | 2 |
| 9.2 | Loading states throughout | P0 | 2 |
| 9.3 | Empty states with illustrations | P1 | 2 |
| 9.4 | Haptic feedback | P1 | 1 |
| 9.5 | Animation refinement | P1 | 3 |
| 9.6 | Background audio test matrix | P0 | 3 |
| 9.7 | Performance optimization | P0 | 3 |
| 9.8 | App icon and splash screen | P0 | 2 |
| 9.9 | TestFlight/Beta distribution | P0 | 3 |

**Acceptance Criteria:**
- All background audio scenarios pass
- No crashes in normal usage
- Animations feel native
- Ready for TestFlight submission

---

## Implementation Order

**Phase 1: Foundation (Stories 1.1-1.8, 2.1-2.7)**
- Project setup
- Auth + Navidrome connection

**Phase 2: Core Audio (Stories 3.1-3.9)**
- This is the make-or-break phase
- Background audio must work perfectly

**Phase 3: Queue + Now Playing (Stories 4.1-4.10, 5.1-5.8)**
- Queue management
- Hero UI screens

**Phase 4: Library + Search (Stories 6.1-6.10, 7.1-7.6)**
- Library browsing
- Search functionality

**Phase 5: Polish (Stories 8.1-8.4, 9.1-9.9)**
- Scrobbling
- Quality assurance
- TestFlight release

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Background audio doesn't work on iOS | Critical | Medium | Test early, use proven react-native-track-player patterns |
| Expo SDK limitations | High | Low | Use development build, not Expo Go |
| Navidrome API quirks | Medium | Medium | Comprehensive error handling |
| Performance with large libraries | Medium | Medium | Pagination, virtualized lists |
| Auth flow complexity | Medium | Low | Better Auth is well-documented |

---

## Open Questions

1. **CarPlay/Android Auto**: Include in MVP or defer to v1.1?
   - *Recommendation: Defer*

2. **Tablet Layout**: Support tablets in MVP?
   - *Recommendation: Phone-only MVP, tablet stretch goal*

3. **Offline Mode**: Cache songs for offline?
   - *Recommendation: Not MVP, significant complexity*

4. **Multiple Servers**: Support multiple Navidrome instances?
   - *Recommendation: Single server MVP, v2 feature*

---

## Document Status

| Section | Status |
|---------|--------|
| Executive Summary | Complete |
| Project Classification | Complete |
| Success Criteria | Complete |
| Product Scope | Complete |
| User Journeys | Complete |
| Domain Requirements | Complete |
| Functional Requirements | Complete |
| Non-Functional Requirements | Complete |
| UX Requirements | Complete |
| Technical Requirements | Complete |
| Epic Breakdown | Complete |

**PRD Status:** Ready for Architecture Phase

**Next Steps:**
1. Create Architecture Document (technical decisions)
2. Create UX Design Document (wireframes, flows)
3. Begin Epic 1 implementation

