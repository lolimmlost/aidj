<!-- Generated: 2026-02-18 -->

# Recommendation Engine

## Pipeline Overview

```
User triggers recommendation (mood prompt, AI DJ, autoplay, similar)
  │
  ├─ recommendations.ts — mode router
  │   ├─ mode: 'mood'  → mood-translator → Navidrome smart playlist
  │   ├─ mode: 'ai_dj' → blended-recommendation-scorer (multi-signal)
  │   ├─ mode: 'similar' → Navidrome getSimilarSongs
  │   └─ mode: 'random' → Navidrome getRandomSongs
  │
  ├─ [AI DJ path] blended-recommendation-scorer.ts
  │   ├─ Gather candidates from 7 sources
  │   ├─ Score each candidate using 7 signals
  │   ├─ Apply diversity rules (max 1 per artist)
  │   ├─ Apply artist fatigue / blocklist filters
  │   └─ Return top N scored songs
  │
  └─ [Safe Mode] filter explicit songs via Deezer lookup
```

## Recommendation Modes (`recommendations.ts` — 603 lines)

| Mode | Trigger | Strategy |
|------|---------|----------|
| `mood` | User types mood prompt | AI translates mood → Navidrome smart playlist criteria; fallback to keyword mapping |
| `ai_dj` | AI DJ drip-feed or manual queue | Blended multi-signal scoring from current context |
| `similar` | "More like this" | Navidrome `getSimilarSongs` API |
| `random` | Fallback / shuffle | Navidrome `getRandomSongs` API |

## Blended Scoring (`blended-recommendation-scorer.ts` — 535 lines)

### Score Weights

| Signal | Weight | Source |
|--------|-------:|--------|
| Last.fm similarity | 25% | Last.fm similar tracks/artists API |
| Compound scoring | 20% | Listening history correlation |
| DJ matching | 20% | BPM/Energy/Key transition quality |
| Feedback | 15% | User thumbs up/down history |
| Skip penalty | 10% | Skip rate history |
| Temporal bonus | 5% | Time-of-day listening patterns |
| Artist diversity | 5% | Variety bonus for different artists |

### Candidate Limits (per source)

| Source | Max Candidates |
|--------|---------------:|
| Last.fm similar | 20 |
| Same artist | 2 |
| Similar artists | 10 |
| Genre match | 10 |
| Compound scores | 10 |
| Liked songs | 5 |
| Temporal match | 5 |

### Diversity Rules

- Max 1 song per artist in final results (`MAX_SONGS_PER_ARTIST = 1`)
- Minimum 2 unique artists if possible (`MIN_UNIQUE_ARTISTS = 2`)
- Slight randomization in top candidates for variety
- Search throttle: 100ms between Navidrome searches to avoid rate limiting

## Compound Scoring (`compound-scoring.ts`)

The key insight: if 5 different songs you played all suggest "Song X" via Last.fm similar tracks, then "Song X" should rank higher than a song suggested by only 1 played song.

### Formula

```
compound_score = SUM(match_score * recency_weight)
recency_weight = e^(-decay_rate * days_ago)
```

### Constants

| Constant | Value | Description |
|----------|------:|-------------|
| `RECENCY_DECAY_RATE` | 0.15 | ~50% weight after 5 days |
| `MIN_COMPOUND_SCORE` | 0.1 | Minimum to include in results |
| `MAX_RECOMMENDATIONS` | 50 | Max results returned |
| `LOOKBACK_DAYS` | 14 | Days of history to consider |

## Skip Scoring (`skip-scoring.ts`)

### Formula

```
skipPenalty = (songSkipRate * 0.5) + (artistSkipRate * 0.3) + (genreSkipRate * 0.2)
adjustedScore = baseScore * (1 - skipPenalty)
```

### Constants

| Constant | Value | Description |
|----------|------:|-------------|
| `SONG_SKIP_WEIGHT` | 0.5 | Direct song skip rate weight |
| `ARTIST_SKIP_WEIGHT` | 0.3 | Artist-level skip pattern weight |
| `GENRE_SKIP_WEIGHT` | 0.2 | Genre-level skip pattern weight |
| `HIGH_SKIP_RATE` | 0.7 | 70%+ = heavily penalize |
| `MIN_PLAYS_FOR_PENALTY` | 2 | Need 2+ plays before applying penalty |

## DJ Match Scoring (`dj-match-scorer.ts` — 298 lines)

Scores song transitions for smooth DJ-style playback based on BPM, energy, and musical key.

### Weights

| Component | Weight |
|-----------|-------:|
| BPM match | 40% |
| Energy match | 35% |
| Key match | 25% |

### BPM Thresholds

| Match Level | Tolerance | Description |
|-------------|----------:|-------------|
| Perfect | 1% | Within 1% of target BPM |
| Tight | 3% | Within 3% |
| Good | 5% | Within 5% |
| Acceptable | 8% | Within 8% |
| Half/double time | 3% | Half or double BPM within 3% |

**Minimum DJ Score**: 0.5 (songs below this are excluded from DJ-mode results)

## Artist Fatigue (`artist-fatigue.ts`)

Prevents over-playing a single artist by tracking recent plays and applying cooldowns.

| Constant | Value | Description |
|----------|------:|-------------|
| Fatigue threshold | 0.8 | 80% of artist's songs played/queued |
| Cooldown hours | 48 | Hours before artist re-enters rotation |
| Lookback hours | 72 | Hours of history to check |

## Artist Affinity (`artist-affinity.ts`)

Pre-computed affinity scores for personalization.

| Weight | Value | Description |
|--------|------:|-------------|
| Play count | 0.5 | Most important signal |
| Liked count | 0.35 | Explicit positive preference |
| Skip penalty | 0.15 | Negative signal |
| Lookback | 90 days | History window |

## Mood Translation (`mood-translator.ts`)

1. **Keyword check**: Scans for known mood keywords (e.g., "chill", "energetic", "sad") and maps to Navidrome smart playlist criteria directly
2. **AI translation**: If no keyword match, sends mood description to LLM (timeout: 5s, temperature: 0.3, max tokens: 256) to generate Navidrome-compatible filter criteria
3. **Fallback**: `mood-criteria-fallback.ts` provides hardcoded criteria for common mood presets

## Seasonal Patterns (`seasonal-patterns.ts` — 296 lines)

Detects seasonal listening preferences using temporal metadata on feedback records:

- Analyzes `month`, `season`, `dayOfWeek`, `hourOfDay` fields on feedback
- Boosts genres/artists that correlate with current time context
- Season detection: spring (Mar-May), summer (Jun-Aug), fall (Sep-Nov), winter (Dec-Feb)

## Time-Based Discovery (`time-based-discovery.ts` — 305 lines)

Personalized recommendations based on when the user listens:

- Time slots: morning (6-12), afternoon (12-17), evening (17-22), night (22-6)
- Tracks genre distribution per time slot per user
- Boosts songs matching the user's typical genre for the current time slot

## Background Discovery System

### Discovery Manager (`discovery-manager.ts` — 343 lines)

| Config | Default |
|--------|---------|
| Enabled | true |
| Frequency | 12 hours |
| Retry delay | 30 minutes |
| Max retries | 3 |
| Max suggestions per run | 15 |
| Seed count | 10 |

### Discovery Generator (`discovery-generator.ts` — 328 lines)

Seed selection strategy:
- 40% from top played artists
- 35% from recently played
- 25% from thumbs-up feedback

Ranking factors:
- Last.fm match score
- Seed recency bonus
- Seed liked bonus
- Genre alignment
- Popularity tiebreaker

## Explicit Content Filtering (`explicit-content.ts` — 201 lines)

- Uses Deezer API to look up whether songs contain explicit lyrics
- Results cached in `explicit_content_cache` DB table (global, not per-user)
- Batch lookup with concurrency limiting
- `filterExplicitSongs(songs)` convenience function removes explicit songs
- Triggered when user has `safeMode` enabled in playback settings

## Data Flow

```
Listening History (plays, skips)
  ├─ compound-scoring: builds compound scores from Last.fm similarities
  ├─ skip-scoring: calculates skip penalties per song/artist/genre
  ├─ artist-fatigue: tracks recent artist plays for cooldowns
  └─ artist-affinity: pre-computes per-artist affinity scores

Feedback (thumbs up/down)
  ├─ recommendations.schema: stored with temporal metadata
  ├─ seasonal-patterns: analyzes seasonal preferences
  ├─ Navidrome: syncs to star/unstar (per-user creds)
  └─ Liked Songs playlist: auto-synced after star change

blended-recommendation-scorer
  ├─ Reads: compound scores, skip scores, DJ metadata,
  │         feedback, temporal context, seasonal patterns
  ├─ Gathers candidates from Last.fm, Navidrome search, liked songs
  ├─ Scores each candidate across all 7 signals
  ├─ Applies diversity + fatigue filters
  └─ Returns ranked list → AI DJ queue or mood results
```
