# Stories

## Story 9.1: Onboarding State & New User Detection

**As a** new user, **I want** the app to recognize I'm new and guide me appropriately, **so that** I'm not overwhelmed by features that need data I don't have yet.

### Acceptance Criteria

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

### Technical Notes

- Add `onboarding_status` as a new nullable JSONB column on `user_preferences` (cleaner than nesting in `dashboard_layout`)
- API routes follow existing session auth pattern (`auth.api.getSession()`)
- Data maturity queries are lightweight (`SELECT COUNT(*)` with user filter, all indexed)
- Hook uses TanStack Query with 60s stale time

---

## Story 9.2: Onboarding Wizard (Artist Picker + Liked Songs + Last.fm Import)

**As a** new user, **I want** a guided wizard that helps me tell the app what music I like, **so that** recommendations, discovery, and radio are immediately personalized to my taste.

### Acceptance Criteria

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

### Technical Notes

- Use existing `getArtistsWithDetails()` from `navidrome.ts` for artist browsing
- Batch affinity writes in a single Drizzle transaction (`db.transaction()`)
- Last.fm import reuses `lastfm-backfill.ts` — expose existing SSE endpoint or create thin wrapper
- `calculateFullUserProfile()` is in `compound-scoring.ts` — call it directly from the completion API route
- Background discovery trigger: import `discoveryManager` singleton, call `triggerNow()` or equivalent
- Artist top tracks: use Navidrome's `getTopSongs` or `getArtistDetail().topSongs`

---

## Story 9.3: Radio Shuffle & Simplified Dashboard

**As a** user (new or returning), **I want** a one-tap "Start Radio" that plays a shuffled mix based on my taste, **and** I want the dashboard to show me only what's useful given my current data, **so that** I can start listening immediately without being overwhelmed.

### Acceptance Criteria

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

### Technical Notes

- Radio API route: combine Navidrome's `getRandomSongs()` with artist-filtered queries
- 10-play profile refresh threshold: track play count in session via Zustand (transient, not persisted)
- Progressive disclosure thresholds are constants in a shared file, easily tunable
- Don't break existing deep links — progressive disclosure is dashboard-only cosmetic
- Dashboard re-renders on query invalidation after plays hit threshold → tier upgrade is automatic

---
