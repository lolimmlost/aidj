# Epic Description

## Existing System Context

- **Dashboard**: `src/routes/dashboard/index.tsx` renders DashboardHero, QuickActions (6 mood presets), AI Studio feature cards, and DiscoveryQueueSection — all visible from first login regardless of whether the user has any listening data
- **Current "onboarding"**: Only a "Sync Liked Songs" button in the hero CTA, plus a feedback migration toast. No artist selection, no taste profiling, no progressive feature reveal

### Recommendation Pipeline Data Flow

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

### Current Cold-Start Gaps

| System | What It Needs | Current Bootstrap | Gap |
|--------|--------------|-------------------|-----|
| Background Discovery | Seeds from listening history or feedback | None — returns empty for new users | **No seeds = no discovery** |
| Compound Scoring | 5+ unique plays in `listeningHistory` | Only from actual playback | **Days/weeks to accumulate** |
| Artist Affinities | Play counts + liked counts from `listeningHistory` + `likedSongsSync` | Only computed after 10+ plays | **No affinity data at start** |
| Temporal Preferences | Plays at different times/seasons | Only from `listeningHistory` | **Needs time to accumulate** |
| Feedback Scoring | `recommendationFeedback` entries | Only from manual thumbs or liked sync | **Empty for new users** |
| Skip Scoring | 2+ plays per song in `listeningHistory` | Only from actual playback | **Needs repeat listens** |

## Enhancement Details

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
