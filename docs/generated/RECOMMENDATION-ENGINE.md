<!-- Generated: 2026-02-15 -->

# Recommendation Engine Reference

## Pipeline Overview

| Property | Value |
|----------|-------|
| Orchestrator | `src/lib/services/recommendations.ts` (~1,350 lines) |
| Blended Scorer | `src/lib/services/blended-recommendation-scorer.ts` |
| Entry Point | `getBlendedRecommendations()` |
| Modes | `similar`, `discovery`, `mood`, `personalized` |
| Fallback Chain | Last.fm `getSimilarTracks` -> compound scoring -> mood translation |

### Mode Descriptions

| Mode | Behavior |
|------|----------|
| `similar` | Library-mode; finds similar songs using Last.fm `getSimilarTracks` |
| `discovery` | Finds songs not in user's library via Last.fm similarity |
| `mood` | Uses AI mood translation + smart playlist evaluation |
| `personalized` | Multi-signal blended scoring across all sources |

---

## Blended Recommendation Scorer

**File:** `src/lib/services/blended-recommendation-scorer.ts`

Gathers candidates from ALL sources and scores each candidate using ALL signals. Replaces the sequential fallback chain that caused single-artist loops.

### Scoring Weights (`SCORE_WEIGHTS`)

| Signal | Weight | Description |
|--------|--------|-------------|
| `lastFm` | 0.25 (25%) | Last.fm similarity score |
| `compound` | 0.20 (20%) | Listening history correlation |
| `dj` | 0.20 (20%) | BPM/Energy/Key transition compatibility |
| `feedback` | 0.15 (15%) | User explicit preferences (thumbs up/down) |
| `skip` | 0.10 (10%) | Avoid frequently skipped songs |
| `temporal` | 0.05 (5%) | Time-of-day bonus |
| `diversity` | 0.05 (5%) | Artist variety bonus |

### Candidate Limits Per Source (`CANDIDATE_LIMITS`)

| Source | Max Candidates |
|--------|---------------|
| `lastfm` | 20 |
| `sameArtist` | 2 (reduced to prevent artist domination) |
| `similarArtists` | 10 |
| `genre` | 10 |
| `compound` | 10 |
| `liked` | 5 |
| `temporal` | 5 |

### Candidate Source Types

`'lastfm' | 'same_artist' | 'similar_artist' | 'genre' | 'compound' | 'liked' | 'temporal'`

### Diversity Rules

| Rule | Value |
|------|-------|
| `MAX_SONGS_PER_ARTIST` | 1 (max songs from same artist in final results) |
| `MIN_UNIQUE_ARTISTS` | 2 (minimum different artists in results) |
| `SEARCH_THROTTLE_MS` | 100ms between searches to avoid rate limiting |

---

## Compound Scoring

**File:** `src/lib/services/compound-scoring.ts`

Platypush-inspired algorithm: if 5 different played songs all suggest "Song X", then "Song X" ranks higher than a song suggested by only 1 played song.

### Formula

```
compound_score = SUM(match_score * recency_weight)
recency_weight = e^(-0.15 * days_ago)
```

The recency decay gives approximately 50% weight after 5 days.

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `RECENCY_DECAY_RATE` | 0.15 | Exponential decay rate |
| `MIN_COMPOUND_SCORE` | 0.1 | Minimum score to include in results |
| `MAX_RECOMMENDATIONS` | 50 | Maximum recommendations returned |
| `LOOKBACK_DAYS` | 14 | Days of listening history to consider |

### Algorithm

| Step | Action |
|------|--------|
| 1 | Get user's recent listening history (last 14 days) |
| 2 | For each played song, get similar tracks from cache (`track_similarities` table) |
| 3 | For each similar track, accumulate: raw score (sum of match scores) weighted by recency |

---

## Skip Scoring

**File:** `src/lib/services/skip-scoring.ts`

Penalizes frequently skipped songs in recommendations.

### Formulas

```
adjustedScore = baseScore * (1 - skipPenalty)
skipPenalty = (songSkipRate * 0.5) + (artistSkipRate * 0.3) + (genreSkipRate * 0.2)
```

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `SONG_SKIP_WEIGHT` | 0.5 | Direct song skip rate (strongest signal) |
| `ARTIST_SKIP_WEIGHT` | 0.3 | Artist-level skip pattern |
| `GENRE_SKIP_WEIGHT` | 0.2 | Genre-level skip pattern (weakest signal) |
| `HIGH_SKIP_RATE` | 0.7 | 70%+ skip rate triggers heavy penalty |
| `MIN_PLAYS_FOR_PENALTY` | 2 | Minimum plays before skip penalty applies |

---

## DJ Match Scoring

**File:** `src/lib/services/dj-match-scorer.ts`

Scores transition compatibility between songs for DJ-style mixing.

### DJ Weights (`DJ_WEIGHTS`)

| Component | Weight | Description |
|-----------|--------|-------------|
| `bpm` | 0.40 | Most important for smooth beatmatching |
| `energy` | 0.35 | Second most important for flow |
| `key` | 0.25 | Harmonic mixing compatibility |

### BPM Thresholds (`BPM_THRESHOLDS`)

| Match Quality | Threshold | Meaning |
|--------------|-----------|---------|
| `PERFECT` | 1% | Within 1% BPM difference |
| `TIGHT` | 3% | Within 3% BPM difference |
| `GOOD` | 5% | Within 5% BPM difference |
| `ACCEPTABLE` | 8% | Within 8% (with pitch adjustment) |
| `HALFHALF` | 3% | Within 3% of half/double time |

### Minimum Score

| Constant | Value |
|----------|-------|
| `MIN_DJ_SCORE_THRESHOLD` | 0.5 |

---

## Artist Fatigue

**File:** `src/lib/services/artist-fatigue.ts`

Prevents exhausting artist libraries. Artists on cooldown are temporarily blocked from recommendations.

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `FATIGUE_THRESHOLD` | 0.8 | 80% of artist's songs played/queued triggers fatigue |
| `COOLDOWN_HOURS` | 48 | Cooldown duration once fatigued |
| `LOOKBACK_HOURS` | 72 | Window for checking recent play history |

### Simplified Trigger

If >8 unique songs by the same artist are played in the last 72 hours, the artist goes on a 48-hour cooldown.

---

## Artist Affinity

**File:** `src/lib/services/artist-affinity.ts`

Calculates user affinity for artists based on listening history. Used as a positive signal in recommendation scoring.

### Affinity Weights

| Factor | Weight | Description |
|--------|--------|-------------|
| `PLAY_WEIGHT` | 0.5 | Play count contribution |
| `LIKED_WEIGHT` | 0.35 | Liked/starred songs (strong positive signal) |
| `SKIP_PENALTY` | 0.15 | Skip count (negative signal) |

### Configuration

| Constant | Value |
|----------|-------|
| `AFFINITY_LOOKBACK_DAYS` | 90 |

---

## Artist Blocklist

**File:** `src/lib/services/artist-blocklist.ts`

User-configurable service for explicitly blocking artists from recommendations. Also supports a system-level blocklist for known problematic patterns (e.g., test tracks). User blocklist is cached and stored in `userPreferences`.

---

## Mood Translation

**File:** `src/lib/services/mood-translator.ts` (~1,100 lines)

The ONLY place AI/LLM is used in the recommendation system. Translates natural language mood strings into audio feature criteria (energy, valence, danceability, etc.) for smart playlist evaluation.

| Property | Value |
|----------|-------|
| LLM Usage | Mood string interpretation only |
| Output | `SmartPlaylistQuery` with conditions on genre, BPM, year, rating, etc. |
| Fallback | Rule-based translation when LLM unavailable |

### Query Structure

| Field | Type |
|-------|------|
| `all` | Array of conditions (AND logic) |
| `any` | Array of conditions (OR logic) |
| `limit` | Max results |
| `sort` | `random`, `rating`, `playCount`, `recent` |

### Supported Query Fields

`genre`, `year`, `rating`, `bpm`, `artist`, `album`, `title`, `playCount`, `loved`

---

## Seasonal Patterns

**File:** `src/lib/services/seasonal-patterns.ts` (247 lines)

Applies seasonal adjustments to recommendation scores using temporal metadata from the `recommendation_feedback` table.

### Inputs

| Input | Source |
|-------|--------|
| Month / Season | Current date |
| Day of week | Current date |
| Hour | Current time |
| Genre & artist preferences | `recommendation_feedback` table |

### Configuration

| Constant | Value |
|----------|-------|
| `MIN_FEEDBACK_THRESHOLD` | 10 (minimum feedback entries per season for pattern detection) |

---

## Time-Based Discovery

**File:** `src/lib/services/time-based-discovery.ts` (790 lines)

Incorporates time-of-day and day-of-week patterns into recommendations.

### Time Context

| Field | Type | Description |
|-------|------|-------------|
| `timeSlot` | `TimeSlot` | Morning / afternoon / evening / night |
| `dayOfWeek` | `number` | 0-6 (Sunday = 0) |
| `hour` | `number` | 0-23 |
| `isWeekend` | `boolean` | Saturday or Sunday |

### Behavioral Examples

| Time Period | Tendency |
|-------------|----------|
| Morning | Favor chill / calm music |
| Evening | Favor upbeat / energetic music |

---

## Background Discovery System

Two files in `src/lib/services/background-discovery/`:

| File | Lines | Purpose |
|------|-------|---------|
| `discovery-manager.ts` | ~488 | Coordinates discovery runs, manages state, scheduling, retry |
| `discovery-generator.ts` | ~684 | Generates discovery feed items using the recommendation pipeline |

### Discovery Manager Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable automatic background discovery |
| `frequencyHours` | Configurable | Interval between discovery runs |
| `retryDelayMinutes` | Configurable | Retry delay after failure |
| `maxRetries` | Configurable | Max retry attempts before disabling |

### Discovery Generator

Seed selection distribution for discovery suggestions:

| Seed Source | Weight | Description |
|-------------|--------|-------------|
| Top played artists | 40% | From listening history |
| Recently played | 35% | Last 7 days |
| Thumbs-up feedback artists | 25% | From `recommendation_feedback` |

### Generator Configuration (`DEFAULT_DISCOVERY_CONFIG`)

| Setting | Default |
|---------|---------|
| `maxSuggestionsPerRun` | 15 |
| `seedCount` | 10 |
| `excludedGenres` | `[]` |

---

## Discovery Feed

### Components

| Component | File | Lines | Description |
|-----------|------|-------|-------------|
| Store | `src/lib/stores/discovery-feed.ts` | ~588 | Zustand store for feed state |
| Schema | `src/lib/db/schema/discovery-feed.schema.ts` | ~416 | DB schema for feed tables |
| API Routes | `src/routes/api/discovery-feed/` | -- | index, analytics, interactions, notifications/preferences |

### Feed Item Types

`'song' | 'playlist' | 'artist' | 'album' | 'mood_playlist'`

### Recommendation Sources

`'time_pattern' | 'compound_score' | 'mood_match' | 'genre_match' | 'discovery' | 'trending' | 'personalized'`

### Interaction Tracking

| Field | Type | Description |
|-------|------|-------------|
| `shown` | boolean | Item displayed to user |
| `clicked` | boolean | User clicked the item |
| `played` | boolean | User played the content |
| `playDuration` | number | How long the user listened |
| `saved` | boolean | User saved/bookmarked the item |
| `skipped` | boolean | User skipped the item |

---

## Database Tables

| Table | Schema File | Used By |
|-------|-------------|---------|
| `listening_history` | `listening-history.schema.ts` | Compound scoring, skip scoring, artist fatigue, artist affinity |
| `track_similarities` | `listening-history.schema.ts` | Compound scoring (cached similarity data) |
| `compound_scores` | `listening-history.schema.ts` | Compound scoring results |
| `recommendation_feedback` | `recommendations.schema.ts` | Feedback signal, temporal patterns, seasonal patterns |
| `recommendations_cache` | `preferences.schema.ts` | Cached recommendation results |
| `discovery_suggestions` | `background-discovery.schema.ts` | Background discovery results |
| `discovery_feed_items` | `discovery-feed.schema.ts` | Discovery feed content |
| `discovery_feed_interactions` | `discovery-feed.schema.ts` | User interactions with feed |

---

## Data Flow Summary

```
User Request (mode: similar|discovery|mood|personalized)
    |
    v
recommendations.ts (orchestrator)
    |
    +--> getBlendedRecommendations()
    |        |
    |        +--> Gather candidates from ALL sources
    |        |       lastfm (20), sameArtist (2), similarArtists (10),
    |        |       genre (10), compound (10), liked (5), temporal (5)
    |        |
    |        +--> Score each candidate with ALL signals
    |        |       lastFm 25% + compound 20% + dj 20% + feedback 15%
    |        |       + skip 10% + temporal 5% + diversity 5%
    |        |
    |        +--> Apply diversity rules
    |        |       MAX_SONGS_PER_ARTIST = 1
    |        |       MIN_UNIQUE_ARTISTS = 2
    |        |
    |        +--> Apply artist fatigue filter
    |        |       (48h cooldown if >8 songs in 72h)
    |        |
    |        +--> Apply artist blocklist filter
    |        |
    |        v
    |     Ranked results
    |
    +--> Fallback: Last.fm getSimilarTracks
    +--> Fallback: Compound scoring
    +--> Fallback: Mood translation (LLM)
```

### Background Discovery Flow

```
discovery-manager.ts (scheduler)
    |
    +--> discovery-generator.ts
    |       |
    |       +--> Select seeds (40% top played, 35% recent, 25% liked)
    |       +--> Generate suggestions via recommendation pipeline
    |       +--> Store in discovery_suggestions table
    |
    +--> time-based-discovery.ts
    |       |
    |       +--> Generate time-aware feed items
    |       +--> Store in discovery_feed_items table
    |
    +--> User interacts via discovery feed UI
            |
            +--> Interactions stored in discovery_feed_interactions
            +--> Feedback loops back into recommendation scoring
```
