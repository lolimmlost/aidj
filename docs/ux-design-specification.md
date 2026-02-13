---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments: ['docs/prd-aidj-mobile.md', 'docs/architecture-mobile.md', 'docs/epics.md', 'docs/analysis/product-brief-aidj-mobile-2025-12-14.md']
workflowType: 'ux-design'
lastStep: 8
status: complete
project_name: 'AIDJ Mobile'
user_name: 'Dev Gansta'
date: '2025-12-14'
---

# UX Design Specification - AIDJ Mobile

**Author:** Dev Gansta
**Date:** 2025-12-14

---

## Executive Summary

### Project Vision

AIDJ Mobile is a premium native music streaming app for iOS and Android that connects to self-hosted Navidrome servers. The app prioritizes reliable background audio playback, an immersive Now Playing experience, and intuitive queue management. It's designed for music enthusiasts who want a polished, consumer-grade mobile experience for their self-hosted music libraries.

### Target Users

**Primary Persona: The Self-Hosted Music Enthusiast**

- Runs their own Navidrome server with a personal music collection
- Tech-savvy enough to self-host, but expects polished mobile UX
- Uses the app during commutes, workouts, and work sessions
- Interacts primarily via lock screen and notification controls
- Frustrated by existing clients that lack reliability or polish
- Has muscle memory from mainstream apps (Spotify, Apple Music, Plexamp)

**Usage Context:**
- 70% of playback control happens outside the app (lock screen, notifications, headphone buttons)
- Queue management is frequent - users curate listening sessions
- Library browsing happens in short bursts to find specific music
- App must "just work" in background for hours at a time

**Competitive Context:**
The real competition isn't other Navidrome clients - it's mainstream apps like Spotify and Apple Music. Users bring expectations and muscle memory from these apps. UX must respect conventions while establishing its own identity.

### Key Design Challenges

1. **Mini Player ↔ Full Player Transition**: The most-used transition must feel premium, smooth, and interruptible (<300ms). Animation timing should mask async operations like color extraction.

2. **Out-of-App Experience Harmony**: In-app UX must complement lock screen and notification controls, not create cognitive dissonance.

3. **Queue Complexity Balance**: Support power features (drag/reorder, swipe/remove) while keeping simple actions discoverable. Large queues (500+ songs) require virtualized lists.

4. **Perceived Performance at Scale**: 50,000+ song libraries require skeleton loading, progressive disclosure, and smart caching to feel fast.

5. **Empty State Guidance**: Skippable onboarding means every empty state must guide users to setup without friction.

6. **Gesture Language Consistency**: Define a coherent gesture vocabulary across the app:
   - Long-press for context menus
   - Swipe directions in queue vs. Now Playing
   - Pull-down to dismiss modals
   - Swipe on album art for skip

7. **Familiarity Without Copying**: Respect mainstream app conventions (mini player at bottom, recognizable queue icon, skip-previous restart behavior) while finding our own identity.

### Design Opportunities

1. **Dynamic Album Art Theming**: Dominant color extraction creates an immersive, personalized Now Playing experience unique to each album.

   **Accessibility Constraint (NFR-5.2):** Must maintain ≥4.5:1 contrast ratio on ANY album color:
   - Dark overlay gradient on bottom where text lives
   - Automatic text color switching (white on dark, dark on light)
   - Fallback to neutral dark if contrast cannot be achieved

   **Performance Strategy:** Pre-extract colors for queued songs. Use crossfade during mini→full animation to mask async extraction time.

2. **Haptic Language System**: Consistent haptic feedback (light/medium/error) makes the app feel tactile and premium.

3. **Bulletproof Queue Persistence**: Queue survives everything - builds deep user trust that competitors lack.

4. **A-Z Quick Navigation**: Instant alphabetical jumping for large libraries differentiates from endless scroll.

### Technical UX Considerations

| Consideration | Strategy |
|--------------|----------|
| Color extraction async | Pre-extract for queue; crossfade masks load time |
| Mini→Full animation | 200-250ms expand; color fade happens DURING animation |
| Large queue rendering | Virtualized list + skeleton for off-screen items |
| Contrast accessibility | Gradient overlay + auto text color + dark fallback |

---

## Core User Experience

### Defining Experience

The core experience of AIDJ Mobile is **background-first music playback**. Users interact with the app primarily through external touchpoints (lock screen, notifications, headphone buttons) while the phone is pocketed. The in-app experience exists to:
1. Start music playing
2. Build and manage a queue
3. Find specific music quickly

The defining moment is when a user taps a song and music starts playing within 2 seconds, reliably, every time.

**Tap-on-Song Behavior:** When a user taps a song in an album or artist view, the queue is replaced with that album/context and playback begins from the tapped track. This matches Spotify/Apple Music convention and user expectation.

### Platform Strategy

| Aspect | Decision |
|--------|----------|
| Platforms | iOS 15.1+ and Android API 24+ via React Native/Expo |
| Orientation | Portrait only (MVP) |
| Primary Input | Touch-based |
| Offline Support | Queue persistence, cached library metadata |
| Platform Integration | Lock screen controls, notification controls, headphone buttons, haptics |

### Effortless Interactions

**Zero-Thought Actions:**
- Playback always works - press play, music plays
- Queue management is intuitive - "Add to Queue" = end, "Play Next" = after current
- Mini player is omnipresent when music is loaded
- Search shows results as you type
- Play All / Shuffle buttons are prominent on album screens

**Automatic Background Operations:**
- Queue position saved continuously
- Color extraction pre-computed for upcoming songs
- Library data cached and background-refreshed
- Scrobbles sent automatically at threshold

### Gesture Vocabulary

| Context | Gesture | Action |
|---------|---------|--------|
| Song in list | Tap | Play (replace queue with context) |
| Song in list | Long press | Context menu (Add to Queue, Play Next, etc.) |
| Song in queue | Swipe left | Remove from queue |
| Song in queue | Long press + drag | Reorder queue |
| Now Playing album art | Swipe left | Skip to next song |
| Now Playing album art | Swipe right | Skip to previous / restart |
| Now Playing screen | Swipe down | Collapse to mini player |
| Mini player | Tap | Expand to full Now Playing |

### Critical Success Moments

| Moment | Success Criteria | Testable Metric |
|--------|------------------|-----------------|
| Returning user to music | Queue restored, ready to play | <30 seconds from app open |
| New user to music | Full setup complete, first song plays | <5 minutes from install |
| Background reliability | Audio survives extended background | 2+ hours continuous, verified periodically |
| Queue persistence | Queue survives process termination | Kill → relaunch → queue array equality |
| Dynamic theming | Colors enhance experience accessibly | Contrast ratio ≥4.5:1 verified |

### Experience Principles

1. **Background First**: Design for pocketed phone. In-app supports out-of-app.

2. **Trust Through Reliability**: Every action succeeds. Every queue persists. No surprises.

3. **One Tap to Music**: Minimize distance from intent to playback. Tapping a song replaces queue and plays.

4. **Graceful Degradation**: Function with cached data when network fails. Never blank screens.

5. **Respect Muscle Memory**: Follow Spotify/Apple Music conventions. No relearning required.

6. **Now Playing Is a Destination**: The Now Playing screen isn't just a control panel - it's where emotional connection to music happens. Users will stare at it, show it to friends. It must be beautiful.

---

## Desired Emotional Response

### Primary Emotional Journey

**Trust → Relief → Love**

Users move through three emotional phases:

1. **Trust (First Session)**: "This actually works" - Queue persists, background plays reliably, controls are where expected
2. **Relief (First Week)**: "Finally, an app that doesn't fight me" - No relearning, no surprises, just music
3. **Love (Ongoing)**: "This is MY music app" - Personal library feels premium, Now Playing is beautiful

### Emotional Journey Mapping

| Phase | User Moment | Target Emotion | Design Trigger | Testable Metric |
|-------|-------------|----------------|----------------|-----------------|
| Discovery | First app open | Curiosity → Confidence | Clean setup, clear path | Setup screen loads <1s |
| First Setup | Server connection | Patience → Relief | Validation feedback within 3s | Connection validated or error shown ≤3s |
| First Play | Tap song, music starts | Satisfaction | <2s playback start | Time-to-audio ≤2s |
| First Background | Lock phone, music continues | Relief | Seamless continuation | Audio uninterrupted for 5min+ |
| First Return | Reopen app next day | Trust | Queue exactly as left | Queue array equality after kill→relaunch |
| Daily Use | Quick music selection | Effortless flow | One-tap to music | ≤2 taps from app open to playback |

### Micro-Emotions to Cultivate

| Emotion | Trigger | Design Response |
|---------|---------|-----------------|
| Confidence | Every interaction | Immediate visual/haptic feedback (≤50ms) |
| Trust | App restart | Queue restored perfectly (array equality) |
| Delight | Now Playing screen | Beautiful dynamic theming matching album mood |
| Control | Queue management | Intuitive gestures per Gesture Vocabulary (Section 2), clear results |
| Pride | Showing Now Playing to friends | Premium aesthetic, smooth animations (200-300ms) |
| Ownership | Personal library on personal server | "This is MY server, MY music, MY app" - feels like home |
| Inclusion | Dynamic theming on any album | Contrast always ≥4.5:1, readable regardless of album art colors |

### Micro-Emotions to Prevent

| Emotion | Cause | Prevention Strategy |
|---------|-------|---------------------|
| Anxiety | "Did it save?" | Continuous auto-save, no save buttons needed |
| Frustration | Unexpected behavior | Match mainstream app conventions (see Gesture Vocabulary, Section 2) |
| Confusion | Complex UI | Progressive disclosure, minimal chrome |
| Impatience | Slow response | Skeleton loading, optimistic updates |
| Distrust | Lost progress | Queue survives everything (process kill, app update, reboot) |
| Exclusion | Unreadable text on album art | Automatic contrast enforcement with dark fallback |

### Emotional Design Principles

| Principle | Description | Testable Assertion |
|-----------|-------------|-------------------|
| Feedback Immediacy | Every tap produces instant visual + haptic response | Haptic fires within 50ms of tap event |
| State Transparency | User always knows what's playing and what's next | Now Playing + queue visible without navigation from any screen |
| Recovery Confidence | Errors are recoverable; user is never stuck | Error state includes retry action; no dead-end screens |
| Aesthetic Emotion | Beautiful UI creates emotional connection to music | Color extraction completes; contrast ratio ≥4.5:1 verified |
| Invisible Persistence | User never thinks about saving - it just works | MMKV write completes before screen transition |
| Premium Feel | Animations, haptics, and polish signal quality | Animation duration 200-300ms; no frame drops on 60fps devices |

---

## Inspiration Analysis

### Competitive Landscape Analysis

**Primary Inspiration Sources:**

| App | What to Adopt | What to Avoid |
|-----|--------------|---------------|
| **Spotify** | Mini player placement, queue icon recognition, skip-previous restart behavior at 3s, shuffle/repeat iconography, swipe-on-art to skip | Algorithmic recommendations clutter, social features, premium upsells |
| **Apple Music** | Now Playing fullscreen aesthetic, haptic feedback patterns, modal sheet dismiss gesture | Complex navigation hierarchy, feature overload, lyrics integration (out of scope) |
| **Plexamp** | Self-hosted reliability expectations, offline-first thinking, power user queue features | Dense UI, steep learning curve, niche aesthetic |
| **iOS System** | Pull-down to dismiss modals, pull-to-refresh, action sheet for destructive actions | N/A (platform convention) |

### Gesture Provenance

| Gesture | Inspiration Source | AIDJ Implementation |
|---------|-------------------|---------------------|
| Swipe on album art to skip | Spotify | Now Playing: swipe left = next, right = previous |
| Pull down to dismiss | iOS System | Now Playing sheet dismisses to mini player |
| Long press for context menu | iOS System + Spotify | All list items show context menu |
| Swipe left to delete | iOS System (Mail) | Queue items: swipe left to remove |
| Drag to reorder | Apple Music | Queue items: long press activates drag |
| Pull to refresh | iOS System | Library screens refresh server data |

### Pattern Library

**Navigation Patterns (MVP - Epic 1-3):**
- Tab bar with 4 items: Library, Search, Queue, Settings
- Mini player persistent above tab bar
- Modal sheet for Now Playing (swipe down to dismiss)
- Nested navigation within tabs (Artist → Album → Song)
- Pull-to-refresh on all list screens (Story 3.8)
- A-Z quick scrubber for lists >100 items (differentiator)

**Now Playing Patterns (MVP - Epic 4):**
- Large album art (60-70% of screen height)
- Progress bar with scrubbing
- Play/Pause center, Skip left/right
- Secondary row: Shuffle, Previous, Play, Next, Repeat
- Queue access via icon (top right convention)

**Queue Patterns (MVP - Epic 5):**
- Current song highlighted/separated
- Swipe-to-remove (left swipe universally)
- Drag handles for reorder (right edge)
- "Clear Queue" in action sheet, not primary button

**Feedback Patterns (MVP - Epic 4-5):**
- Toast for "Added to Queue" (bottom, auto-dismiss 2s)
- Haptic: light for add, medium for remove, error for failures
- Animation: item slides into queue direction

**Post-MVP Patterns (Epic 6+):**
- Like/Star animations (Epic 6 - Favorites)
- Scrobble indicator (Epic 7 - Last.fm)
- Smart playlist badges (Epic 8 - Advanced)

### Visual Design Direction

**Color Strategy:**
- Dark theme default (battery efficiency, album art focus)
- Dynamic theming from album art dominant color
- Neutral UI chrome that doesn't compete with art
- System accent color for interactive elements

**Typography (System Fonts):**

| Element | iOS (SF Pro) | Android (Roboto) | Weight | Color |
|---------|-------------|------------------|--------|-------|
| Song Title | 17pt | 17sp | Semibold (600) | Primary |
| Artist Name | 15pt | 15sp | Regular (400) | Secondary |
| Album Name | 15pt | 15sp | Regular (400) | Secondary |
| Metadata (duration, year) | 13pt | 13sp | Regular (400) | Tertiary |
| Section Headers | 13pt | 13sp | Semibold (600) | Tertiary |
| Mini Player Title | 15pt | 15sp | Medium (500) | Primary |
| Mini Player Artist | 13pt | 13sp | Regular (400) | Secondary |

**Spacing & Density:**
- 44pt minimum touch targets (Apple HIG)
- 16px standard padding
- List items: 64-72px height for comfortable tapping
- Generous whitespace in Now Playing

### Micro-Interaction Specifications

| Interaction | Visual | Duration | Haptic | Audio |
|------------|--------|----------|--------|-------|
| Tap to play | Button scale (0.95→1.0) | 100ms | Light | None |
| Add to queue | Item slides right 20px, fades | 200ms | Light | None |
| Remove from queue | Item slides left, height collapses | 250ms | Medium | None |
| Skip forward | Art slides left, crossfade | 200ms | Light | None |
| Skip backward | Art slides right, crossfade | 200ms | Light | None |
| Expand mini player | Sheet springs up, art scales | 250ms | None | None |
| Collapse to mini | Sheet slides down, art shrinks | 200ms | None | None |
| Pull to refresh | Spinner appears, list reloads | 300ms min | Light on release | None |
| Error action | Element shakes horizontally 3x | 400ms | Error | None |
| Long press activate | Scale down slightly (0.97) | 150ms | Medium | None |

### Component Inventory

**Core Components (MVP):**

| Component | Description | Variants |
|-----------|-------------|----------|
| MiniPlayer | Persistent playback bar above tabs | Playing, Paused, Loading |
| NowPlayingSheet | Full-screen modal player | Standard, Queue visible |
| SongListItem | Song row in lists | Default, Playing, Downloading |
| AlbumCard | Album artwork with title | Grid (120x120), List (64x64) |
| ArtistCard | Artist image with name | Grid (120x120), List (64x64) |
| QueueItem | Draggable queue song | Default, Current, Dragging |
| PlaybackControls | Play/Pause/Skip cluster | Mini, Full |
| ProgressBar | Scrubbable timeline | Mini (thin), Full (thick) |
| SearchBar | Text input with clear | Empty, Active, With results |
| ContextMenu | Long-press action list | Song, Album, Artist, Playlist |
| ActionSheet | Destructive action confirmation | Clear Queue, Remove, Log Out |
| Toast | Temporary feedback message | Success, Error, Info |

**Empty State Variants:**

| State | Icon | Title | Description | Action |
|-------|------|-------|-------------|--------|
| No Server | server-off | "No Server Connected" | "Connect to your Navidrome server to access your music library" | "Set Up Server" button |
| Empty Library | music-note-off | "No Music Yet" | "Your library will appear here once your server syncs" | "Refresh" button |
| Empty Queue | queue-music | "Queue is Empty" | "Add songs from your library to start listening" | "Browse Library" button |
| No Search Results | search-off | "No Results" | "Try a different search term" | None (keyboard stays open) |

**Skeleton Loading Specs:**

| Context | Item Count | Dimensions | Animation |
|---------|------------|------------|-----------|
| Artist List | 10 items | 64px height, full width | Shimmer L→R, 1.5s loop |
| Album Grid | 6 items (2x3) | 120x120px + 40px text | Shimmer L→R, 1.5s loop |
| Song List | 8 items | 64px height, full width | Shimmer L→R, 1.5s loop |
| Album Art (Now Playing) | 1 item | 70% screen width, square | Pulse opacity 0.3→0.7, 1s loop |
| Queue List | 5 items | 56px height, full width | Shimmer L→R, 1.5s loop |

**Accessibility Verification:**
- All interactive elements: `minWidth: 44, minHeight: 44` enforced via lint rule
- Touch target audit: Run `accessibilityTouchTarget` check in CI
- Color contrast: Automated WCAG 2.1 AA verification on dynamic themes
- Screen reader: All components have `accessibilityLabel` and `accessibilityRole`

---

## Information Architecture

### Navigation Structure

```
┌─────────────────────────────────────────────────────────┐
│                    AIDJ Mobile                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│  │ Library │  │ Search  │  │  Queue  │  │Settings │   │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘   │
│       │            │            │            │         │
│       ▼            ▼            ▼            ▼         │
│   ┌───────┐    ┌───────┐    ┌───────┐    ┌───────┐   │
│   │Artists│    │Results│    │Queue  │    │Server │   │
│   │Albums │    │History│    │List   │    │Account│   │
│   │Songs  │    │       │    │       │    │About  │   │
│   │Playlist│   └───────┘    └───────┘    └───────┘   │
│   │Favorites│                                         │
│   └───┬───┘                                           │
│       │                                               │
│       ▼                                               │
│   ┌───────┐                                           │
│   │Artist │ ──► Album ──► Song List                  │
│   │Detail │                                           │
│   └───────┘                                           │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │              Mini Player (Persistent)            │   │
│  │         ▲ Tap to expand to Now Playing          │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Screen Inventory

| Screen | Tab | Depth | Priority | Entry Points | Exit Points |
|--------|-----|-------|----------|--------------|-------------|
| Library Home | Library | 0 | P0 | App launch, tab tap | Artist, Album, Song tap |
| Artist List | Library | 1 | P0 | "Artists" section | Artist detail, back |
| Artist Detail | Library | 2 | P0 | Artist tap | Album tap, back |
| Album List | Library | 1 | P0 | "Albums" section | Album detail, back |
| Album Detail | Library | 2 | P0 | Album tap | Song plays, back |
| Song List | Library | 1 | P0 | "Songs" section | Song plays, back |
| Playlist List | Library | 1 | P0 | "Playlists" section | Playlist detail, back |
| Playlist Detail | Library | 2 | P0 | Playlist tap | Song plays, back |
| Favorites | Library | 1 | P1 | "Favorites" section | Song plays, back |
| Search | Search | 0 | P0 | Tab tap | Result tap, clear |
| Search Results | Search | 1 | P0 | Query typed | Item tap, back |
| Queue | Queue | 0 | P0 | Tab tap | Now Playing, item tap |
| Settings | Settings | 0 | P0 | Tab tap | Sub-settings |
| Server Settings | Settings | 1 | P0 | "Server" tap | Test, save, back |
| Account Settings | Settings | 1 | P0 | "Account" tap | Log out, back |
| About | Settings | 1 | P2 | "About" tap | Back |
| Now Playing | Modal | -- | P0 | Mini player tap | Swipe down |

### User Flows

**Flow 1: First-Time Setup (New User)**
```
App Launch → Welcome Screen → Server URL Input → Credentials →
Test Connection ─┬─► Success → Library Tab (loading) → Ready
                 └─► Failure → Error Message → Retry/Edit URL
```

**Flow 2: Play Album (Returning User)**
```
App Launch → Library Tab → Albums → Album Detail →
Tap Song → Queue Replaced → Playback Starts → Mini Player Visible
```

**Flow 3: Queue Management**
```
Long Press Song → Context Menu → "Add to Queue" →
Toast "Added" → Queue Tab → Reorder/Remove → Playback Continues
```

**Flow 4: Now Playing Interaction**
```
Mini Player Tap → Now Playing Expands → View Queue →
Swipe Art to Skip → Scrub Progress → Swipe Down → Mini Player
```

**Flow 5: Clear Search History**
```
Search Tab → Recent Searches Visible → Swipe Left on Item →
Item Removed OR Tap "Clear All" → Confirmation → History Cleared
```

### Content Hierarchy

**Library Tab:**
```
Library
├── Favorites (P1 - Epic 6)
│   └── Starred songs list
├── Artists (A-Z scrollable)
│   └── Artist Detail
│       ├── Albums (grid)
│       └── Top Songs (list)
├── Albums (grid, sortable)
│   └── Album Detail
│       ├── Album Art (large)
│       ├── Play All / Shuffle
│       └── Track List
├── Songs (A-Z scrollable)
│   └── Direct play + context menu
└── Playlists
    └── Playlist Detail
        ├── Playlist Info
        ├── Play All / Shuffle
        └── Track List
```

**Search Tab:**
```
Search
├── Search Bar (persistent)
├── Recent Searches (pre-query)
│   ├── Swipe left to remove individual
│   └── "Clear All" action
└── Results (post-query)
    ├── Artists section
    ├── Albums section
    └── Songs section
```

**Queue Tab:**
```
Queue
├── Now Playing (highlighted)
├── Up Next (reorderable list)
└── Clear Queue (action sheet)

Note: Queue Tab and Now Playing queue share QueueStore state.
UI components differ (full list vs. collapsible panel).
```

**Settings Tab:**
```
Settings
├── Server
│   ├── URL
│   ├── Username
│   └── Test Connection
├── Playback (MVP)
│   └── (Reserved for future settings)
├── Playback (Post-MVP - Epic 8)
│   ├── Crossfade (slider)
│   └── Replay Gain
├── Account
│   └── Log Out (with confirmation)
└── About
    ├── Version
    ├── Build Number
    └── Licenses (auto-generated OSS attribution from package.json)
```

### Navigation Rules

1. **Tab Persistence**: Each tab maintains its navigation stack independently
   - *Implementation*: React Navigation with `unmountOnBlur: false` in tab config

2. **Mini Player Priority**: Always visible above tab bar when music loaded

3. **Modal Stacking**: Now Playing is the only modal; dismisses to mini player

4. **Back Behavior**: Hardware back on Android = navigate back or minimize app at root

5. **State Sharing**: Queue Tab and Now Playing queue render from shared QueueStore; components differ but data is synchronized

6. **Pull-to-Refresh**: All list screens (Artists, Albums, Songs, Playlists, Queue) support pull-to-refresh for server sync

### Post-MVP Navigation Features

| Feature | Epic | Notes |
|---------|------|-------|
| Deep Link Support | Future | `aidj://album/{id}` - Requires Expo `app.json` scheme config |
| Crossfade Settings | Epic 8 | Slider 0-12 seconds |
| Replay Gain Settings | Epic 8 | Toggle + mode selection |
| Favorites Tab/Section | Epic 6 | May become top-level tab or Library subsection |

---

## Screen Specifications

### Transition Timing Standards

| Transition Type | Duration | Easing |
|-----------------|----------|--------|
| Screen transitions (push/pop) | 250ms | ease-out |
| Modal expand/collapse | 250ms | spring |
| Color/theme crossfade | 200ms | linear |
| Micro-interactions (button press) | 100ms | ease-out |

---

### Screen: Server Setup (First-Time)

**Purpose:** Onboard new users by connecting to their Navidrome server

**Flow:** Welcome → Server URL → Credentials → Test → Success/Failure

**Layout - Welcome:**
```
┌────────────────────────────────────────┐
│                                        │
│            🎵 AIDJ                     │  App logo
│                                        │
│     Your music. Your server.          │  Tagline
│     Premium experience.                │
│                                        │
│                                        │
│       [ Get Started ]                  │  Primary CTA
│                                        │
└────────────────────────────────────────┘
```

**Layout - Server Configuration:**
```
┌────────────────────────────────────────┐
│ ←                     Server Setup     │  Header
├────────────────────────────────────────┤
│                                        │
│  Server URL                            │  Label
│  ┌──────────────────────────────────┐ │
│  │ https://music.example.com       │ │  Text input
│  └──────────────────────────────────┘ │
│                                        │
│  Username                              │
│  ┌──────────────────────────────────┐ │
│  │ your_username                    │ │
│  └──────────────────────────────────┘ │
│                                        │
│  Password                              │
│  ┌──────────────────────────────────┐ │
│  │ ••••••••••                       │ │  Secure input
│  └──────────────────────────────────┘ │
│                                        │
│       [ Test Connection ]              │  Primary action
│                                        │
│  ┌─────────────────────────────────┐  │
│  │ ✓ Connected successfully!       │  │  Success state
│  │   Library: 12,453 songs         │  │
│  └─────────────────────────────────┘  │
│                                        │
│  ┌─────────────────────────────────┐  │
│  │ ✗ Connection failed             │  │  Error state
│  │   Check URL and credentials     │  │
│  │   [ Retry ]                     │  │
│  └─────────────────────────────────┘  │
│                                        │
│       [ Continue ]                     │  Enabled on success
└────────────────────────────────────────┘
```

**Interactions:**
| Element | Tap | Validation |
|---------|-----|------------|
| Server URL input | Focus, keyboard | URL format required |
| Username input | Focus, keyboard | Non-empty required |
| Password input | Focus, secure keyboard | Non-empty required |
| Test Connection | Initiate connection test | All fields filled |
| Continue | Navigate to Library | Only after successful test |
| Back (←) | Return to Welcome | -- |

**States:**
- Idle: All inputs empty, Continue disabled
- Filled: Inputs have values, Test Connection enabled
- Testing: Spinner on button, inputs disabled
- Success: Green checkmark, library stats, Continue enabled
- Error: Red message, Retry button, inputs re-enabled

**Timing:** Connection test must complete or show error within 3 seconds (NFR)

---

### Screen: Library Home

**Purpose:** Entry point to music library with quick access to all content types

**Layout:**
```
┌────────────────────────────────────────┐
│ Library                        🔍      │  Header + search shortcut
├────────────────────────────────────────┤
│                                        │
│ Favorites ♡                    See All │  (P1 - Epic 6)
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐          │
│ │Song│ │Song│ │Song│ │Song│ →        │  Horizontal scroll
│ └────┘ └────┘ └────┘ └────┘          │
│                                        │
│ Recently Played                See All │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐          │
│ │Alb │ │Alb │ │Alb │ │Alb │ →        │  Horizontal scroll
│ └────┘ └────┘ └────┘ └────┘          │
│                                        │
│ ┌─────────────────────────────────┐   │
│ │ 🎤 Artists              1,234 → │   │  Navigation rows
│ ├─────────────────────────────────┤   │
│ │ 💿 Albums               2,567 → │   │
│ ├─────────────────────────────────┤   │
│ │ 🎵 Songs               12,453 → │   │
│ ├─────────────────────────────────┤   │
│ │ 📋 Playlists               23 → │   │
│ └─────────────────────────────────┘   │
│                                        │
└────────────────────────────────────────┘
```

**Interactions:**
| Element | Tap | Long Press |
|---------|-----|------------|
| Search icon (🔍) | Navigate to Search tab | -- |
| Favorites section | (P1 - Epic 6) | -- |
| Recently Played album | Navigate to Album Detail | Context menu |
| See All (any section) | Navigate to full list | -- |
| Artists row | Navigate to Artist List | -- |
| Albums row | Navigate to Album List | -- |
| Songs row | Navigate to Song List | -- |
| Playlists row | Navigate to Playlist List | -- |

**States:**
- Loading: Skeleton for Recently Played (4 items), counts show "--"
- Empty (new user): Hide Recently Played, show welcome message
- Populated: Full layout as shown

---

### Screen: Artist Detail

**Purpose:** View artist's albums and top songs

**Layout:**
```
┌────────────────────────────────────────┐
│ ←                                      │  Navigation
├────────────────────────────────────────┤
│         ┌──────────────────┐          │
│         │   Artist Image   │          │  200x200, circular
│         └──────────────────┘          │
│         Artist Name                    │  17pt semibold, centered
│         45 albums • 523 songs          │  13pt metadata
│                                        │
│    [ ▶ Play All ]  [ 🔀 Shuffle ]     │  Primary actions
├────────────────────────────────────────┤
│ ALBUMS                                 │  Section header
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐          │
│ │Alb │ │Alb │ │Alb │ │Alb │          │  Grid, 2-3 columns
│ │2023│ │2021│ │2019│ │2017│          │
│ └────┘ └────┘ └────┘ └────┘          │
│ ┌────┐ ┌────┐ ...                     │
│ └────┘ └────┘                         │
├────────────────────────────────────────┤
│ TOP SONGS                              │  Section header
│ 1. Song Title                    3:21 │
│ 2. Song Title                    4:02 │
│ 3. Song Title                    3:45 │
│ 4. Song Title                    5:12 │
│ 5. Song Title                    3:33 │
│    Show More                          │  Expandable
└────────────────────────────────────────┘
```

**Interactions:**
| Element | Tap | Long Press |
|---------|-----|------------|
| Back (←) | Navigate back | -- |
| Play All | Play all artist songs, replace queue | -- |
| Shuffle | Shuffle all artist songs, replace queue | -- |
| Album card | Navigate to Album Detail | Context menu |
| Song row | Replace queue with top songs, play from this | Context menu |
| Show More | Expand to show all songs | -- |

---

### Screen: Now Playing

**Purpose:** Full-screen immersive playback experience - the emotional heart of the app

**Layout (Top to Bottom):**
```
┌────────────────────────────────────────┐
│ ← (collapse)              Queue Icon → │  44px header
├────────────────────────────────────────┤
│                                        │
│                                        │
│         ┌──────────────────┐          │
│         │                  │          │
│         │    Album Art     │          │  70% width, square
│         │   (swipeable)    │          │
│         │                  │          │
│         └──────────────────┘          │
│                                        │
│         Song Title                     │  17pt semibold
│         Artist Name                    │  15pt regular, tappable
│                                        │
│    ●━━━━━━━━━━━━━━━━━━━━━━━○         │  Progress bar (scrubbable)
│   0:42                    3:21        │  Timestamps
│                                        │
│     🔀      ◁      ▶/❚❚      ▷      🔁   │  Full controls
│                                        │
│         ♡ (P1)            ⋮ More      │  Actions row
└────────────────────────────────────────┘
```

**Context Menu (More ⋮) Options:**
| Option | Action | Priority |
|--------|--------|----------|
| Add to Queue | Append current song to end of queue | P0 |
| Play Next | Insert after current song | P0 |
| Go to Artist | Navigate to Artist Detail | P0 |
| Go to Album | Navigate to Album Detail | P0 |
| Add to Playlist | Show playlist picker (P1 - Epic 6) | P1 |

**Interactions:**
| Element | Tap | Long Press | Swipe |
|---------|-----|------------|-------|
| Album Art | -- | -- | Left=next, Right=prev |
| Progress Bar | Seek to position | -- | Scrub |
| Play/Pause | Toggle playback | -- | -- |
| Skip Forward (▷) | Skip to next song | -- | -- |
| Skip Back (◁) | **<3s:** Previous track, **≥3s:** Restart current | -- | -- |
| Shuffle (🔀) | Toggle shuffle mode | -- | -- |
| Repeat (🔁) | Cycle: off → all → one | -- | -- |
| Heart (♡) | Toggle favorite (P1 - Epic 6) | -- | -- |
| More (⋮) | Show context menu | -- | -- |
| Artist Name | Navigate to Artist Detail | -- | -- |
| Queue Icon | Show queue panel | -- | -- |
| Collapse (←) | Dismiss to mini player | -- | -- |
| Entire screen | -- | -- | Down=collapse |

**Dynamic Theming:**
- Background: Gradient from album dominant color (top) to dark (bottom)
- Text: Auto-switch white/dark based on background luminance
- Contrast: Minimum 4.5:1 enforced; fallback to neutral dark if needed
- Transition: 200ms crossfade when song changes (color transition timing)

---

### Screen: Mini Player

**Purpose:** Persistent playback indicator and quick controls

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│ ┌────┐  Song Title              ▶/❚❚    ▷    │  64px
│ │Art │  Artist Name                              │
│ └────┘                                           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│  2px progress
└────────────────────────────────────────────────────────┘
```

**Interactions:**
| Element | Tap | Long Press | Swipe |
|---------|-----|------------|-------|
| Album Art | Expand to Now Playing | -- | -- |
| Song/Artist text | Expand to Now Playing | -- | -- |
| Play/Pause | Toggle playback | -- | -- |
| Skip Forward | Skip to next | -- | -- |
| Progress bar | -- (display only) | -- | -- |
| Entire bar | Expand to Now Playing | -- | -- |

**States:**
| State | Art | Title | Artist | Controls |
|-------|-----|-------|--------|----------|
| Playing | Album art | Song title | Artist name | Pause + Skip |
| Paused | Album art | Song title | Artist name | Play + Skip |
| Loading | Album art | Song title | Artist name | Spinner |
| Restoring | Last song art | Last song title | Last artist | Spinner (until Track Player ready) |
| Hidden | -- | -- | -- | (not rendered when no music loaded) |

---

### Screen: Queue

**Purpose:** View and manage upcoming songs

**Layout:**
```
┌────────────────────────────────────────┐
│ Queue                    Clear All     │  Header
├────────────────────────────────────────┤
│ NOW PLAYING                            │  Section
│ ┌────┐ Song Title           ≡ (drag)  │
│ │Art │ Artist • 3:21                   │  Current (highlighted)
│ └────┘                                 │
├────────────────────────────────────────┤
│ UP NEXT (23 songs)                     │  Section
│ ┌────┐ Song Title           ≡         │
│ │Art │ Artist • 4:02                   │  Swipe left to remove
│ └────┘                                 │
│ ┌────┐ Song Title           ≡         │
│ │Art │ Artist • 3:45                   │
│ └────┘                                 │
│ ...                                    │  Virtualized list
│                                        │
│                    ┌───┐               │
│                    │ ↑ │               │  FAB: Scroll to current
│                    └───┘               │  (visible when scrolled away)
└────────────────────────────────────────┘
```

**Interactions:**
| Element | Tap | Long Press | Swipe |
|---------|-----|------------|-------|
| Current song | Expand to Now Playing | -- | -- |
| Queue item | **Skip-to:** Jump to that song, queue remains intact (songs before become history) | Activate drag mode | Left=remove |
| Drag handle (≡) | -- | Activate drag | Drag up/down to reorder |
| Clear All | Action sheet confirmation | -- | -- |
| Scroll to Current FAB | Scroll list to now playing | -- | -- |

**States:**
- Empty: EmptyState component with "Browse Library" CTA
- Loading: Skeleton (5 items)
- Populated: Full list with current song highlighted
- Large queue: Virtualized when `queue.length > 100`, FAB appears when scrolled >3 items from current

---

### Screen: Album Detail

**Purpose:** Browse album tracks and initiate playback

**Layout:**
```
┌────────────────────────────────────────┐
│ ←                                      │  Navigation
├────────────────────────────────────────┤
│         ┌──────────────────┐          │
│         │    Album Art     │          │  200x200
│         └──────────────────┘          │
│         Album Title                    │  17pt semibold
│         Artist Name                    │  15pt, tappable
│         2023 • 12 songs • 42 min      │  13pt metadata
│                                        │
│    [ ▶ Play All ]  [ 🔀 Shuffle ]     │  Primary actions
├────────────────────────────────────────┤
│ 1. Song Title                    3:21 │  Track list
│ 2. Song Title                    4:02 │
│ 3. Song Title                    3:45 │
│ ...                                    │
└────────────────────────────────────────┘
```

**Context Menu (Long Press Track) Options:**
| Option | Action |
|--------|--------|
| Play Next | Insert after current song |
| Add to Queue | Append to end of queue |
| Go to Artist | Navigate to Artist Detail |
| Add to Playlist | Show playlist picker (P1 - Epic 6) |

**Interactions:**
| Element | Tap | Long Press |
|---------|-----|------------|
| Back (←) | Navigate back | -- |
| Album Art | -- | -- |
| Artist Name | Navigate to Artist Detail | -- |
| Play All | Replace queue, play from track 1 | -- |
| Shuffle | Replace queue, shuffle, play | -- |
| Track row | Replace queue with album, play from this track | Context menu |

---

### Screen: Search

**Purpose:** Find music quickly across library

**Layout:**
```
┌────────────────────────────────────────┐
│ ┌──────────────────────────────────┐  │
│ │ 🔍 Search artists, albums, songs │  │  Search bar
│ └──────────────────────────────────┘  │
├────────────────────────────────────────┤
│ RECENT                     Clear All  │  Pre-query
│ • "pink floyd"                    ✕   │  Swipe to remove
│ • "dark side"                     ✕   │
│ • "wish you were"                 ✕   │
├────────────────────────────────────────┤
│                 OR                     │
├────────────────────────────────────────┤
│ ARTISTS (3)                           │  Post-query results
│ ┌────┐ Pink Floyd                     │
│ │Img │ 14 albums                      │
│ └────┘                                 │
│ ALBUMS (5)                            │
│ ┌────┐ Dark Side of the Moon          │
│ │Art │ Pink Floyd • 1973              │
│ └────┘                                 │
│ SONGS (12)                            │
│ ┌────┐ Wish You Were Here             │
│ │Art │ Pink Floyd • 5:17              │
│ └────┘                                 │
└────────────────────────────────────────┘
```

**Context Menu Options (Long Press):**
| Item Type | Options |
|-----------|---------|
| Artist | Play All, Shuffle, Add to Queue |
| Album | Play All, Shuffle, Play Next, Add to Queue |
| Song | Play Next, Add to Queue, Go to Artist, Go to Album |

**Interactions:**
| Element | Tap | Long Press | Swipe |
|---------|-----|------------|-------|
| Search bar | Focus, show keyboard | -- | -- |
| Recent item | Execute that search | -- | Left=remove |
| Clear All | Clear all history | -- | -- |
| Artist result | Navigate to Artist Detail | Context menu | -- |
| Album result | Navigate to Album Detail | Context menu | -- |
| Song result | Play song (replace queue with search context) | Context menu | -- |

**Behavior:**
- Debounce: 300ms after typing stops
  - *Test verification:* Input with 250ms gap = no search fired; 350ms gap = search fires
- Minimum query: 2 characters
- Results update live as user types
- Empty results: "No Results" empty state (keyboard stays open)

---

### Screen: Settings

**Purpose:** App configuration and account management

**Layout:**
```
┌────────────────────────────────────────┐
│ Settings                               │  Header
├────────────────────────────────────────┤
│                                        │
│ SERVER                                 │  Section
│ ┌─────────────────────────────────┐   │
│ │ Server URL                      │   │
│ │ https://music.example.com     → │   │
│ ├─────────────────────────────────┤   │
│ │ Username                        │   │
│ │ your_username                 → │   │
│ ├─────────────────────────────────┤   │
│ │ Test Connection               → │   │
│ └─────────────────────────────────┘   │
│                                        │
│ ACCOUNT                                │  Section
│ ┌─────────────────────────────────┐   │
│ │ Log Out                       → │   │  Destructive (red text)
│ └─────────────────────────────────┘   │
│                                        │
│ ABOUT                                  │  Section
│ ┌─────────────────────────────────┐   │
│ │ Version                   1.0.0 │   │
│ │ Build                       123 │   │
│ ├─────────────────────────────────┤   │
│ │ Open Source Licenses        → │   │
│ └─────────────────────────────────┘   │
│                                        │
└────────────────────────────────────────┘
```

**Interactions:**
| Element | Tap | Confirmation |
|---------|-----|--------------|
| Server URL | Navigate to edit | -- |
| Username | Navigate to edit | -- |
| Test Connection | Test and show result | -- |
| Log Out | -- | Action sheet: "Log out? This will clear your queue and cached data." → [Cancel] [Log Out] |
| Open Source Licenses | Navigate to licenses list | -- |

**Log Out Flow:**
```
Tap Log Out → Action Sheet appears →
  [Cancel] → Dismiss
  [Log Out] → Clear SecureStore → Clear MMKV → Navigate to Welcome
```

---

### Context Menu Variants Summary

| Context | Menu Options |
|---------|--------------|
| **Song (in list)** | Play Next, Add to Queue, Go to Artist, Go to Album, Add to Playlist (P1) |
| **Song (Now Playing)** | Add to Queue, Play Next, Go to Artist, Go to Album, Add to Playlist (P1) |
| **Album** | Play All, Shuffle, Play Next, Add to Queue, Go to Artist |
| **Artist** | Play All, Shuffle, Add to Queue |
| **Playlist** | Play All, Shuffle, Edit (P1), Delete (P1) |

---

### Additional Component: FloatingActionButton

**Purpose:** Quick action overlay for scroll-to-current in long lists

**Specs:**
| Property | Value |
|----------|-------|
| Size | 48x48px |
| Position | Bottom-right, 16px margin |
| Icon | Arrow-up (↑) |
| Background | Primary color with shadow |
| Visibility | Appears when scrolled >3 items from target |
| Animation | Fade in 150ms, fade out 150ms |
| Haptic | Light on tap |

---
