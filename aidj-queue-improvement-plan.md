# AIDJ Queue Improvement Plan
**Date:** 2026-01-01
**Status:** ✅ Implementation Complete (Phase 1-3) - All code working
**Goal:** Improve genre variety and prevent artist exhaustion in AIDJ queue management

---

## Problem Summary

Based on testing with Patrick Holland and other smaller artists, the AIDJ feature exhibits these issues:

1. **Artist Exhaustion Pattern**: Queues all songs from one artist, then switches to another artist and queues all their songs
2. **Poor Genre Variety**: Especially noticeable with smaller music libraries (rap works better due to volume)
3. **Fallback Chain Too Aggressive**: When Last.fm fails, falls back to "all songs by same artist"
4. **No Cross-Batch Artist Diversity**: Each new batch can re-add songs from previously exhausted artists
5. **Skip Data Unused**: System tracks play completion but doesn't use it to improve recommendations

---

## Root Cause Analysis

### Issue 1: Fallback Chain Problems

**Current Flow:**
```
Last.fm Similar Tracks
  ↓ (no library matches)
Same Artist Fallback → Returns ALL songs by current artist
  ↓ (no same-artist songs)
Genre Random Fallback → Picks random artist, adds multiple songs
```

**Problems:**
- `fallbackToSameArtist`: No limit on how many songs returned (can be entire discography)
- `applyDiversity`: Only limits to 2 songs per artist **per batch**
- No memory of which artists were recently exhausted across multiple batches

### Issue 2: Genre Matching Weakness

**Current Implementation** (`fallbackToGenreRandom` line 741-747):
```typescript
const genreMatches = filtered.filter(s => {
  const songGenre = s.genre?.toLowerCase() || '';
  return targetGenres.some(tg =>
    songGenre.includes(tg) || tg.includes(songGenre)
  );
});
```

**Problems:**
- Loose string matching: "Rock" matches "Hard Rock", "Folk Rock", "Punk Rock"
- No subgenre hierarchy: "Hip-Hop" should understand "Trap" ≠ "Boom Bap" ≠ "Melodic Rap"
- Queue context often empty: Client songs don't have genre metadata
- No genre similarity scoring: All matches weighted equally

### Issue 3: Skip/Feedback Not Utilized

**What's Tracked:**
- ✅ Play duration (`recordSongPlay`)
- ✅ Completion status (80% threshold)
- ✅ Compound scores (multi-source recommendations)
- ✅ Recent plays for exclusion

**What's NOT Used:**
- ❌ Skip detection (< 30% played = skip)
- ❌ Negative scoring for frequently skipped songs
- ❌ Artist-level skip patterns
- ❌ Genre preference learning from skips

---

## Proposed Solutions

### Phase 1: Immediate Fixes (High Impact, Low Complexity)

#### 1.1 Limit Same-Artist Fallback
**File:** `src/lib/services/recommendations.ts` (function `fallbackToSameArtist`)

**Changes:**
- Add hard limit of 3 songs max from same artist fallback
- Prioritize less-played or higher-rated songs from that artist
- If user has 20 Patrick Holland songs, return only 3 best-match ones

**Impact:** Prevents "all Patrick Holland songs" problem immediately

---

#### 1.2 Cross-Batch Artist Diversity Tracking
**File:** `src/lib/stores/audio.ts` (AI DJ state)

**Changes:**
- Add new state field: `aiDJRecentlyQueuedArtistCounts: Map<string, number>`
- Track how many songs queued per artist in last 2 hours
- Pass this to recommendations API as `recentArtistCounts`
- In `applyDiversity`, enforce global limit (e.g., max 5 songs per artist across all batches in 2hr window)

**Impact:** Prevents artist exhaustion across multiple queue refills

---

#### 1.3 Improve Queue Context Genre Extraction
**File:** `src/routes/api/ai-dj/recommendations.ts` (function `extractQueueContext`)

**Changes:**
- When client songs have no genre, use Last.fm tag data as fallback
- Cache genre data in track similarities table
- Increase sample size from 25 to 50 songs for better genre distribution analysis
- Weight genres by recency (recent songs weighted higher)

**Impact:** Better genre context → better fallback recommendations

---

### Phase 2: Genre Matching Improvements (Medium Impact, Medium Complexity)

#### 2.1 Genre Hierarchy & Similarity System
**New File:** `src/lib/services/genre-hierarchy.ts`

**Features:**
- Define genre taxonomy (e.g., Hip-Hop → [Trap, Boom Bap, Melodic, Drill])
- Similarity scoring: "Trap" is 0.8 similar to "Drill", 0.3 similar to "Boom Bap"
- Configurable genre mappings loaded from JSON config

**Example Structure:**
```typescript
{
  "Hip-Hop": {
    "subgenres": ["Trap", "Boom Bap", "Melodic Rap", "Drill", "Cloud Rap"],
    "similar": ["R&B", "Soul"],
    "dissimilar": ["Country", "Classical"]
  },
  "Trap": {
    "parent": "Hip-Hop",
    "similar": ["Drill", "Cloud Rap"],
    "similarity_scores": {
      "Drill": 0.8,
      "Boom Bap": 0.3
    }
  }
}
```

**Impact:** Smarter genre matching understands "Trap" vs "Boom Bap" vs "Melodic Rap"

---

#### 2.2 Enhanced Genre Matching in Fallback
**File:** `src/lib/services/recommendations.ts` (function `fallbackToGenreRandom`)

**Changes:**
- Replace simple string matching with genre hierarchy scoring
- Use weighted genre distribution instead of just "top 3 genres"
- Calculate genre similarity scores for each candidate song
- Sort by similarity score before applying 70/30 split

**Example:**
```typescript
// Current: songGenre.includes(targetGenre)
// New: getGenreSimilarityScore(songGenre, targetGenre) → 0.0-1.0
const genreSimilarity = calculateGenreSimilarity(
  song.genre,
  queueContext.genres,
  genreHierarchy
);
```

**Impact:** More nuanced genre matching, better variety within genre families

---

### Phase 3: Skip-Based Learning (High Impact, High Complexity)

#### 3.1 Skip Detection & Tracking
**File:** `src/lib/services/listening-history.ts`

**Changes:**
- Add `skipDetected` field to listening history
- Detection logic: `playDuration < 0.3 * songDuration && playDuration > 5`
  - Must play at least 5 seconds (not accidental skip)
  - Must play less than 30% (clear skip signal)
- Track skip patterns per song, artist, and genre

**New Function:**
```typescript
async function recordSkip(
  userId: string,
  song: { songId, artist, genre },
  playDuration: number,
  totalDuration: number
): Promise<void>
```

**Impact:** Foundation for skip-based recommendation filtering

---

#### 3.2 Skip-Based Song Scoring
**New File:** `src/lib/services/skip-scoring.ts`

**Features:**
- Calculate skip rate per song (skips / total plays)
- Calculate skip rate per artist
- Calculate skip rate per genre/subgenre
- Time-decay weighting (recent skips weighted higher)

**Scoring Algorithm:**
```typescript
skipPenalty = (skipRate * 0.5) + (artistSkipRate * 0.3) + (genreSkipRate * 0.2)
adjustedScore = baseScore * (1 - skipPenalty)
```

**Impact:** Songs/artists you consistently skip get deprioritized

---

#### 3.3 Integrate Skip Scoring into Recommendations
**File:** `src/lib/services/recommendations.ts` (function `getSimilarSongs`)

**Changes:**
- After Last.fm similar tracks filtering, apply skip scoring
- Reorder recommendations by adjusted score
- Filter out songs with skip rate > 70%
- Add skip scores to compound scoring calculation

**Impact:** AIDJ learns from your skip behavior over time

---

### Phase 4: Advanced Features (Lower Priority)

#### 4.1 Artist Fatigue Detection ✅
**New File:** `src/lib/services/artist-fatigue.ts`

**Implementation:**
- ✅ Created artist fatigue service with configurable thresholds (80% fatigue, 48hr cooldown)
- ✅ Added `aiDJArtistFatigueCooldowns` state to audio store
- ✅ Integrated fatigue calculation into API endpoint
- ✅ API returns fatigue cooldowns to client for state updates
- ✅ Fatigued artists excluded from recommendations via `excludeArtists` parameter
- ✅ Automatic cleanup of expired cooldowns on each queue refill

**Features:**
- Calculates fatigue per artist based on listening history (last 72 hours)
- When ≥80% of artist's songs have been played, artist goes on 48-hour cooldown
- Cooldown automatically expires and artist is gradually reintroduced
- Server-side fatigue calculation prevents client manipulation
- Non-blocking: fatigue detection failure doesn't break recommendations

---

#### 4.2 Genre Discovery Mode ✅
**Enhanced Files:** `src/lib/db/schema/preferences.schema.ts`, `src/lib/services/recommendations.ts`, `src/routes/api/ai-dj/recommendations.ts`

**Implementation:**
- ✅ Added `aiDJGenreExploration` setting (0-100 slider, default 50)
- ✅ 0 = strict genre matching (90% high-match songs, 10% medium)
- ✅ 50 = balanced (70% high-match, 30% medium)
- ✅ 100 = adventurous exploration (50% high-match, 50% medium+low)
- ✅ Dynamic adjustment of genre similarity thresholds
- ✅ At exploration >70, low-scoring songs included for discovery
- ✅ Migration generated: `drizzle/0014_spicy_rumiko_fujikawa.sql`

**Features:**
- Dynamically adjusts genre/variety split based on user preference
- Linear interpolation: `highPercent = 0.9 - (exploration * 0.004)`
- Console logging: `🎛️ [Genre Exploration] Level: 50% - targeting 70% high scorers, 30% medium/low`
- Non-breaking: defaults to 50 (balanced) if not set

---

#### 4.3 "More Like This" Nudge Enhancement
**File:** `src/lib/stores/audio.ts` (function `nudgeMoreLikeThis`)

**Current Behavior:** Adds similar songs to queue
**Enhancement:**
- Explicitly boost current song's genre in queue context
- Temporarily increase genre matching strictness
- Prioritize artists similar to current (not same artist)

---

## Implementation Priority Roadmap

### Sprint 1: Quick Wins (1-2 days)
- ✅ 1.1: Limit same-artist fallback to 3 songs
- ✅ 1.2: Cross-batch artist diversity tracking
- ✅ 1.3: Improve queue context genre extraction

**Expected Impact:** 60% reduction in artist exhaustion issues

---

### Sprint 2: Genre Intelligence (3-4 days)
- ✅ 2.1: Build genre hierarchy system
- ✅ 2.2: Enhance genre matching in fallback

**Expected Impact:** 70% improvement in genre variety for smaller libraries

---

### Sprint 3: Skip Learning (4-5 days)
- ✅ 3.1: Skip detection & tracking
- ✅ 3.2: Skip-based song scoring
- ✅ 3.3: Integrate skip scoring into recommendations

**Expected Impact:** 50% fewer repeated mistakes (songs you always skip)

---

### Sprint 4: Polish & Advanced Features (2-3 days)
- ✅ 4.1: Artist fatigue detection
- ✅ 4.2: Genre discovery mode setting
- ✅ 4.3: Enhanced "More Like This" nudge

**Expected Impact:** Fine-tuned personalization, power-user features

---

## Testing Strategy

### Test Scenarios

#### Scenario 1: Small Artist Library (Patrick Holland)
**Setup:** Library with 10-15 songs by Patrick Holland, few similar artists
**Success Criteria:**
- AIDJ should queue max 3 Patrick Holland songs per batch
- Should not exhaust all Patrick Holland songs in one session
- Should find genre-related artists even if Last.fm has no data

#### Scenario 2: Genre Variety (Hip-Hop)
**Setup:** Playing Juice WRLD, library has Trap, Boom Bap, Melodic Rap, Drill
**Success Criteria:**
- Queue should mix subgenres intelligently
- Should not queue 5 Future songs, then 5 Lil Uzi songs
- Should understand Trap ≈ Drill but Trap ≠ Boom Bap

#### Scenario 3: Skip Learning
**Setup:** Consistently skip songs by Artist X, complete songs by Artist Y
**Success Criteria:**
- After 5 skips, Artist X songs should appear less frequently
- Artist Y songs should be prioritized
- Skip patterns should persist across sessions

#### Scenario 4: Cross-Batch Diversity
**Setup:** Long listening session (2+ hours), multiple queue refills
**Success Criteria:**
- No artist should have >5 songs queued in 2-hour window
- Recently exhausted artists should be on cooldown
- Should see >5 different artists in queue at any time

---

## Metrics & Monitoring

### Key Metrics to Track

1. **Artist Diversity Score**
   - Unique artists per 20 songs queued
   - Target: >10 unique artists per 20 songs

2. **Genre Coherence Score**
   - % of songs matching queue context genres
   - Target: 70-80% genre match, 20-30% variety

3. **Skip Rate**
   - % of AIDJ-queued songs skipped
   - Target: <20% skip rate

4. **Fallback Frequency**
   - % of batches using Last.fm vs fallback
   - Track: Same-artist fallback vs genre-random fallback usage

5. **Artist Exhaustion Events**
   - How often >50% of artist's library queued in one session
   - Target: <5% of sessions

---

## Configuration & Tunables

### New Settings to Add

```typescript
// src/lib/stores/preferences.ts - recommendationSettings
interface AIDJSettings {
  // Existing
  aiDJEnabled: boolean;
  aiDJBatchSize: number;
  aiDJQueueThreshold: number;

  // New - Phase 1
  maxSongsPerArtistPerBatch: number;        // Default: 3
  maxSongsPerArtistPer2Hours: number;       // Default: 5
  artistCooldownMinutes: number;             // Default: 120

  // New - Phase 2
  genreMatchingStrictness: number;           // 0-100, Default: 70
  genreVarietyPercentage: number;            // 0-100, Default: 30
  enableSubgenreMatching: boolean;           // Default: true

  // New - Phase 3
  enableSkipLearning: boolean;               // Default: true
  skipThresholdPercentage: number;           // Default: 30
  skipPenaltyWeight: number;                 // 0-1, Default: 0.5

  // New - Phase 4
  enableArtistFatigueDetection: boolean;    // Default: true
  artistExhaustionThreshold: number;        // 0-100, Default: 80
}
```

---

## Risks & Mitigations

### Risk 1: Over-filtering
**Problem:** Too many exclusions → no recommendations found
**Mitigation:**
- Implement graceful degradation (relax filters if no results)
- Always return *something* even if quality is lower
- Monitor "empty recommendation" events

### Risk 2: Performance Impact
**Problem:** Genre similarity calculations add latency
**Mitigation:**
- Cache genre hierarchy calculations
- Pre-compute genre similarities on library scan
- Use database indexes for skip rate queries

### Risk 3: User Preference Conflicts
**Problem:** Some users want discovery, others want consistency
**Mitigation:**
- Make all features configurable via settings
- Provide presets: "Conservative", "Balanced", "Adventurous"
- Allow per-user tuning of all parameters

### Risk 4: Skip Learning False Positives
**Problem:** User skips due to interruption, not dislike
**Mitigation:**
- Require multiple skips before penalty (>3 skips)
- Time-decay weighting (old skips matter less)
- Don't penalize first-time plays

---

## Success Criteria

### Phase 1 Success (Quick Wins)
- [ ] Patrick Holland test: Max 3 songs queued per batch
- [ ] No artist has >5 songs in 2-hour window
- [ ] Queue context genres populated >80% of the time

### Phase 2 Success (Genre Intelligence)
- [ ] Genre hierarchy system covers top 50 genres
- [ ] Subgenre matching distinguishes Trap vs Boom Bap
- [ ] Genre coherence score >70% in testing

### Phase 3 Success (Skip Learning)
- [ ] Skip detection accuracy >90%
- [ ] Skipped songs appear 50% less frequently after 5 skips
- [ ] Artist skip patterns prevent exhaustion

### Final Success (Overall)
- [ ] Artist diversity score >10 per 20 songs
- [ ] Skip rate <20% for AIDJ recommendations
- [ ] User reports improved variety in testing
- [ ] Works well for small libraries (100-500 songs)

---

## Notes & Future Considerations

### Genre Hierarchy Data Sources
- Use MusicBrainz genre taxonomy
- Supplement with Last.fm tag data
- Allow user customization/override
- Consider ML-based genre similarity (future)

### Skip Learning Privacy
- All skip data is local to user
- No cross-user skip aggregation (privacy concern)
- User can clear skip history in settings

### Mobile Performance
- Genre hierarchy loaded on app start (not per recommendation)
- Skip scoring computed in background worker
- Cache aggressively to minimize DB queries

### Integration with Existing Features
- Compound scoring should include skip penalties
- Artist blocklist should sync with artist fatigue detection
- Genre preferences should inform genre hierarchy weights

---

## Questions for User

1. **Artist Limits:** Is 3 songs per artist per batch too restrictive? Or just right?
2. **Genre Strictness:** Should users be able to tune genre matching strictness, or keep it automatic?
3. **Skip Threshold:** What % of song played should count as "skip"? (Current plan: <30%)
4. **Artist Cooldowns:** Should exhausted artists be blocked for 2 hours, 24 hours, or user-configurable?
5. **Genre Hierarchy:** Should we auto-generate from Last.fm tags, or manually curate a genre taxonomy?

---

## References

### Key Files to Modify

**Phase 1:**
- `src/lib/services/recommendations.ts` (fallbackToSameArtist, applyDiversity)
- `src/lib/stores/audio.ts` (AI DJ state, monitorQueueForAIDJ)
- `src/routes/api/ai-dj/recommendations.ts` (extractQueueContext)

**Phase 2:**
- `src/lib/services/genre-hierarchy.ts` (new file)
- `src/lib/services/recommendations.ts` (fallbackToGenreRandom, genre matching)

**Phase 3:**
- `src/lib/services/listening-history.ts` (skip detection)
- `src/lib/services/skip-scoring.ts` (new file)
- `src/lib/services/recommendations.ts` (integrate skip scores)
- `src/lib/db/schema/listening-history.schema.ts` (add skipDetected field)

**Phase 4:**
- `src/lib/services/artist-fatigue.ts` (new file)
- `src/lib/stores/preferences.ts` (new settings)
- `src/components/ai-dj-settings.tsx` (UI for new settings)

### Database Schema Changes

**listening_history table:**
```sql
ALTER TABLE listening_history ADD COLUMN skip_detected INTEGER DEFAULT 0;
ALTER TABLE listening_history ADD INDEX idx_skip_detection (user_id, skip_detected, played_at);
```

**New table: genre_similarities (optional, for caching)**
```sql
CREATE TABLE genre_similarities (
  genre_1 TEXT NOT NULL,
  genre_2 TEXT NOT NULL,
  similarity_score REAL NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (genre_1, genre_2)
);
```

---

**End of Plan**
