# AI DJ Mode - Hybrid Recommendation Architecture

> **Status:** Planning
> **Created:** 2026-01-26
> **Author:** AI-assisted design session

## Overview

AI DJ Mode allows users to press play with an empty queue and have the AI DJ automatically generate a personalized 5-10 song starter queue based on their listening profile. The system uses a **hybrid approach**: pre-computed candidate pools for fast response, with dynamic filtering/ranking at play time.

## Goals

1. **Zero-latency startup** - No waiting for API calls when user presses play
2. **Personalized** - Based on user's listening history, liked songs, and preferences
3. **Smart transitions** - BPM and energy matching for smooth DJ-like flow
4. **Continuous** - Drip-feed recommendations every 3 songs keeps the mix going

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DAILY PRE-COMPUTATION (Background Job)           │
│                                                                     │
│  1. Sync Navidrome starred songs → likedSongsSync                  │
│  2. Calculate artist affinities from listening history             │
│  3. Calculate temporal preferences (genre by time of day)          │
│  4. Update compound scores from recent plays                       │
│  5. Generate "AI DJ Candidate Pool" → ~100 top songs               │
│     - Top compound scored songs                                     │
│     - Top artist affinity songs                                     │
│     - Liked/starred songs                                           │
│     - Store with: songId, artist, title, genre, BPM, energy, key   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│              AT PLAY TIME (User presses play, queue empty)          │
│                                                                     │
│  1. Load candidate pool from DB (zero API calls)                   │
│  2. Apply dynamic filters:                                         │
│     - Time of day preference (morning=chill, night=upbeat)         │
│     - Exclude recently played (last 24h)                           │
│     - Exclude skipped songs                                         │
│  3. Pick seed song (highest scored candidate)                      │
│  4. Build queue with BPM/Energy trajectory:                        │
│     - Analyze seed energy level                                     │
│     - If low energy: gradual build-up                              │
│     - If high energy: maintain intensity                           │
│     - BPM transitions: ±10 BPM between songs                       │
│  5. Return 5-10 songs, start playback                              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ONGOING (Drip-Feed Every 3 Songs)                │
│                                                                     │
│  Uses same candidate pool + dynamic BPM/energy matching            │
│  Inserts recommendation right after current song                   │
│  Visual: Colored duration bar indicates AI DJ active               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Existing Infrastructure (Already Built)

### Database Tables

| Table | What It Stores | Updated When |
|-------|---------------|--------------|
| `artistAffinities` | User's affinity per artist (plays, likes, skips) | Periodically |
| `temporalPreferences` | Genre preferences by time of day/season | Periodically |
| `compoundScores` | Songs suggested by multiple played songs | After plays |
| `trackSimilarities` | Cached Last.fm similar tracks | 30-day cache |
| `listeningHistory` | Every song play with skip detection | Real-time |
| `recommendationFeedback` | Thumbs up/down feedback | Real-time |
| `likedSongsSync` | Synced starred songs from Navidrome | On sync |

### Existing Scoring Mechanisms

- **Compound scoring** - Songs suggested by multiple plays rank higher
- **Skip scoring** - Penalize frequently skipped songs
- **DJ match scoring** - BPM, energy, key compatibility
- **Blended scoring** - Combines all signals with weights

---

## New Components Required

### 1. Database: AI DJ Candidate Pool Table

```sql
CREATE TABLE ai_dj_candidate_pool (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),

  -- Song identifiers
  song_id TEXT NOT NULL,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  album TEXT,
  genre TEXT,

  -- DJ metadata (for BPM/energy matching)
  bpm REAL,
  energy REAL,        -- 0.0-1.0
  musical_key TEXT,   -- e.g., "Am", "C", "F#m"

  -- Pre-computed scores
  profile_score REAL NOT NULL,      -- Combined score from all signals
  compound_score REAL DEFAULT 0,    -- From compound scoring
  affinity_score REAL DEFAULT 0,    -- From artist affinity
  is_liked INTEGER DEFAULT 0,       -- 1 if starred/liked
  play_count INTEGER DEFAULT 0,     -- Total plays

  -- Source tracking (for debugging/analytics)
  source TEXT,        -- 'compound', 'affinity', 'liked', 'mixed'

  -- Timestamps
  calculated_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,    -- Recalculate after this

  UNIQUE(user_id, song_id)
);

-- Indexes
CREATE INDEX ai_dj_pool_user_score_idx ON ai_dj_candidate_pool(user_id, profile_score DESC);
CREATE INDEX ai_dj_pool_user_energy_idx ON ai_dj_candidate_pool(user_id, energy);
CREATE INDEX ai_dj_pool_user_bpm_idx ON ai_dj_candidate_pool(user_id, bpm);
CREATE INDEX ai_dj_pool_expires_idx ON ai_dj_candidate_pool(expires_at);
```

### 2. Service: Candidate Pool Generator

**File:** `src/lib/services/ai-dj-pool-generator.ts`

```typescript
interface CandidatePoolConfig {
  maxCandidates: number;      // Default: 100
  compoundWeight: number;     // Default: 0.35
  affinityWeight: number;     // Default: 0.30
  likedWeight: number;        // Default: 0.25
  playCountWeight: number;    // Default: 0.10
  expiryHours: number;        // Default: 24
}

async function generateCandidatePool(userId: string, config?: CandidatePoolConfig): Promise<void> {
  // 1. Fetch top compound scored songs (limit 50)
  // 2. Fetch top artist affinity songs (limit 50)
  // 3. Fetch all liked/starred songs
  // 4. Merge and dedupe by songId
  // 5. Enrich with DJ metadata (BPM, energy, key) from Navidrome
  // 6. Calculate combined profile_score
  // 7. Store top 100 in ai_dj_candidate_pool
}
```

### 3. Service: Initial Queue Builder

**File:** `src/lib/services/ai-dj-queue-builder.ts`

```typescript
interface QueueBuilderOptions {
  queueSize: number;          // Default: 7 (5-10 range)
  energyMode: 'build' | 'maintain' | 'descend' | 'auto';
  maxBpmDelta: number;        // Default: 10
  timeOfDayBoost: boolean;    // Default: true
}

async function buildInitialQueue(userId: string, options?: QueueBuilderOptions): Promise<Song[]> {
  // 1. Load candidate pool from DB
  // 2. Apply exclusions (recently played, skipped)
  // 3. Apply time-of-day filtering
  // 4. Pick seed song (highest scored after filters)
  // 5. Build queue using BPM/energy trajectory
  // 6. Return ordered list of songs
}
```

### 4. BPM/Energy Trajectory Algorithm

```typescript
type EnergyMode = 'build' | 'maintain' | 'peak';

function determineEnergyMode(seedEnergy: number): EnergyMode {
  if (seedEnergy < 0.4) return 'build';      // Low energy → build up
  if (seedEnergy < 0.7) return 'maintain';   // Medium → maintain
  return 'peak';                              // High → stay high or gentle descent
}

function selectNextSong(
  candidates: CandidateSong[],
  previousSong: { bpm: number; energy: number },
  mode: EnergyMode,
  position: number,
  totalSongs: number
): CandidateSong {
  // Filter by BPM range (±10 of previous)
  const bpmFiltered = candidates.filter(c =>
    Math.abs(c.bpm - previousSong.bpm) <= 10
  );

  // Score by energy trajectory
  const scored = bpmFiltered.map(c => {
    let energyScore = 0;

    switch (mode) {
      case 'build':
        // Prefer slightly higher energy (but not too much)
        const targetEnergy = previousSong.energy + (0.1 * (position / totalSongs));
        energyScore = 1 - Math.abs(c.energy - targetEnergy);
        break;
      case 'maintain':
        // Prefer similar energy (±0.1)
        energyScore = 1 - Math.abs(c.energy - previousSong.energy);
        break;
      case 'peak':
        // Stay high or gentle descent
        energyScore = c.energy >= previousSong.energy - 0.1 ? 1 : 0.5;
        break;
    }

    return { ...c, trajectoryScore: energyScore };
  });

  // Pick highest trajectory score
  return scored.sort((a, b) => b.trajectoryScore - a.trajectoryScore)[0];
}
```

### 5. API Endpoint

**File:** `src/routes/api/ai-dj/generate-queue.ts`

```typescript
// POST /api/ai-dj/generate-queue
// Request: { queueSize?: number, energyMode?: string }
// Response: { songs: Song[], source: 'pool', metadata: { ... } }
```

### 6. UI Changes

#### Now Playing Button Enhancement

When queue is empty and AI DJ is enabled:
- Button triggers `buildInitialQueue()` instead of "nothing to play"
- Shows brief loading state: "AI DJ is curating..."
- Starts playback immediately when queue is ready

#### Visual Indicator: Colored Duration Bar

When AI DJ mode is active:
- Progress/duration bar has a subtle gradient or accent color
- Could be purple gradient (matches AI DJ branding)
- Indicates to user that AI DJ is in control

**Implementation options:**
1. CSS class toggle on PlayerBar when `aiDJEnabled && hasAIDJGeneratedQueue`
2. Gradient: `bg-gradient-to-r from-purple-500/20 to-pink-500/20`

---

## Implementation Phases

### Phase 1: Database & Pool Generator
- [ ] Create `ai_dj_candidate_pool` table schema
- [ ] Run migration
- [ ] Implement `generateCandidatePool()` service
- [ ] Add to existing daily/periodic job (or create new one)

### Phase 2: Queue Builder
- [ ] Implement `buildInitialQueue()` service
- [ ] Implement BPM/energy trajectory algorithm
- [ ] Add time-of-day filtering logic
- [ ] Create API endpoint `/api/ai-dj/generate-queue`

### Phase 3: Audio Store Integration
- [ ] Modify play button logic to detect empty queue + AI DJ enabled
- [ ] Call `buildInitialQueue()` when conditions met
- [ ] Update drip-feed to use candidate pool with BPM matching

### Phase 4: UI Polish
- [ ] Add colored duration bar when AI DJ active
- [ ] Add loading state for queue generation
- [ ] Add indicator showing "AI DJ Mode" somewhere subtle

---

## Configuration Options

### User Preferences (AI DJ Settings)

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `aiDJInitialQueueSize` | 7 | 5-10 | Songs to generate on empty queue |
| `aiDJEnergyMode` | 'auto' | auto/build/maintain | How to handle energy trajectory |
| `aiDJBpmTolerance` | 10 | 5-20 | Max BPM difference between songs |
| `aiDJTimeOfDayBoost` | true | bool | Adjust for time of day |

### Scoring Weights (Internal)

| Signal | Weight | Rationale |
|--------|--------|-----------|
| Compound Score | 35% | Multiple plays suggest this song |
| Artist Affinity | 30% | User loves this artist |
| Liked/Starred | 25% | Explicit positive signal |
| Play Count | 10% | Frequency matters but less than quality |

---

## Open Questions

1. **Pool refresh frequency** - Daily at midnight? Or after every N plays?
2. **Cold start** - What if user has no listening history? Fall back to liked songs only? Random high-rated songs?
3. **Pool size** - 100 candidates enough? Or should we go larger (200)?
4. **Energy detection** - Do we have reliable energy data from Navidrome, or need to analyze/estimate?

---

## Related Documents

- [Recommendation Engine Refactor](./recommendation-engine-refactor.md)
- [Profile-Based Recommendations Plan](../../.claude/plans/glowing-churning-naur.md)

---

## Appendix: Existing Files Reference

| File | Purpose |
|------|---------|
| `src/lib/services/compound-scoring.ts` | Compound score calculation |
| `src/lib/services/artist-affinity.ts` | Artist affinity calculation |
| `src/lib/services/profile-recommendations.ts` | Current profile-based recs |
| `src/lib/services/dj-match-scorer.ts` | BPM/energy/key scoring |
| `src/lib/services/blended-recommendation-scorer.ts` | Multi-signal scoring |
| `src/lib/db/schema/profile.schema.ts` | Profile tables (affinity, temporal) |
| `src/lib/db/schema/listening-history.schema.ts` | History + compound scores |
| `src/lib/stores/audio.ts` | Audio player + AI DJ state |
