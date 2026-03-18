# Epic 9: User Onboarding & Dashboard Simplification — Brownfield Enhancement

## Epic Goal

Provide new users with a multi-step onboarding wizard that fully bootstraps the recommendation pipeline (artist selection → liked songs sync → optional Last.fm import → profile calculation → background discovery trigger), while simplifying the dashboard to progressively reveal features as data matures — getting users listening within 60 seconds and producing meaningful recommendations on the first discovery run.

## Epic Description

### Existing System Context

- **Dashboard**: `src/routes/dashboard/index.tsx` renders DashboardHero, QuickActions (6 mood presets), AI Studio feature cards, and DiscoveryQueueSection — all visible from first login regardless of whether the user has any listening data
- **Current "onboarding"**: Only a "Sync Liked Songs" button in the hero CTA, plus a feedback migration toast. No artist selection, no taste profiling, no progressive feature reveal

#### Recommendation Pipeline Data Flow

The recommendation engine is a multi-signal system where **listening history is the master signal** feeding nearly every scorer:

```
USER ACTION (play/skip/like/select artist)
    ↓
listeningHistory table ──────────────────────────────────────────┐
    ↓                                                            │
recordSongPlay() → async fetchAndStoreSimilarTracks()            │
    ↓                    → Last.fm API → trackSimilarities       │
    ↓                                                            │
calculateFullUserProfile() ─── 4-step pipeline:                  │
    ├─ 1. syncLikedSongsToFeedback()                             │
    │      → Navidrome starred → recommendationFeedback           │
    │      → likedSongsSync (35% of affinity weight)             │
    ├─ 2. calculateCompoundScores()                              │
    │      → listeningHistory × trackSimilarities                │
    │      → compoundScores (20% of blended score)               │
    ├─ 3. calculateArtistAffinities()                            │
    │      → 50% play counts + 35% liked counts - 15% skips     │
    │      → artistAffinities table                              │
    └─ 4. calculateTemporalPreferences()                         │
           → genre × timeSlot × season                           │
           → temporalPreferences (5% of blended score)           │
                                                                 │
Background Discovery (every 12h) ◄───────────────────────────────┘
    Seeds from: 40% top-played + 35% recent + 25% thumbs-up
    → discoverySuggestions

Blended Recommendation Scorer (on demand):
    25% Last.fm similarity
    20% compound scores (needs 5+ unique plays)
    20% DJ match (BPM/energy/key)
    15% feedback (thumbs up/down)
    10% skip penalty (needs 2+ plays per song)
     5% temporal preferences (needs plays at different times)
     5% diversity bonus
```

#### Current Cold-Start Gaps

| System | What It Needs | Current Bootstrap | Gap |
|--------|--------------|-------------------|-----|
| Background Discovery | Seeds from listening history or feedback | None — returns empty for new users | **No seeds = no discovery** |
| Compound Scoring | 5+ unique plays in `listeningHistory` | Only from actual playback | **Days/weeks to accumulate** |
| Artist Affinities | Play counts + liked counts from `listeningHistory` + `likedSongsSync` | Only computed after 10+ plays | **No affinity data at start** |
| Temporal Preferences | Plays at different times/seasons | Only from `listeningHistory` | **Needs time to accumulate** |
| Feedback Scoring | `recommendationFeedback` entries | Only from manual thumbs or liked sync | **Empty for new users** |
| Skip Scoring | 2+ plays per song in `listeningHistory` | Only from actual playback | **Needs repeat listens** |

### Enhancement Details

**What's being added/changed:**

1. **Onboarding detection & state** — Track onboarding progress in `user_preferences`. Detect new users by: no listening history + no artist affinities + onboarding not completed.

2. **Multi-step onboarding wizard** with 3 steps that seed the full pipeline:
   - **Step 1: Pick Your Artists** — Browse/search Navidrome library, select favorites → seeds `artist_affinities` (baseline 0.7 score) + bulk `thumbs_up` feedback for top tracks → immediately primes background discovery seeds (25% from feedback) and blended scorer feedback signal (15%)
   - **Step 2: Sync Liked Songs** — One-tap sync of Navidrome starred songs → seeds `recommendationFeedback` (source='library') + `likedSongsSync` → feeds 35% of affinity weight and provides additional discovery seeds
   - **Step 3: Connect Last.fm** (optional) — Import historical scrobbles via existing `lastfm-backfill.ts` → populates `listeningHistory` with real play data + triggers `fetchAndStoreSimilarTracks()` for each → cascades into compound scores, affinities, temporal prefs, skip data — **this is the single highest-impact onboarding action**

3. **Post-onboarding pipeline trigger** — On wizard completion, immediately:
   - Call `calculateFullUserProfile()` (runs all 4 computation steps)
   - Trigger background discovery run (don't wait 12 hours)
   - Start radio shuffle from seeded artists

4. **Radio shuffle mode** — "Start Radio" action that pulls songs from seed artists, shuffles, starts playback. Every song played records to `listeningHistory` via normal `recordSongPlay()` path, which async-fetches Last.fm similarities — continuously building compound scores.

5. **Simplified dashboard with progressive disclosure** — Three tiers based on data maturity, not just onboarding completion.

**How it integrates — systems seeded per onboarding step:**

| Onboarding Step | Tables Written | Scorers Fed | Discovery Impact |
|----------------|---------------|-------------|-----------------|
| Pick Artists | `artist_affinities`, `recommendation_feedback` | Feedback (15%), Affinities | 25% of seeds (thumbs-up artists) |
| Sync Liked Songs | `recommendation_feedback`, `liked_songs_sync` | Feedback (15%), Affinities (+35% liked weight) | Additional seed artists |
| Last.fm Import | `listening_history`, `track_similarities` | Compound (20%), Skip (10%), Temporal (5%), Affinities (+50% play weight) | 75% of seeds (top-played + recent) |
| Radio Playback | `listening_history` (ongoing) | All scorers (via normal play recording) | Continuous feed |
| Post-completion trigger | `compound_scores`, `artist_affinities`, `temporal_preferences` | Pre-computes all derived scores | Triggers immediate discovery run |

**Success criteria:**

- New users reach music playback within 60 seconds of first dashboard visit
- Artist selections + liked songs sync produce meaningful recommendations on first background discovery run (even without Last.fm)
- Last.fm import (when used) fully bootstraps the recommendation pipeline as if the user had been listening for months
- Dashboard is not overwhelming for users with zero listening data
- Existing users are unaffected — full dashboard shown as before
- Onboarding is skippable and non-blocking

---

## Stories

### Story 9.1: Onboarding State & New User Detection

**As a** new user, **I want** the app to recognize I'm new and guide me appropriately, **so that** I'm not overwhelmed by features that need data I don't have yet.

#### Acceptance Criteria

- [ ] Add `onboardingStatus` JSONB field to `user_preferences` with shape:
  ```ts
  {
    completed: boolean;
    completedAt?: string;        // ISO date
    skipped?: boolean;
    skippedAt?: string;
    selectedArtistIds?: string[]; // Navidrome artist IDs from step 1
    likedSongsSynced?: boolean;   // Step 2 completed
    lastfmImported?: boolean;     // Step 3 completed
    lastfmUsername?: string;      // For re-import / display
    currentStep?: number;         // Resume support (1-3)
  }
  ```
- [ ] Create API route `GET /api/onboarding/status` — returns onboarding state for current user plus data maturity metrics:
  ```ts
  {
    onboardingCompleted: boolean;
    onboardingSkipped: boolean;
    currentStep: number;
    dataMaturiy: {
      listeningHistoryCount: number;   // total plays
      artistAffinityCount: number;     // artists with affinities
      feedbackCount: number;           // thumbs up/down count
      hasLikedSongs: boolean;          // liked songs synced
      hasLastfmImport: boolean;        // last.fm data present
    }
  }
  ```
- [ ] Create API route `POST /api/onboarding/complete` — marks onboarding as completed, triggers `calculateFullUserProfile()` + background discovery run (non-blocking)
- [ ] Create API route `POST /api/onboarding/skip` — marks onboarding as skipped (user can resume later from settings)
- [ ] New user detection logic: `listeningHistory` count = 0 AND `artistAffinities` count = 0 AND onboarding not completed/skipped
- [ ] Add `useOnboardingStatus` hook that queries the status endpoint and exposes `{ isNewUser, onboardingCompleted, dataMaturiy, currentStep, isLoading }`
- [ ] Data maturity thresholds defined as constants:
  ```ts
  const DATA_MATURITY = {
    LOW: 0,        // No data — show onboarding
    EMERGING: 10,  // Some plays — show radio + basics
    READY: 30,     // Enough for recommendations — show full dashboard
  }
  ```
- [ ] Existing user data and dashboard behavior unchanged
- [ ] DB migration is backward compatible (nullable JSONB column with default)

#### Technical Notes

- Add `onboarding_status` as a new nullable JSONB column on `user_preferences` (cleaner than nesting in `dashboard_layout`)
- API routes follow existing session auth pattern (`auth.api.getSession()`)
- Data maturity queries are lightweight (`SELECT COUNT(*)` with user filter, all indexed)
- Hook uses TanStack Query with 60s stale time

---

### Story 9.2: Onboarding Wizard (Artist Picker + Liked Songs + Last.fm Import)

**As a** new user, **I want** a guided wizard that helps me tell the app what music I like, **so that** recommendations, discovery, and radio are immediately personalized to my taste.

#### Acceptance Criteria

**Step 1: Pick Your Artists**
- [ ] Create `OnboardingWizard` component with step indicator (1/3, 2/3, 3/3)
- [ ] Step 1 displays a searchable, responsive grid of artist cards from the Navidrome library
- [ ] Each card shows: album art (lazy-loaded), artist name, song count
- [ ] Search bar with 300ms debounce filters artists by name
- [ ] Default sort: by album count descending (popular artists first)
- [ ] Tap to select/deselect with visual checkmark overlay and selected counter
- [ ] Minimum 3 artists required to proceed (helper text: "Pick at least 3 artists you enjoy")
- [ ] Mobile: 2-col grid; Tablet: 3-4 col; Desktop: 5-6 col
- [ ] Create API route `GET /api/onboarding/artists` — paginated artist list from Navidrome (uses `getArtistsWithDetails()`)
- [ ] Create API route `POST /api/onboarding/artists/select` — accepts `{ artistIds: string[] }`:
  - Writes `artist_affinities` rows with `affinityScore: 0.7`, `likedCount: 1` per artist
  - For each artist: fetches top 3-5 tracks from Navidrome, writes `recommendation_feedback` with `feedbackType: 'thumbs_up'`, `source: 'library'`
  - Saves `selectedArtistIds` to onboarding status
  - Updates `currentStep: 2`

**Step 2: Sync Liked Songs**
- [ ] Shows count of starred songs available in Navidrome (pre-fetched)
- [ ] One-tap "Sync Now" button triggers existing `/api/playlists/liked-songs/sync` + `syncLikedSongsToFeedback()`
- [ ] Progress indicator while syncing
- [ ] Shows result: "Synced X liked songs"
- [ ] "Skip" option if user has no starred songs or wants to skip
- [ ] Updates `likedSongsSynced: true` and `currentStep: 3`

**Step 3: Connect Last.fm (Optional)**
- [ ] Explains benefit: "Import your listening history for instant personalized recommendations"
- [ ] Username input field
- [ ] "Import" button triggers existing `lastfm-backfill.ts` service
- [ ] SSE progress bar (reuses existing backfill progress tracking)
- [ ] Shows result: "Imported X plays across Y artists"
- [ ] "Skip" option prominently available (this step is optional)
- [ ] Updates `lastfmImported: true`, `lastfmUsername` on completion

**Wizard Completion**
- [ ] "Finish" button on final step (or after skip of step 3):
  - Calls `POST /api/onboarding/complete`
  - Server-side: triggers `calculateFullUserProfile()` (syncs liked songs → compound scores → affinities → temporal prefs)
  - Server-side: triggers immediate background discovery run via `discoveryManager.triggerNow()`
  - Client-side: invalidates onboarding status query → dashboard re-renders in post-onboarding state
  - Client-side: auto-starts radio shuffle from seed artists
- [ ] Wizard is resumable — if user leaves mid-wizard, `currentStep` persists and they resume on next visit
- [ ] "Skip entire setup" option available on every step

#### Technical Notes

- Use existing `getArtistsWithDetails()` from `navidrome.ts` for artist browsing
- Batch affinity writes in a single Drizzle transaction (`db.transaction()`)
- Last.fm import reuses `lastfm-backfill.ts` — expose existing SSE endpoint or create thin wrapper
- `calculateFullUserProfile()` is in `compound-scoring.ts` — call it directly from the completion API route
- Background discovery trigger: import `discoveryManager` singleton, call `triggerNow()` or equivalent
- Artist top tracks: use Navidrome's `getTopSongs` or `getArtistDetail().topSongs`

---

### Story 9.3: Radio Shuffle & Simplified Dashboard

**As a** user (new or returning), **I want** a one-tap "Start Radio" that plays a shuffled mix based on my taste, **and** I want the dashboard to show me only what's useful given my current data, **so that** I can start listening immediately without being overwhelmed.

#### Acceptance Criteria

**Radio Shuffle:**
- [ ] Create API route `GET /api/radio/shuffle` — accepts optional `{ artistIds?: string[], count?: number }`:
  - If `artistIds` provided: fetch random songs from those artists via Navidrome
  - If no `artistIds` but user has `artist_affinities`: use top 10 affinity artists
  - If no affinity data: pull diverse random sample from full Navidrome library (`getRandomSongs()`)
  - Default count: 30 songs
  - Returns shuffled song list with full metadata (id, title, artist, album, albumArt, duration)
- [ ] Add "Start Radio" button to dashboard hero CTA
- [ ] Radio uses existing audio store: `setPlaylist()` + `playSong()` + `setIsPlaying(true)`
- [ ] Radio plays are recorded via normal `recordSongPlay()` path — each play:
  - Writes to `listeningHistory`
  - Async-fetches Last.fm similar tracks → `trackSimilarities`
  - Continuously builds compound scores over time
- [ ] After 10 radio plays in a session, trigger async `calculateFullUserProfile()` refresh (non-blocking, fire-and-forget) to update affinities and compound scores with fresh play data
- [ ] If AI DJ is enabled, radio seeds the initial queue and AI DJ takes over for subsequent songs
- [ ] Radio button replaces "Sync Liked Songs" CTA for users who completed onboarding

**Simplified Dashboard (Progressive Disclosure):**
- [ ] Dashboard checks onboarding status + data maturity on mount via `useOnboardingStatus` hook
- [ ] **Tier 1 — New User** (onboarding not done, `listeningHistoryCount < DATA_MATURITY.EMERGING`):
  - Show hero greeting + `OnboardingWizard` component prominently
  - Hide: mood presets, AI studio cards, discovery queue
- [ ] **Tier 2 — Emerging** (`DATA_MATURITY.EMERGING <= count < DATA_MATURITY.READY`):
  - Show hero with "Start Radio" CTA + mood presets (QuickActions)
  - Show teaser cards for AI Recommendations and Playlist Studio with lock icon and message: "Play more music to unlock" with progress indicator (e.g., "12/30 plays")
  - Hide: discovery queue (or show collapsed with "Building your discovery profile...")
- [ ] **Tier 3 — Ready** (`count >= DATA_MATURITY.READY`):
  - Show full dashboard as it exists today (hero, mood presets, AI studio cards, discovery queue)
- [ ] Transition between tiers is seamless — react to query invalidation, no page reload
- [ ] All features remain accessible via direct URL (e.g., `/dashboard/generate` works regardless of tier)
- [ ] "Complete your profile" nudge card for users who skipped onboarding, dismissible, links back to wizard
- [ ] Skeleton/loading state shown while onboarding status loads (default to Tier 1 to avoid feature flash)

#### Technical Notes

- Radio API route: combine Navidrome's `getRandomSongs()` with artist-filtered queries
- 10-play profile refresh threshold: track play count in session via Zustand (transient, not persisted)
- Progressive disclosure thresholds are constants in a shared file, easily tunable
- Don't break existing deep links — progressive disclosure is dashboard-only cosmetic
- Dashboard re-renders on query invalidation after plays hit threshold → tier upgrade is automatic

---

## Compatibility Requirements

- [x] Existing APIs remain unchanged — all new endpoints are additive
- [x] Database schema changes are backward compatible — new nullable JSONB column on existing table
- [x] UI changes follow existing patterns — Radix/shadcn components, Tailwind styling, glass-card design system
- [x] Performance impact is minimal — artist list cached, onboarding status is lightweight COUNT queries
- [x] Existing users see no difference — data maturity thresholds default to Tier 3 (full dashboard) when listening history exists
- [x] `calculateFullUserProfile()` and background discovery trigger are existing server-side functions called from new API routes — no new computation logic

## Risk Mitigation

- **Primary Risk:** Onboarding artist selections could produce low-quality seed data if the library has few artists or the user picks artists with few songs
  - **Mitigation:** Set minimum 3 artists, show song counts on cards, fall back to library-wide radio if seed data is thin
- **Secondary Risk:** Last.fm import could be slow for users with large scrobble histories (100k+)
  - **Mitigation:** SSE progress tracking with cancel option, import runs async and doesn't block wizard completion, rate limiting already handled by existing backfill service
- **Tertiary Risk:** Dashboard conditional rendering could flash wrong state on slow connections
  - **Mitigation:** Default to Tier 1 (simplified) while loading — showing less is better than flashing everything then hiding it
- **Rollback Plan:** Feature is entirely additive. Remove onboarding check → dashboard renders fully as before. New API routes and DB column are inert without UI references. No existing tables or APIs modified.

## Definition of Done

- [ ] All 3 stories completed with acceptance criteria met
- [ ] New users see onboarding wizard on first visit
- [ ] Artist selections seed `artist_affinities` + `recommendation_feedback` → feed into blended scorer and discovery
- [ ] Liked songs sync populates `recommendation_feedback` + `liked_songs_sync` → feeds 35% of affinity weight
- [ ] Last.fm import (when used) populates `listening_history` + triggers similarity fetching → cascades into compound scores, affinities, temporal prefs
- [ ] `calculateFullUserProfile()` runs on onboarding completion → all derived tables computed
- [ ] Background discovery triggers immediately post-onboarding → suggestions available within minutes
- [ ] Radio shuffle works with and without seed data, plays recorded to `listeningHistory`
- [ ] Dashboard progressively reveals features across 3 tiers as data matures
- [ ] Existing users see no regression in dashboard or playback behavior
- [ ] Mobile and desktop layouts tested
- [ ] No regression in existing features (playback, playlists, AI DJ, cross-device sync)

---

## Recommendation Pipeline Coverage Summary

After full onboarding completion (all 3 steps + radio listening), every scorer in the blended recommendation engine has seed data:

| Scorer | Weight | Seeded By |
|--------|--------|-----------|
| Last.fm Similarity | 25% | Always available (API call, no user data needed) |
| Compound Scores | 20% | Last.fm import → `listeningHistory` → `trackSimilarities` → `compoundScores`; Radio plays continue feeding |
| DJ Match | 20% | Navidrome metadata (BPM/energy/key) — no user data needed |
| Feedback | 15% | Artist picker (thumbs_up for top tracks) + liked songs sync (source='library') |
| Skip Penalty | 10% | Radio plays → `listeningHistory.skipDetected`; Last.fm import provides historical plays |
| Temporal Prefs | 5% | Last.fm import (historical timestamps) + radio plays at current time |
| Diversity | 5% | Computed at query time — no seed data needed |

**Without Last.fm** (steps 1+2 only): Feedback (15%), Last.fm (25%), DJ Match (20%) are active = 60% of scoring works immediately. Compound + Skip + Temporal build as user listens via radio.

**With Last.fm** (all 3 steps): All 7 scorers have data from day one = 100% pipeline coverage.

---

## Story Manager Handoff

> Please develop detailed user stories for this brownfield epic. Key considerations:
>
> - This is an enhancement to an existing system running React 19 + TanStack Start/Router + Vite + Drizzle ORM + PostgreSQL + Zustand + Radix UI/shadcn
> - Integration points: `user_preferences` (onboarding state), `artist_affinities` (seed affinities), `recommendation_feedback` (thumbs-up signals), `liked_songs_sync` (Navidrome stars), `listening_history` (Last.fm import + radio plays), `track_similarities` (auto-fetched on play), `compound_scores` / `temporal_preferences` (computed by `calculateFullUserProfile()`), `navidrome.ts` (artist browsing + song fetching), `lastfm-backfill.ts` (scrobble import), `discovery-generator.ts` (background discovery), `useAudioStore` (radio playback)
> - Existing patterns to follow: TanStack Query for data fetching, session auth checks in API routes, Zustand stores for client state, glass-card premium UI components, responsive grid layouts
> - Critical compatibility: existing dashboard must work identically for users with listening data, all new API routes must check session auth, DB changes must be backward compatible, `calculateFullUserProfile()` and background discovery are existing server functions — call them, don't reimplement
> - Each story must include verification that existing functionality remains intact
>
> The epic should maintain system integrity while delivering a streamlined onboarding experience that fully bootstraps the multi-signal recommendation pipeline and gets new users listening as fast as possible.
