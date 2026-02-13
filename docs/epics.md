---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: ['docs/prd-aidj-mobile.md', 'docs/architecture-mobile.md']
workflowType: 'epics-stories'
project_name: 'AIDJ Mobile'
user_name: 'Dev Gansta'
date: '2025-12-14'
status: complete
---

# AIDJ Mobile - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for AIDJ Mobile, decomposing the requirements from the PRD and Architecture into implementable stories with detailed acceptance criteria.

## Requirements Inventory

### Functional Requirements

**FR-1: Authentication & Connection**
- FR-1.1: User can log in with Better Auth (P0)
- FR-1.2: User can configure Navidrome server (P0)
- FR-1.3: App validates Navidrome connection (P0)
- FR-1.4: Credentials persist across app restarts (P0)
- FR-1.5: User can disconnect/change server (P1)
- FR-1.6: Connection status indicator (P1)

**FR-2: Library Browsing**
- FR-2.1: Browse all artists alphabetically (P0)
- FR-2.2: View artist's albums (P0)
- FR-2.3: View album's songs (P0)
- FR-2.4: Pull to refresh library (P1)
- FR-2.5: Album art displayed throughout (P0)
- FR-2.6: Recently played quick access (P2)

**FR-3: Search**
- FR-3.1: Global search across library (P0)
- FR-3.2: Search artists (P0)
- FR-3.3: Search albums (P0)
- FR-3.4: Search songs (P0)
- FR-3.5: Instant results as you type (P1)
- FR-3.6: Clear recent searches (P2)

**FR-4: Audio Playback**
- FR-4.1: Play/Pause toggle (P0)
- FR-4.2: Skip to next song (P0)
- FR-4.3: Skip to previous song (P0)
- FR-4.4: Seek within song (P0)
- FR-4.5: Background audio playback (P0)
- FR-4.6: Lock screen controls (P0)
- FR-4.7: Control Center integration (iOS) (P0)
- FR-4.8: Notification controls (Android) (P0)
- FR-4.9: Headphone button support (P1)
- FR-4.10: CarPlay/Android Auto (basic) (P2)

**FR-5: Queue Management**
- FR-5.1: View current queue (P0)
- FR-5.2: Reorder queue items (P0)
- FR-5.3: Remove song from queue (P0)
- FR-5.4: Clear entire queue (P1)
- FR-5.5: Add song to end of queue (P0)
- FR-5.6: Play song next (P0)
- FR-5.7: Shuffle toggle (P1)
- FR-5.8: Repeat mode (off/one/all) (P1)
- FR-5.9: Queue persists across restarts (P0)

**FR-6: Now Playing**
- FR-6.1: Display current song info (P0)
- FR-6.2: Display album art (large) (P0)
- FR-6.3: Progress indicator (P0)
- FR-6.4: Mini player (collapsed) (P0)
- FR-6.5: Expand mini to full player (P0)
- FR-6.6: Swipe gestures for skip (P1)

**FR-7: Scrobbling**
- FR-7.1: Scrobble to Navidrome (P1)
- FR-7.2: Scrobble threshold (50%/4min) (P1)
- FR-7.3: Now Playing submission (P2)

**FR-8: Settings**
- FR-8.1: View connection settings (P0)
- FR-8.2: Edit connection settings (P1)
- FR-8.3: Log out (P1)
- FR-8.4: App version display (P2)

**Summary:** 26 P0 (must-have), 11 P1 (should-have), 5 P2 (nice-to-have)

### Non-Functional Requirements

**NFR-1: Performance**
- NFR-1.1: App launch time <3 seconds
- NFR-1.2: Song start latency <2 seconds
- NFR-1.3: Search response <500ms
- NFR-1.4: Navigation transitions <300ms
- NFR-1.5: Album art load <500ms
- NFR-1.6: List scroll 60fps
- NFR-1.7: Memory usage <200MB
- NFR-1.8: Battery impact <5%/hour

**NFR-2: Reliability**
- NFR-2.1: Background audio uptime 99.9%
- NFR-2.2: Crash rate <0.1%
- NFR-2.3: Network recovery automatic
- NFR-2.4: State persistence 100%
- NFR-2.5: Phone call recovery 100%
- NFR-2.6: Alarm recovery 100%

**NFR-3: Security**
- NFR-3.1: Credential encryption (expo-secure-store)
- NFR-3.2: No plaintext secrets
- NFR-3.3: HTTPS preferred (warn on HTTP)
- NFR-3.4: Session management via Better Auth
- NFR-3.5: No analytics/tracking (privacy-first)

**NFR-4: Compatibility**
- NFR-4.1: iOS 15.1+
- NFR-4.2: Android API 24+ (Android 7.0)
- NFR-4.3: Navidrome 0.49.0+ (Subsonic API)
- NFR-4.4: Phone only (MVP), tablet stretch
- NFR-4.5: Portrait only (MVP)

**NFR-5: Usability**
- NFR-5.1: Touch targets ≥44pt (iOS), ≥48dp (Android)
- NFR-5.2: Contrast ratio ≥4.5:1
- NFR-5.3: Loading indicators for operations >300ms
- NFR-5.4: Human-readable error messages
- NFR-5.5: Onboarding time <5 minutes

**NFR-6: Scalability**
- NFR-6.1: Library size 50,000+ songs smooth
- NFR-6.2: Queue size 1,000+ songs
- NFR-6.3: Search corpus: full library indexed
- NFR-6.4: Concurrent streams: 1 (single user)

**NFR-7: Maintainability**
- NFR-7.1: Feature-based code organization
- NFR-7.2: TypeScript strict mode
- NFR-7.3: Zustand with clear boundaries
- NFR-7.4: Service layer isolates Navidrome
- NFR-7.5: React error boundaries throughout

### Additional Requirements (from Architecture)

- **ARCH-1**: CVE-2025-55182 security patch required (React 19.1.4+, Expo 54.0.29) - GATE STORY
- **ARCH-2**: Boot sequence order: SecureStore → MMKV → Zustand → Track Player → Navigation
- **ARCH-3**: Track Player registration in index.js BEFORE expo-router
- **ARCH-4**: Better Auth required for public-facing pages/profiles (not Navidrome-first)
- **ARCH-5**: Connection status management enum (not_configured, connected, auth_failed, unreachable, checking)
- **ARCH-6**: Skippable onboarding with empty states + CTAs
- **ARCH-7**: Provider composition pattern in lib/providers/
- **ARCH-8**: Import order convention (React → Third-party → @/ → Relative → Types)
- **ARCH-9**: Component boundaries (screens cannot import services directly)
- **ARCH-10**: Query key structure: hierarchical ['navidrome', 'entity', filters]
- **ARCH-11**: Skeleton loading (not spinners) on list screens
- **ARCH-12**: No loading states on Now Playing screen
- **ARCH-13**: 2-second minimum error display duration
- **ARCH-14**: Haptic feedback patterns per action type
- **ARCH-15**: Dominant color extraction for album art backgrounds
- **ARCH-16**: Graceful degradation tiers (Optimal → Degraded → Failed)

---

## Epic List

### Epic 1: Foundation & Security
**Goal:** Establish secure, production-ready project infrastructure that all other epics depend on.

**User Outcome:** Developers have a secure, properly configured project ready for feature development.

**FRs covered:** Infrastructure prerequisites
**ARCH covered:** ARCH-1 (CVE patch - GATE), ARCH-2 (boot sequence), ARCH-7 (providers), ARCH-8 (conventions)

**MVP Scope:** All stories (GATE - blocks everything)

---

### Epic 2: Auth & Server Connection
**Goal:** Users can securely log in, connect to their Navidrome server, and have basic library access for testing.

**User Outcome:** User opens app → logs in → connects to Navidrome → sees library confirmation → can fetch songs.

**FRs covered:** FR-1.1, FR-1.2, FR-1.3, FR-1.4, FR-1.5, FR-1.6, FR-8.1, FR-8.2, FR-8.3
**ARCH covered:** ARCH-4 (Better Auth first), ARCH-5 (connection status), ARCH-6 (skippable onboarding), ARCH-16 (graceful degradation)

**Includes:**
- Better Auth integration
- Navidrome connection setup
- Basic Navidrome service (ping, getArtists, getAlbum, stream) - enables Epic 4 testing
- Connection status management (Story 2.0)
- Skippable onboarding (Story 2.9)
- Empty states with CTAs (Story 2.10)

**MVP Scope:** 8 P0 stories | **Full Scope:** +3 P1 stories

---

### Epic 3: Library Browsing
**Goal:** Users can explore their music library with smooth, fast navigation.

**User Outcome:** User browses Artists → Albums → Songs → selects music to play.

**FRs covered:** FR-2.1, FR-2.2, FR-2.3, FR-2.4, FR-2.5, FR-2.6
**ARCH covered:** ARCH-10 (query keys), ARCH-11 (skeleton loading)

**Notes:** Must handle 50,000+ songs smoothly. A-Z quick scroll index. This epic comes before Playback because users need to find music before they can play it.

**MVP Scope:** 7 P0 stories | **Full Scope:** +2 P1, +1 P2 stories

---

### Epic 4: Core Audio Playback
**Goal:** Users can play music with reliable background audio that "just works."

**User Outcome:** User taps a song → music plays → continues in background → survives phone calls and interruptions.

**FRs covered:** FR-4.1, FR-4.2, FR-4.3, FR-4.4, FR-4.5, FR-4.6, FR-4.7, FR-4.8, FR-4.9
**ARCH covered:** ARCH-3 (Track Player registration), ARCH-2 (boot sequence for audio)

**Notes:** CRITICAL epic - background audio must work flawlessly. "Day in the Life" test must pass. All stories are P0.

**MVP Scope:** 9 P0 stories (all critical)

---

### Epic 5: Queue Management
**Goal:** Users can control what plays next with intuitive queue management.

**User Outcome:** User can view queue → reorder songs → add/remove items → queue persists across sessions.

**FRs covered:** FR-5.1, FR-5.2, FR-5.3, FR-5.4, FR-5.5, FR-5.6, FR-5.7, FR-5.8, FR-5.9

**Notes:** Queue state persists via MMKV. Drag-to-reorder and swipe-to-remove interactions.

**MVP Scope:** 6 P0 stories | **Full Scope:** +3 P1 stories

---

### Epic 6: Now Playing Experience
**Goal:** Users have a beautiful, polished Now Playing screen (hero screen).

**User Outcome:** User sees gorgeous album art → controls playback → expands/collapses mini player → feels premium.

**FRs covered:** FR-6.1, FR-6.2, FR-6.3, FR-6.4, FR-6.5, FR-6.6
**ARCH covered:** ARCH-12 (no loading states), ARCH-15 (dominant color extraction)

**Notes:** 30% of UI effort. Must be "show to a friend" quality. Mini player always visible when browsing.

**MVP Scope:** 5 P0 stories | **Full Scope:** +1 P1 story

---

### Epic 7: Search
**Goal:** Users can quickly find any music in their library.

**User Outcome:** User types → sees instant results → taps to play or navigate.

**FRs covered:** FR-3.1, FR-3.2, FR-3.3, FR-3.4, FR-3.5, FR-3.6

**Notes:** <500ms response time. Categorized results (Artists, Albums, Songs).

**MVP Scope:** 4 P0 stories | **Full Scope:** +1 P1, +1 P2 stories

---

### Epic 8: Scrobbling & Release
**Goal:** User's listening is tracked and the app is ready for beta distribution.

**User Outcome:** Plays appear in Navidrome history → app available on TestFlight/Play Store internal.

**FRs covered:** FR-7.1, FR-7.2, FR-7.3, FR-8.4, FR-4.10
**ARCH covered:** ARCH-13 (error display), ARCH-14 (haptics)

**Includes:**
- Scrobble to Navidrome
- Scrobble threshold logic
- Now Playing submission
- App icon and splash screen
- TestFlight/Beta distribution
- Final QA and background audio test matrix

**MVP Scope:** 4 P0 stories (scrobbling + release) | **Full Scope:** +2 P1, +1 P2 stories

---

## FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR-1.1 | Epic 2 | Better Auth login |
| FR-1.2 | Epic 2 | Navidrome server config |
| FR-1.3 | Epic 2 | Connection validation |
| FR-1.4 | Epic 2 | Credential persistence |
| FR-1.5 | Epic 2 | Disconnect/change server |
| FR-1.6 | Epic 2 | Connection status indicator |
| FR-2.1 | Epic 3 | Browse artists alphabetically |
| FR-2.2 | Epic 3 | View artist's albums |
| FR-2.3 | Epic 3 | View album's songs |
| FR-2.4 | Epic 3 | Pull to refresh |
| FR-2.5 | Epic 3 | Album art throughout |
| FR-2.6 | Epic 3 | Recently played |
| FR-3.1 | Epic 7 | Global search |
| FR-3.2 | Epic 7 | Search artists |
| FR-3.3 | Epic 7 | Search albums |
| FR-3.4 | Epic 7 | Search songs |
| FR-3.5 | Epic 7 | Instant results |
| FR-3.6 | Epic 7 | Clear recent searches |
| FR-4.1 | Epic 4 | Play/Pause |
| FR-4.2 | Epic 4 | Skip next |
| FR-4.3 | Epic 4 | Skip previous |
| FR-4.4 | Epic 4 | Seek |
| FR-4.5 | Epic 4 | Background audio |
| FR-4.6 | Epic 4 | Lock screen controls |
| FR-4.7 | Epic 4 | Control Center (iOS) |
| FR-4.8 | Epic 4 | Notification controls (Android) |
| FR-4.9 | Epic 4 | Headphone buttons |
| FR-4.10 | Epic 8 | CarPlay/Android Auto (P2) |
| FR-5.1 | Epic 5 | View queue |
| FR-5.2 | Epic 5 | Reorder queue |
| FR-5.3 | Epic 5 | Remove from queue |
| FR-5.4 | Epic 5 | Clear queue |
| FR-5.5 | Epic 5 | Add to queue |
| FR-5.6 | Epic 5 | Play next |
| FR-5.7 | Epic 5 | Shuffle |
| FR-5.8 | Epic 5 | Repeat modes |
| FR-5.9 | Epic 5 | Queue persistence |
| FR-6.1 | Epic 6 | Song info display |
| FR-6.2 | Epic 6 | Large album art |
| FR-6.3 | Epic 6 | Progress indicator |
| FR-6.4 | Epic 6 | Mini player |
| FR-6.5 | Epic 6 | Expand mini to full |
| FR-6.6 | Epic 6 | Swipe gestures |
| FR-7.1 | Epic 8 | Scrobble to Navidrome |
| FR-7.2 | Epic 8 | Scrobble threshold |
| FR-7.3 | Epic 8 | Now Playing submission |
| FR-8.1 | Epic 2 | View connection settings |
| FR-8.2 | Epic 2 | Edit connection settings |
| FR-8.3 | Epic 2 | Log out |
| FR-8.4 | Epic 8 | App version display |

**Coverage:** 42/42 FRs mapped (100%)

---

## Epic Dependency Flow

```
Epic 1 (Foundation) ──GATES──▶ All Epics
                                  │
                                  ▼
                           Epic 2 (Auth + Basic Navidrome)
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
             Epic 3 (Library)            Epic 7 (Search)
                    │
                    ▼
             Epic 4 (Playback)
                    │
                    ▼
             Epic 5 (Queue)
                    │
                    ▼
             Epic 6 (Now Playing)
                    │
                    ▼
             Epic 8 (Scrobbling & Release)
```

---

## Stories

---

## Epic 1: Foundation & Security

**Goal:** Establish secure, production-ready project infrastructure that all other epics depend on.

**Requirements Covered:** ARCH-1, ARCH-2, ARCH-7, ARCH-8

**Story Count:** 5 stories (all P0 - GATE)

---

### Story 1.1: Project Initialization with Security Patches

**As a** developer,
**I want** a properly initialized Expo project with CVE-2025-55182 patches applied,
**So that** the application is secure from known vulnerabilities before any feature development begins.

**Acceptance Criteria:**

**Given** no existing AIDJ Mobile project
**When** I initialize the Expo project
**Then** Expo SDK version is 54.0.29 or higher
**And** React version is 19.1.4 or higher
**And** react-native version is 0.81.x (via Expo SDK 54)
**And** TypeScript strict mode is enabled
**And** the project builds successfully for both iOS and Android
**And** `npx expo-doctor` reports no security vulnerabilities

---

### Story 1.2: Boot Sequence Infrastructure

**As a** developer,
**I want** a proper boot sequence implementation,
**So that** state hydration and services initialize in the correct order.

**Acceptance Criteria:**

**Given** the AIDJ Mobile app starts
**When** the boot sequence executes
**Then** SecureStore is available first
**And** MMKV initializes after SecureStore
**And** Zustand store hydration completes before Track Player
**And** Navigation becomes ready only after all prior steps complete
**And** a `lib/boot/sequence.ts` file orchestrates this order
**And** the boot sequence can be tested in isolation

---

### Story 1.3: Provider Composition Pattern

**As a** developer,
**I want** a provider composition pattern in `lib/providers/`,
**So that** React context providers are organized and composable.

**Acceptance Criteria:**

**Given** the app requires multiple providers (Query, Theme, etc.)
**When** I set up the provider composition
**Then** a `lib/providers/index.ts` exports a composed `AppProviders` component
**And** providers are ordered correctly (QueryClientProvider wraps others)
**And** the pattern allows adding new providers without modifying app entry
**And** providers can be tested individually
**And** the root layout uses `AppProviders` as the wrapper

---

### Story 1.4: Code Conventions and Linting

**As a** developer,
**I want** ESLint and Prettier configured with project conventions,
**So that** code style is consistent and import order is enforced.

**Acceptance Criteria:**

**Given** the project needs consistent code style
**When** I configure linting
**Then** ESLint enforces import order: React → Third-party → @/ aliases → Relative → Types
**And** Prettier is configured for consistent formatting
**And** TypeScript strict mode errors fail the lint check
**And** `npm run lint` validates all conventions
**And** a `.eslintrc.js` documents the import order rules
**And** pre-commit hooks run linting (optional but configured)

---

### Story 1.5: Project Structure and Path Aliases

**As a** developer,
**I want** the project directory structure and path aliases configured,
**So that** code organization follows the architecture and imports are clean.

**Acceptance Criteria:**

**Given** the architecture defines specific directories
**When** I set up the project structure
**Then** these directories exist:
  - `app/` (Expo Router screens)
  - `lib/components/` (shared components)
  - `lib/hooks/` (custom hooks)
  - `lib/services/` (API services)
  - `lib/stores/` (Zustand stores)
  - `lib/queries/` (TanStack Query)
  - `lib/providers/` (React providers)
  - `lib/constants/` (app constants)
  - `lib/utils/` (utility functions)
**And** `@/` path alias resolves to `lib/`
**And** tsconfig.json has proper path mappings
**And** barrel exports (`index.ts`) exist in each lib subdirectory

---

## Epic 2: Auth & Server Connection

**Goal:** Users can securely log in, connect to their Navidrome server, and have basic library access for testing.

**Requirements Covered:** FR-1.1, FR-1.2, FR-1.3, FR-1.4, FR-1.5, FR-1.6, FR-8.1, FR-8.2, FR-8.3, ARCH-4, ARCH-5, ARCH-6, ARCH-16

**Story Count:** 11 stories (9 P0, 2 P1)

---

### Story 2.1: Zustand Auth Store

**As a** developer,
**I want** a Zustand store for authentication state,
**So that** auth status is accessible throughout the app.

**Acceptance Criteria:**

**Given** the app needs to track authentication state
**When** I create the auth store
**Then** `lib/stores/use-auth-store.ts` exists
**And** the store tracks: `isAuthenticated`, `user`, `sessionToken`
**And** the store persists to MMKV (not sensitive data)
**And** actions exist for `setUser`, `clearAuth`
**And** the store does NOT store the password
**And** the store integrates with the boot sequence

---

### Story 2.2: Better Auth Integration

**As a** user,
**I want** to log in with Better Auth,
**So that** I can access public-facing features and my profile.

**Acceptance Criteria:**

**Given** I am not logged in
**When** I open the app
**Then** I see a login screen with email/password fields
**And** I can submit my credentials
**And** on success, my session is stored securely
**And** on failure, I see a human-readable error message
**And** the error displays for at least 2 seconds (ARCH-13)
**And** credentials are stored in expo-secure-store (NFR-3.1)

---

### Story 2.3: Navidrome Connection Status Store

**As a** developer,
**I want** a connection status management system,
**So that** the app tracks Navidrome connectivity state.

**Acceptance Criteria:**

**Given** the app needs to track Navidrome connection
**When** I implement the connection store
**Then** `lib/stores/use-connection-store.ts` exists
**And** status enum values are: `not_configured`, `connected`, `auth_failed`, `unreachable`, `checking`
**And** the store tracks: `status`, `serverUrl`, `lastChecked`
**And** actions exist for `setStatus`, `setServerUrl`, `checkConnection`
**And** the store persists server URL to MMKV
**And** credentials persist to SecureStore (separate from URL)

---

### Story 2.4: Navidrome Server Configuration Screen

**As a** user,
**I want** to configure my Navidrome server connection,
**So that** the app can access my music library.

**Acceptance Criteria:**

**Given** I am logged in but have no Navidrome configured
**When** I navigate to server settings
**Then** I see fields for: server URL, username, password
**And** I can enter my Navidrome credentials
**And** the URL field validates format (https preferred, warns on http)
**And** touch targets are ≥44pt iOS / ≥48dp Android (NFR-5.1)
**And** a "Test Connection" button is available
**And** credentials are stored encrypted in SecureStore

---

### Story 2.5: Navidrome Connection Validation

**As a** user,
**I want** to test my Navidrome connection,
**So that** I know if my credentials work before proceeding.

**Acceptance Criteria:**

**Given** I have entered Navidrome credentials
**When** I tap "Test Connection"
**Then** a loading indicator appears within 300ms (NFR-5.3)
**And** the app pings the Navidrome server using Subsonic API
**And** auth uses token generation: `md5(password + salt)` with Subsonic params
**And** on success, status changes to `connected` and I see confirmation
**And** on auth failure, status is `auth_failed` with clear message
**And** on network failure, status is `unreachable` with retry option
**And** the validation respects ±5 minute clock drift tolerance

---

### Story 2.6: Basic Navidrome Service

**As a** developer,
**I want** a basic Navidrome service with core methods,
**So that** playback can be tested in Epic 4.

**Acceptance Criteria:**

**Given** the app needs to communicate with Navidrome
**When** I implement the Navidrome service
**Then** `lib/services/navidrome/navidrome-service.ts` exists
**And** the service implements:
  - `ping()` - test connection
  - `getArtists(offset, limit)` - paginated artist list
  - `getAlbum(id)` - album with songs
  - `getStreamUrl(songId)` - streaming URL for a song
**And** all methods use Subsonic API auth params
**And** the service is isolated (ARCH-9: screens don't import directly)
**And** a `lib/services/navidrome/navidrome.types.ts` defines response types

---

### Story 2.7: Skippable Onboarding Flow

**As a** user,
**I want** to skip onboarding and configure later,
**So that** I can explore the app before committing to setup.

**Acceptance Criteria:**

**Given** I open the app for the first time
**When** I see the onboarding flow
**Then** I can skip any step with a "Skip" or "Later" button
**And** skipping leads to the main app with empty states
**And** empty states have CTAs to complete setup
**And** I can return to configuration from settings
**And** onboarding progress is tracked in MMKV

---

### Story 2.8: Settings Screen with Connection Info

**As a** user,
**I want** to view and manage my connection settings,
**So that** I can see my current server and change it if needed.

**Acceptance Criteria:**

**Given** I am in the app
**When** I navigate to Settings
**Then** I see my current Navidrome server URL (masked password)
**And** I see connection status indicator (FR-1.6)
**And** status shows colored indicator: green=connected, yellow=checking, red=failed
**And** I can tap to edit connection settings (FR-8.2)
**And** app version is displayed (FR-8.4 - placeholder for Epic 8)

---

### Story 2.9: Log Out and Disconnect

**As a** user,
**I want** to log out and/or disconnect my Navidrome server,
**So that** I can switch accounts or servers.

**Acceptance Criteria:**

**Given** I am logged in with Navidrome connected
**When** I tap "Log Out" in settings
**Then** I see a confirmation dialog
**And** on confirm, Better Auth session is cleared
**And** Navidrome credentials are removed from SecureStore
**And** connection status resets to `not_configured`
**And** I am returned to the login screen
**And** queue and playback state are cleared

---

### Story 2.10: Empty States with CTAs

**As a** user,
**I want** helpful empty states throughout the app,
**So that** I know what to do when content is missing.

**Acceptance Criteria:**

**Given** I have not configured Navidrome
**When** I view library screens (Artists, Albums, etc.)
**Then** I see an empty state component with:
  - Relevant icon
  - Title ("No artists yet")
  - Description ("Connect to Navidrome to see your library")
  - CTA button ("Set Up" → navigates to server config)
**And** empty states follow the `<EmptyState>` component pattern
**And** empty states appear instead of loading spinners when no data exists

---

### Story 2.11: Graceful Degradation Tiers (P1)

**As a** user,
**I want** the app to degrade gracefully when offline,
**So that** I can still use available features.

**Acceptance Criteria:**

**Given** the app has three degradation tiers
**When** network conditions change
**Then** **Optimal**: Full functionality with live data
**And** **Degraded**: Cached data shown, writes queued, banner indicates status
**And** **Failed**: Offline-only features, clear messaging, retry when online
**And** transitions between tiers show appropriate UI feedback
**And** the app never crashes due to network errors

---

## Epic 3: Library Browsing

**Goal:** Users can explore their music library with smooth, fast navigation.

**Requirements Covered:** FR-2.1, FR-2.2, FR-2.3, FR-2.4, FR-2.5, FR-2.6, ARCH-10, ARCH-11

**Story Count:** 10 stories (8 P0, 1 P1, 1 P2)

---

### Story 3.1: Query Keys and TanStack Query Setup

**As a** developer,
**I want** a standardized query key structure,
**So that** caching and invalidation work correctly.

**Acceptance Criteria:**

**Given** the app uses TanStack Query for server state
**When** I set up query infrastructure
**Then** `lib/queries/query-keys.ts` defines hierarchical keys:
  - `['navidrome', 'artists']`
  - `['navidrome', 'artist', id]`
  - `['navidrome', 'albums']`
  - `['navidrome', 'album', id]`
  - `['navidrome', 'songs']`
**And** keys follow the pattern `['navidrome', entity, ...filters]`
**And** a QueryClient is configured with appropriate defaults
**And** stale time is set appropriately for music data (e.g., 5 minutes)

---

### Story 3.2: Artists List Screen

**As a** user,
**I want** to browse all artists alphabetically,
**So that** I can find music by artist name.

**Acceptance Criteria:**

**Given** I am connected to Navidrome
**When** I navigate to the Artists tab
**Then** I see a list of all artists sorted alphabetically
**And** each artist row shows: name, album count (if available)
**And** the list supports infinite scroll / pagination
**And** skeleton loading appears while data loads (ARCH-11)
**And** list scrolls at 60fps (NFR-1.6)
**And** the library handles 50,000+ songs smoothly (NFR-6.1)
**And** tapping an artist navigates to Artist Detail

---

### Story 3.3: A-Z Quick Scroll Index (P1)

**As a** user,
**I want** a quick scroll index on the artists list,
**So that** I can jump to any letter quickly.

**Acceptance Criteria:**

**Given** I am viewing the Artists list
**When** I interact with the A-Z index on the side
**Then** the list scrolls to artists starting with that letter
**And** the index is touch-friendly (≥44pt tap targets)
**And** haptic feedback fires on letter selection (light)
**And** the current letter is highlighted while scrolling
**And** the index works smoothly with large libraries

---

### Story 3.4: Artist Detail Screen

**As a** user,
**I want** to view an artist's albums,
**So that** I can explore their discography.

**Acceptance Criteria:**

**Given** I tapped on an artist
**When** the Artist Detail screen loads
**Then** I see the artist name as the header
**And** I see a grid/list of their albums with cover art
**And** albums show: title, year (if available)
**And** album art loads within 500ms (NFR-1.5)
**And** skeleton loading shows while albums load
**And** tapping an album navigates to Album Detail

---

### Story 3.5: Album Detail Screen

**As a** user,
**I want** to view an album's songs,
**So that** I can see the tracklist and play songs.

**Acceptance Criteria:**

**Given** I tapped on an album
**When** the Album Detail screen loads
**Then** I see large album art at the top
**And** I see album title, artist name, year, song count
**And** I see the tracklist with: track number, title, duration
**And** tapping a song starts playback (triggers Epic 4)
**And** a "Play All" button plays the album from track 1
**And** a "Shuffle" button plays the album shuffled
**And** search response time is <500ms (NFR-1.3)

---

### Story 3.6: Album Art Component

**As a** user,
**I want** album art displayed consistently throughout the app,
**So that** the experience is visually cohesive.

**Acceptance Criteria:**

**Given** album art appears in multiple screens
**When** I create a shared AlbumArt component
**Then** `lib/components/AlbumArt.tsx` exists
**And** it handles: loading state (skeleton), error state (placeholder), success
**And** it supports multiple sizes (small: 48px, medium: 120px, large: 300px)
**And** it uses progressive loading (blur → sharp)
**And** placeholder shows a music note icon
**And** the component is used in: Artists, Artist Detail, Album Detail, Now Playing

---

### Story 3.7: Skeleton Loading Components

**As a** user,
**I want** skeleton loaders instead of spinners,
**So that** I see the page structure while content loads.

**Acceptance Criteria:**

**Given** list screens need loading states
**When** I implement skeleton components
**Then** these skeletons exist:
  - `ArtistListSkeleton` - mimics artist row layout
  - `AlbumGridSkeleton` - mimics album grid layout
  - `TrackListSkeleton` - mimics song list layout
**And** skeletons animate with subtle shimmer
**And** skeletons match the actual content layout exactly
**And** `if (isPending) return <ArtistListSkeleton count={10} />`

---

### Story 3.8: Pull to Refresh

**As a** user,
**I want** to pull to refresh library data,
**So that** I can manually sync with my Navidrome server.

**Acceptance Criteria:**

**Given** I am viewing a library list (Artists, Albums)
**When** I pull down on the list
**Then** a refresh indicator appears
**And** the query is invalidated and refetched
**And** new data appears when the fetch completes
**And** the refresh indicator dismisses
**And** haptic feedback fires when refresh triggers

---

### Story 3.9: Navigation Tab Bar

**As a** user,
**I want** a tab bar for main navigation,
**So that** I can switch between Library, Search, and Settings.

**Acceptance Criteria:**

**Given** I am in the main app
**When** I look at the bottom of the screen
**Then** I see a tab bar with: Library, Search, Settings
**And** each tab has an icon and label
**And** the active tab is highlighted
**And** tapping a tab switches to that screen
**And** the tab bar remains visible above the mini player
**And** transitions are <300ms (NFR-1.4)

---

### Story 3.10: Recently Played (P2)

**As a** user,
**I want** to see recently played songs/albums,
**So that** I can quickly return to music I've listened to.

**Acceptance Criteria:**

**Given** I have played songs previously
**When** I view the Library screen
**Then** I see a "Recently Played" section at the top
**And** it shows the last 10 played items (songs or albums)
**And** items show album art, title, artist
**And** tapping an item navigates to that content
**And** recently played data is stored locally (MMKV)
**And** the section is hidden if no history exists

---

## Epic 4: Core Audio Playback

**Goal:** Users can play music with reliable background audio that "just works."

**Requirements Covered:** FR-4.1, FR-4.2, FR-4.3, FR-4.4, FR-4.5, FR-4.6, FR-4.7, FR-4.8, FR-4.9, ARCH-2, ARCH-3

**Story Count:** 12 stories (9 P0, 1 P1, 2 critical reliability)

---

### Story 4.1: Track Player Registration

**As a** developer,
**I want** react-native-track-player registered correctly,
**So that** background audio works reliably.

**Acceptance Criteria:**

**Given** audio playback requires Track Player
**When** I set up Track Player registration
**Then** `index.js` registers Track Player BEFORE expo-router:
```javascript
import TrackPlayer from 'react-native-track-player';
TrackPlayer.registerPlaybackService(() => require('./lib/services/track-player/playback-service'));
```
**And** registration happens before `registerRootComponent`
**And** the playback service file exists at `lib/services/track-player/playback-service.ts`
**And** Track Player initializes only AFTER Zustand hydration (boot sequence)
**And** the entry point `index.js` remains JavaScript (Expo requirement)
**And** all other source files use `.ts` or `.tsx` extensions
**And** Metro bundler resolves TypeScript files from require() calls

---

### Story 4.2: Playback Service Implementation

**As a** developer,
**I want** a playback service that handles Track Player events,
**So that** background controls and remote commands work.

**Acceptance Criteria:**

**Given** Track Player is registered
**When** I implement the playback service
**Then** `lib/services/track-player/playback-service.ts` handles:
  - `Event.RemotePlay` → play
  - `Event.RemotePause` → pause
  - `Event.RemoteNext` → skip next
  - `Event.RemotePrevious` → skip previous
  - `Event.RemoteSeek` → seek to position
  - `Event.RemoteStop` → stop playback
**And** the service syncs state with the queue store
**And** errors are caught and logged (not thrown to crash app)

---

### Story 4.3: Track Player Setup

**As a** developer,
**I want** Track Player configured with proper capabilities,
**So that** audio plays correctly on both platforms.

**Acceptance Criteria:**

**Given** Track Player is registered
**When** I set up Track Player
**Then** `lib/services/track-player/setup.ts` configures:
  - Capabilities: play, pause, stop, seekTo, skipToNext, skipToPrevious
  - Compact capabilities for notification
  - Audio session category (iOS): playback
  - Wake mode (Android): local audio
**And** setup is called during boot sequence (after Zustand hydration)
**And** setup is idempotent (safe to call multiple times)
**And** setup returns a promise that resolves when ready

---

### Story 4.4: Player Store

**As a** developer,
**I want** a Zustand store for player state,
**So that** playback UI updates reactively.

**Acceptance Criteria:**

**Given** the app needs player state management
**When** I create the player store
**Then** `lib/stores/use-player-store.ts` tracks:
  - `isPlaying: boolean`
  - `position: number`
  - `duration: number`
  - `buffered: number`
**And** the store does NOT track `currentTrack` (derived from Queue Store instead)
**And** the store syncs playback state from Track Player events
**And** position updates at reasonable intervals (every 1s while playing)

---

### Story 4.5: Play/Pause Toggle

**As a** user,
**I want** to play and pause music,
**So that** I can control playback.

**Acceptance Criteria:**

**Given** a song is loaded
**When** I tap the play/pause button
**Then** playback toggles between playing and paused
**And** the button icon updates to reflect state
**And** song starts within 2 seconds of tapping play (NFR-1.2)
**And** state syncs across all UI (mini player, full player, lock screen)
**And** pausing does not lose position

---

### Story 4.6: Skip Next/Previous

**As a** user,
**I want** to skip to the next or previous song,
**So that** I can navigate through my queue.

**Acceptance Criteria:**

**Given** music is playing with a queue
**When** I tap skip next
**Then** the next song in queue plays
**And** if at end of queue, playback stops (or loops if repeat all)
**When** I tap skip previous
**Then** if position > 3 seconds, restart current song
**And** if position ≤ 3 seconds, play previous song
**And** if at start of queue, restart current song
**And** haptic feedback fires on skip (light)

---

### Story 4.7: Seek Within Song

**As a** user,
**I want** to seek to any position in the current song,
**So that** I can skip to my favorite parts.

**Acceptance Criteria:**

**Given** a song is playing
**When** I drag the progress slider
**Then** I see the seek position preview
**And** on release, playback jumps to that position
**And** the slider shows: current time, total duration
**And** seeking works while paused
**And** seeking is smooth and responsive
**And** position updates immediately on seek

---

### Story 4.8: Background Audio Playback

**As a** user,
**I want** music to continue playing when I leave the app,
**So that** I can multitask while listening.

**Acceptance Criteria:**

**Given** music is playing
**When** I switch to another app or lock my phone
**Then** music continues playing without interruption
**And** playback survives app backgrounding for hours
**And** returning to the app shows current playback state
**And** background audio uptime is 99.9% (NFR-2.1)
**And** battery impact is <5%/hour while playing (NFR-1.8)

**Testing Notes:**
- Automated: Unit tests for playback state management
- Manual Required: Physical device test for background audio behavior
- NFR Validation: Requires extended playback session (1+ hours) to verify NFR-2.1

---

### Story 4.9: Lock Screen Controls (iOS)

**As a** user on iOS,
**I want** playback controls on the lock screen,
**So that** I can control music without unlocking.

**Acceptance Criteria:**

**Given** music is playing on iOS
**When** I view the lock screen
**Then** I see: album art, song title, artist name
**And** I see play/pause, skip next, skip previous buttons
**And** I see a progress bar
**And** controls work while locked
**And** artwork updates when song changes
**And** Control Center shows the same controls

**Testing Notes:**
- Automated: Unit tests for Now Playing Info metadata setup
- Manual Required: Physical iOS device for lock screen and Control Center verification
- Cannot be tested in iOS Simulator (lock screen controls not available)

---

### Story 4.10: Notification Controls (Android)

**As a** user on Android,
**I want** playback controls in the notification shade,
**So that** I can control music from anywhere.

**Acceptance Criteria:**

**Given** music is playing on Android
**When** I pull down the notification shade
**Then** I see a media notification with: album art, title, artist
**And** I see play/pause, skip next, skip previous buttons
**And** tapping the notification opens the app
**And** the notification persists while music plays
**And** the notification dismisses when playback stops
**And** notification uses MediaStyle for proper Android integration

**Testing Notes:**
- Automated: Unit tests for notification metadata setup
- Manual Required: Physical Android device or emulator for notification shade verification
- Emulator testing possible but physical device preferred for accurate behavior

---

### Story 4.11: Headphone Button Support (P1)

**As a** user,
**I want** headphone buttons to control playback,
**So that** I can control music without looking at my phone.

**Acceptance Criteria:**

**Given** wired or Bluetooth headphones are connected
**When** I press the play/pause button
**Then** playback toggles
**When** I double-tap (if supported by headphones)
**Then** skip to next track
**When** I triple-tap (if supported)
**Then** skip to previous track
**And** headphone disconnect pauses playback
**And** headphone reconnect does NOT auto-resume (optional setting)

**Testing Notes:**
- Automated: None (hardware-dependent)
- Manual Required: Physical device + wired headphones + Bluetooth headphones
- Test matrix: iOS wired, iOS Bluetooth, Android wired, Android Bluetooth

---

### Story 4.12: Audio Interruption Handling

**As a** user,
**I want** music to pause for phone calls and alarms,
**So that** audio interruptions are handled gracefully.

**Acceptance Criteria:**

**Given** music is playing
**When** I receive a phone call
**Then** music pauses automatically
**And** when the call ends, music resumes (or stays paused per iOS/Android default)
**When** an alarm goes off
**Then** music ducks or pauses
**And** after alarm, music resumes
**And** phone call recovery is 100% (NFR-2.5)
**And** alarm recovery is 100% (NFR-2.6)
**And** Siri/Google Assistant interruptions are handled

**Testing Notes:**
- Automated: None (requires OS-level interruptions)
- Manual Required: Physical device with SIM card for real phone calls
- Test scenarios: Incoming call, outgoing call, alarm, timer, Siri/Google Assistant
- NFR Validation: Run 10+ interruption cycles to verify 100% recovery rate

---

## Epic 5: Queue Management

**Goal:** Users can control what plays next with intuitive queue management.

**Requirements Covered:** FR-5.1, FR-5.2, FR-5.3, FR-5.4, FR-5.5, FR-5.6, FR-5.7, FR-5.8, FR-5.9

**Story Count:** 10 stories (6 P0, 4 P1)

---

### Story 5.1: Queue Store

**As a** developer,
**I want** a Zustand store for queue state,
**So that** the queue is managed reactively.

**Acceptance Criteria:**

**Given** the app needs queue management
**When** I create the queue store
**Then** `lib/stores/use-queue-store.ts` tracks:
  - `queue: Track[]`
  - `currentIndex: number`
  - `shuffleEnabled: boolean`
  - `repeatMode: 'off' | 'one' | 'all'`
**And** `currentTrack` is derived via selector: `s.queue[s.currentIndex]`
**And** actions exist for: `addToQueue`, `removeFromQueue`, `reorder`, `clear`, `playNext`, `setIndex`
**And** the store persists to MMKV
**And** queue supports 1,000+ songs (NFR-6.2)

---

### Story 5.2: Queue Screen

**As a** user,
**I want** to view the current playback queue,
**So that** I can see what's coming up.

**Acceptance Criteria:**

**Given** music is playing
**When** I tap the queue icon (from Now Playing)
**Then** I see a list of upcoming songs
**And** the currently playing song is highlighted
**And** each item shows: album art (small), title, artist, duration
**And** the queue scrolls to show the current song
**And** empty queue shows empty state with CTA to browse library

---

### Story 5.3: Drag to Reorder Queue

**As a** user,
**I want** to drag songs to reorder the queue,
**So that** I can customize playback order.

**Acceptance Criteria:**

**Given** I am viewing the queue
**When** I long-press and drag a song
**Then** the song can be moved up or down
**And** the list reorders in real-time while dragging
**And** haptic feedback fires on grab (medium)
**And** dropping the song updates the queue
**And** Track Player queue is synced immediately
**And** cannot drag the currently playing song to change current position

---

### Story 5.4: Remove Song from Queue

**As a** user,
**I want** to remove songs from the queue,
**So that** I can skip songs I don't want to hear.

**Acceptance Criteria:**

**Given** I am viewing the queue
**When** I swipe left on a song
**Then** a "Remove" action appears
**And** completing the swipe removes the song
**And** haptic feedback fires (medium)
**And** a toast shows "Removed" for 2 seconds
**And** Track Player queue is synced immediately
**And** cannot remove the currently playing song (alternative: skip and remove)

---

### Story 5.5: Add to Queue

**As a** user,
**I want** to add songs to the end of my queue,
**So that** I can queue up music for later.

**Acceptance Criteria:**

**Given** I am viewing a song (in album, search results, etc.)
**When** I tap "Add to Queue" or use the context menu
**Then** the song is added to the end of the queue
**And** haptic feedback fires (light)
**And** a toast shows "Added to queue" for 2 seconds
**And** Track Player queue is synced
**And** I can add an entire album to queue
**And** adding updates the queue store and persists

---

### Story 5.6: Play Next

**As a** user,
**I want** to insert a song to play next,
**So that** I can prioritize songs without losing my queue.

**Acceptance Criteria:**

**Given** I am viewing a song
**When** I tap "Play Next" or use the context menu
**Then** the song is inserted immediately after the current song
**And** haptic feedback fires (light)
**And** a toast shows "Playing next" for 2 seconds
**And** Track Player queue is synced
**And** the rest of the queue shifts down
**And** I can add an entire album to play next

---

### Story 5.7: Queue Persistence

**As a** user,
**I want** my queue to persist across app restarts,
**So that** I can continue where I left off.

**Acceptance Criteria:**

**Given** I have songs in my queue
**When** I close and reopen the app
**Then** the queue is restored exactly as it was
**And** the current song and position are restored
**And** playback is paused (not auto-playing)
**And** persistence uses MMKV for the queue list
**And** position is restored to the last known position

---

### Story 5.8: Shuffle Toggle (P1)

**As a** user,
**I want** to shuffle my queue,
**So that** I can hear songs in random order.

**Acceptance Criteria:**

**Given** I have songs in my queue
**When** I tap the shuffle button
**Then** shuffle mode toggles on/off
**And** the shuffle icon indicates current state
**And** when shuffle is ON:
  - Queue order is randomized (but current song stays current)
  - Unshuffling restores original order
**And** shuffle state persists across restarts
**And** haptic feedback fires on toggle

---

### Story 5.9: Repeat Modes (P1)

**As a** user,
**I want** repeat modes for my queue,
**So that** I can loop songs or the entire queue.

**Acceptance Criteria:**

**Given** I am playing music
**When** I tap the repeat button
**Then** it cycles through: Off → Repeat All → Repeat One → Off
**And** the icon changes to reflect current mode
**When** Repeat All is on
**Then** queue restarts from beginning after last song
**When** Repeat One is on
**Then** current song loops indefinitely
**And** repeat state persists across restarts
**And** haptic feedback fires on toggle

---

### Story 5.10: Clear Queue (P1)

**As a** user,
**I want** to clear my entire queue,
**So that** I can start fresh.

**Acceptance Criteria:**

**Given** I have songs in my queue
**When** I tap "Clear Queue"
**Then** a confirmation dialog appears
**And** on confirm, all songs are removed except current
**And** playback stops after current song ends
**And** haptic feedback fires (medium)
**And** Track Player queue is synced
**And** a toast shows "Queue cleared"

---

## Epic 6: Now Playing Experience

**Goal:** Users have a beautiful, polished Now Playing screen (hero screen).

**Requirements Covered:** FR-6.1, FR-6.2, FR-6.3, FR-6.4, FR-6.5, FR-6.6, ARCH-12, ARCH-15

**Story Count:** 6 stories (5 P0, 1 P1)

---

### Story 6.1: Full Now Playing Screen

**As a** user,
**I want** a beautiful Now Playing screen,
**So that** I can enjoy and control my music.

**Acceptance Criteria:**

**Given** music is playing
**When** I view the Now Playing screen
**Then** I see large album art (≥300px)
**And** I see song title, artist name, album name
**And** I see a progress bar with current time / total time
**And** I see play/pause, skip prev, skip next buttons
**And** I see queue, shuffle, repeat buttons
**And** there are NO loading states - always show last known state (ARCH-12)
**And** this is "show to a friend" quality

---

### Story 6.2: Dynamic Background Color

**As a** user,
**I want** the Now Playing background to match album art,
**So that** the experience feels immersive.

**Acceptance Criteria:**

**Given** I am viewing Now Playing
**When** a song is playing
**Then** the background uses colors extracted from album art
**And** dominant color creates a gradient background
**And** text colors adjust for contrast (≥4.5:1 ratio)
**And** color transitions smoothly when song changes
**And** fallback to neutral dark if extraction fails
**And** extraction uses `react-native-image-colors` or similar

---

### Story 6.3: Mini Player

**As a** user,
**I want** a mini player at the bottom of the screen,
**So that** I can see what's playing while browsing.

**Acceptance Criteria:**

**Given** music is playing or paused (with queue)
**When** I am on any screen (except Now Playing)
**Then** I see a mini player above the tab bar
**And** mini player shows: album art (small), title, artist
**And** mini player shows play/pause button
**And** tapping the mini player expands to full Now Playing
**And** mini player does not block tab bar taps
**And** mini player animates in/out smoothly

---

### Story 6.4: Mini to Full Player Transition

**As a** user,
**I want** smooth transitions between mini and full player,
**So that** the experience feels polished.

**Acceptance Criteria:**

**Given** the mini player is visible
**When** I tap the mini player
**Then** the Now Playing screen expands with a smooth animation
**And** album art scales up from mini to full size
**And** transition duration is <300ms (NFR-1.4)
**When** I swipe down on Now Playing
**Then** it collapses back to mini player
**And** the transition is interruptible (I can cancel mid-swipe)

---

### Story 6.5: Playback Controls Styling

**As a** user,
**I want** polished playback control buttons,
**So that** controls are easy to use and look great.

**Acceptance Criteria:**

**Given** I am on Now Playing
**When** I view the playback controls
**Then** play/pause is a large, prominent button (≥56pt)
**And** skip buttons are medium-sized (≥44pt)
**And** shuffle/repeat/queue are smaller (≥44pt min for accessibility)
**And** active states (shuffle on, repeat mode) are visually distinct
**And** buttons have appropriate touch targets
**And** haptic feedback fires on all control taps

---

### Story 6.6: Swipe Gestures for Skip (P1)

**As a** user,
**I want** to swipe on album art to skip songs,
**So that** I can control playback with gestures.

**Acceptance Criteria:**

**Given** I am on Now Playing
**When** I swipe left on the album art
**Then** skip to next song
**When** I swipe right on the album art
**Then** skip to previous song (or restart if >3s)
**And** swipe distance threshold prevents accidental triggers
**And** visual feedback shows the gesture is recognized
**And** haptic feedback fires on successful skip
**And** album art animates in the swipe direction

---

## Epic 7: Search

**Goal:** Users can quickly find any music in their library.

**Requirements Covered:** FR-3.1, FR-3.2, FR-3.3, FR-3.4, FR-3.5, FR-3.6

**Story Count:** 6 stories (4 P0, 1 P1, 1 P2)

---

### Story 7.1: Search Screen

**As a** user,
**I want** a search screen,
**So that** I can find music in my library.

**Acceptance Criteria:**

**Given** I tap the Search tab
**When** the Search screen loads
**Then** I see a search input field at the top
**And** the keyboard appears automatically (or with focus)
**And** I see placeholder text "Search artists, albums, songs..."
**And** if I haven't searched yet, I see recent searches or suggestions
**And** search results appear below the input

---

### Story 7.2: Search Results Categorized

**As a** user,
**I want** search results grouped by category,
**So that** I can find what I'm looking for quickly.

**Acceptance Criteria:**

**Given** I enter a search query
**When** results are displayed
**Then** results are grouped into: Artists, Albums, Songs
**And** each category shows up to 5 results initially
**And** "See all" expands to show all results for that category
**And** each result is tappable to navigate:
  - Artist → Artist Detail
  - Album → Album Detail
  - Song → starts playback
**And** search response time is <500ms (NFR-1.3)

---

### Story 7.3: Search Queries to Navidrome

**As a** developer,
**I want** search to query Navidrome via Subsonic API,
**So that** results come from the user's library.

**Acceptance Criteria:**

**Given** a search query is entered
**When** the search executes
**Then** the Navidrome service's `search3` endpoint is called
**And** query parameters include the search term
**And** results include: artists, albums, songs (mixed)
**And** results use TanStack Query with key `['navidrome', 'search', query]`
**And** queries are debounced (300ms) to avoid excessive API calls
**And** empty query shows recent searches, not results

---

### Story 7.4: Instant Search (Debounced) (P1)

**As a** user,
**I want** search results to update as I type,
**So that** I can find music quickly.

**Acceptance Criteria:**

**Given** I am typing in the search field
**When** I pause typing for 300ms
**Then** a search query is triggered
**And** results update without me pressing "Search"
**And** a loading indicator appears during search
**And** if I keep typing, previous pending search is cancelled
**And** fast typing doesn't flood the API

---

### Story 7.5: Recent Searches

**As a** user,
**I want** to see my recent searches,
**So that** I can quickly repeat searches.

**Acceptance Criteria:**

**Given** I have searched before
**When** I focus the search field (with empty query)
**Then** I see a list of recent searches
**And** tapping a recent search fills the input and triggers search
**And** recent searches are stored in MMKV (last 10)
**And** each search result tap adds to recent searches

---

### Story 7.6: Clear Recent Searches (P2)

**As a** user,
**I want** to clear my recent searches,
**So that** I can have a fresh start.

**Acceptance Criteria:**

**Given** I have recent searches
**When** I tap "Clear" or "Clear Recent"
**Then** a confirmation appears (or immediate clear)
**And** all recent searches are removed
**And** the UI updates to show empty state
**And** haptic feedback fires

---

## Epic 8: Scrobbling & Release

**Goal:** User's listening is tracked and the app is ready for beta distribution.

**Requirements Covered:** FR-7.1, FR-7.2, FR-7.3, FR-8.4, FR-4.10, ARCH-13, ARCH-14

**Story Count:** 9 stories (4 P0, 3 P1, 2 P2)

---

### Story 8.1: Scrobble to Navidrome (P1)

**As a** user,
**I want** my plays scrobbled to Navidrome,
**So that** my listening history is recorded.

**Acceptance Criteria:**

**Given** I play a song
**When** the scrobble threshold is met (50% OR 4 minutes)
**Then** a scrobble is sent to Navidrome via Subsonic API
**And** the scrobble endpoint is `scrobble.view`
**And** scrobbling happens in the background (no UI blocking)
**And** failed scrobbles are queued for retry
**And** offline scrobbles are queued and sent when online

---

### Story 8.2: Scrobble Threshold Logic (P1)

**As a** developer,
**I want** scrobble threshold logic,
**So that** scrobbles are accurate.

**Acceptance Criteria:**

**Given** a song is playing
**When** either 50% of the song has played OR 4 minutes have elapsed
**Then** the song is marked as scrobble-ready
**And** seeking does not count toward the threshold
**And** pausing does not reset the threshold
**And** skipping before threshold does NOT scrobble
**And** each song only scrobbles once per playthrough
**And** the logic is in `lib/services/scrobble/scrobble-service.ts`

---

### Story 8.3: Now Playing Submission (P2)

**As a** user,
**I want** "Now Playing" submitted to Navidrome,
**So that** my current song is visible on my profile.

**Acceptance Criteria:**

**Given** I start playing a song
**When** playback begins
**Then** a "now playing" update is sent to Navidrome
**And** the endpoint is `scrobble.view?submission=false` (or nowPlaying)
**And** this happens immediately on song start
**And** this is a fire-and-forget request (no retry needed)

---

### Story 8.4: App Icon and Splash Screen

**As a** user,
**I want** a professional app icon and splash screen,
**So that** the app looks polished from first launch.

**Acceptance Criteria:**

**Given** the app is being released
**When** I view the app icon or launch the app
**Then** I see a professionally designed app icon
**And** icon follows iOS and Android guidelines
**And** splash screen shows logo/branding
**And** splash screen matches the app's color scheme
**And** splash screen is generated via Expo

---

### Story 8.5: App Version Display (P2)

**As a** user,
**I want** to see the app version in Settings,
**So that** I know what version I'm using.

**Acceptance Criteria:**

**Given** I am in Settings
**When** I scroll to the bottom
**Then** I see: "Version X.Y.Z (build N)"
**And** version is pulled from app config
**And** tapping version copies to clipboard (optional Easter egg)

---

### Story 8.6: Haptic Feedback Audit

**As a** developer,
**I want** consistent haptic feedback throughout the app,
**So that** interactions feel tactile and consistent.

**Acceptance Criteria:**

**Given** the app has many interactions
**When** I audit haptic feedback
**Then** all interactions follow the pattern:
  - **Light**: add to queue, like, tap
  - **Medium**: remove, reorder grab
  - **Error**: error states
**And** haptics are implemented using `expo-haptics`
**And** haptics can be disabled in settings (accessibility)

---

### Story 8.7: Error Display Timing

**As a** developer,
**I want** errors to display for minimum 2 seconds,
**So that** users can read error messages.

**Acceptance Criteria:**

**Given** an error occurs
**When** the error toast/message appears
**Then** it displays for at least 2 seconds before auto-dismiss
**And** errors can be manually dismissed before 2 seconds
**And** multiple errors queue (don't overlap)
**And** error styling is consistent (red accent, error icon)

---

### Story 8.8: TestFlight/Play Store Beta Distribution

**As a** developer,
**I want** the app submitted for beta testing,
**So that** users can test before public release.

**Acceptance Criteria:**

**Given** the app is feature-complete for MVP
**When** I prepare for beta release
**Then** iOS build is submitted to TestFlight
**And** Android build is submitted to Play Store Internal Testing
**And** all required metadata is provided (screenshots, descriptions)
**And** privacy policy is linked
**And** Expo EAS is configured for builds
**And** CI/CD pipeline builds and submits automatically (stretch)

---

### Story 8.9: Day in the Life Test

**As a** QA engineer,
**I want** to verify the complete user journey,
**So that** the app works end-to-end.

**Acceptance Criteria:**

**Given** a fresh install
**When** I perform the "Day in the Life" test
**Then** I can:
  1. Log in with Better Auth
  2. Configure Navidrome server
  3. Browse library (Artists → Albums → Songs)
  4. Search for music
  5. Play a song, control playback
  6. Build a queue (add, remove, reorder)
  7. Background the app, verify audio continues
  8. Lock phone, use lock screen controls
  9. Receive a call, verify audio pauses and resumes
  10. Close and reopen app, verify queue persists
**And** all features work as specified
**And** no crashes occur during the journey (NFR-2.2)

**Testing Notes:**
- Automated: None (full E2E manual journey)
- Manual Required: Physical iOS device + Physical Android device
- Prerequisites: Valid Better Auth account, accessible Navidrome server
- Duration: ~30 minutes per platform
- Execute on both iOS and Android before each release

---

## Story Summary

| Epic | P0 | P1 | P2 | Total |
|------|----|----|----|----|
| Epic 1: Foundation & Security | 5 | 0 | 0 | 5 |
| Epic 2: Auth & Server Connection | 9 | 2 | 0 | 11 |
| Epic 3: Library Browsing | 8 | 1 | 1 | 10 |
| Epic 4: Core Audio Playback | 11 | 1 | 0 | 12 |
| Epic 5: Queue Management | 6 | 4 | 0 | 10 |
| Epic 6: Now Playing Experience | 5 | 1 | 0 | 6 |
| Epic 7: Search | 4 | 1 | 1 | 6 |
| Epic 8: Scrobbling & Release | 4 | 3 | 2 | 9 |
| **TOTAL** | **52** | **13** | **4** | **69** |

**MVP Stories (P0):** 52 stories
**Full Scope:** 69 stories

