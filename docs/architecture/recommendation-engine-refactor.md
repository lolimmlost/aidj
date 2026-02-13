# Recommendation Engine Refactor: Consolidating to Last.fm + Mood Translation

## Change of Direction Notice

**Date:** 2024-12-03
**Status:** Approved for Implementation
**Priority:** High - Core Architecture Change

### Summary

We are **consolidating all 3 AI recommendation systems** into a single, unified approach:

| System Being Consolidated | Current Location | What Happens |
|--------------------------|------------------|--------------|
| **Auto Recommendations** | `src/lib/services/ollama.ts` | **REMOVE** - Replace with Last.fm |
| **Playlist Recommendations** | `src/lib/services/ollama/playlist-generator.ts` | **REMOVE** - Replace with Last.fm |
| **In-Player AI DJ** | `src/lib/services/ai-dj/core.ts` | **REMOVE** - Replace with Last.fm |

**The New Approach:**
- **Last.fm `getSimilarTracks`** → All song-to-song recommendations (library & discovery)
- **AI (LLM)** → ONLY for mood/style translation to smart playlist queries

This is inspired by the **Platypush** open-source music automation system, which demonstrates that crowdsourced similarity data (Last.fm) is far superior to LLM guessing for music recommendations.

### Why This Change?

| Current Approach (3 Separate AI Systems) | New Approach (Last.fm + Mood Translation) |
|------------------------------------------|-------------------------------------------|
| LLM guesses similar songs from 60-100 song context | Last.fm's `getSimilarTracks` uses **billions of scrobbles** |
| 10-45 second Ollama calls per recommendation | Sub-second API calls |
| AI halluccinates non-existent songs | Deterministic, real songs that exist |
| 3 different prompt engineering approaches | One simple API: `getSimilarTracks(artist, track)` |
| No persistent listening history | Can build compound scoring like Platypush |
| Repetitive suggestions from same training data | Crowdsourced data ensures variety |
| AI picks songs (bad at this) | AI only translates moods (good at this) |

### The Platypush Insight

From the Platypush article that inspired this change:

> "I asked myself why on earth my music discovery experience should be so tightly coupled to one single cloud service. And I decided that the time had come for me to automatically generate my service-agnostic music suggestions: it's not rocket science anymore, there are plenty of services that you can piggyback on to get artists or tracks similar to some music given as input."

**Key Platypush Concepts We're Adopting:**
1. Use Last.fm API for `getSimilarTracks` - crowdsourced from billions of listens
2. Cross-reference with local library (Navidrome) to filter to owned songs
3. Build compound scores over time (songs suggested by multiple sources rank higher)
4. Keep listening history locally for better personalization

### What AI Is Still Used For

AI/LLM is **ONLY** used for one thing: **mood/style → smart playlist query translation**

```
User Input: "chill evening vibes for reading"
     ↓
AI Translates to Smart Playlist Query:
{
  "all": [
    {"contains": {"genre": "ambient"}},
    {"lt": {"bpm": 100}},
    {"gt": {"rating": 3}}
  ],
  "limit": 25,
  "sort": "random"
}
     ↓
Navidrome executes query → returns actual songs
```

AI does NOT:
- Pick which songs to recommend
- Guess song names or artists
- Generate song-to-song similarity scores

---

## Current Architecture (3 Separate AI Systems - Being Removed)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CURRENT: 3 SEPARATE AI SYSTEMS                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │  AUTO RECOMMENDATIONS│  │ PLAYLIST GENERATOR │  │    IN-PLAYER AI DJ  │  │
│  │  ollama.ts          │  │ playlist-generator │  │    ai-dj/core.ts    │  │
│  ├─────────────────────┤  ├─────────────────────┤  ├─────────────────────┤  │
│  │ • 100-song context  │  │ • 60-song context   │  │ • 60-song context   │  │
│  │ • LLM picks songs   │  │ • LLM picks songs   │  │ • LLM picks songs   │  │
│  │ • 10-45s response   │  │ • 20s response      │  │ • 10s timeout       │  │
│  │ • Fuzzy match lib   │  │ • Fuzzy match lib   │  │ • Fuzzy match lib   │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  │
│            │                        │                        │              │
│            ▼                        ▼                        ▼              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    FUZZY STRING MATCHING                              │   │
│  │  - Tries to match LLM output to library                              │   │
│  │  - Often fails → falls back to random songs                          │   │
│  │  - Source of "stale" and repetitive recommendations                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│                       Results: Often repetitive/irrelevant                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Problems with Each System

| System | File | Problem |
|--------|------|---------|
| **Auto Recommendations** | `ollama.ts` | Sends 100 songs to LLM, asks it to guess similar songs. LLM has no actual music similarity data - just guessing from names. |
| **Playlist Generator** | `ollama/playlist-generator.ts` | Sends 60 songs + style to LLM. Library mode fails because AI suggests songs that don't exist in library. |
| **In-Player AI DJ** | `ai-dj/core.ts` | Same 60-song approach with 10s timeout. Fuzzy matching to library often fails, falls back to random. |

**Common Problems Across All 3:**
- LLM doesn't have music similarity data - it's just pattern matching on names
- Fuzzy string matching after LLM response is unreliable
- Each system has its own prompt engineering, caching, and fallback logic
- 3 different codepaths to maintain with similar bugs

---

## New Architecture: Unified Last.fm + Mood Translation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NEW: UNIFIED RECOMMENDATION ENGINE                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                              USER REQUEST                                    │
│    "Play similar" / "Generate playlist" / "Auto DJ" / "Chill vibes"         │
│                                    │                                         │
│                                    ▼                                         │
│                        ┌─────────────────────┐                              │
│                        │   REQUEST ROUTER    │                              │
│                        │ (Simple type check) │                              │
│                        └──────────┬──────────┘                              │
│                                   │                                          │
│              ┌────────────────────┼────────────────────┐                    │
│              │                    │                    │                    │
│              ▼                    ▼                    ▼                    │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐        │
│   │  SONG-TO-SONG   │  │  SONG-TO-SONG   │  │  MOOD/STYLE INPUT   │        │
│   │  (Library Mode) │  │ (Discovery Mode)│  │  (Natural Language) │        │
│   └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘        │
│            │                    │                      │                    │
│            ▼                    ▼                      ▼                    │
│   ┌─────────────────────────────────────┐   ┌─────────────────────┐        │
│   │         LAST.FM API                 │   │     AI/LLM          │        │
│   │    getSimilarTracks(artist, track)  │   │ Mood → Query JSON   │        │
│   │                                     │   │                     │        │
│   │  • Crowdsourced from billions of    │   │ "chill vibes" →     │        │
│   │    scrobbles                        │   │ {genre: "ambient",  │        │
│   │  • Sub-second response              │   │  bpm: "<100"}       │        │
│   │  • Already enriched with library    │   │                     │        │
│   │    status (inLibrary: true/false)   │   │ (Only translation,  │        │
│   │                                     │   │  no song picking)   │        │
│   └────────────────┬────────────────────┘   └──────────┬──────────┘        │
│                    │                                   │                    │
│          ┌─────────┴─────────┐                        │                    │
│          │                   │                        │                    │
│          ▼                   ▼                        ▼                    │
│   ┌─────────────┐    ┌─────────────┐         ┌─────────────────┐          │
│   │ inLibrary:  │    │ inLibrary:  │         │ NAVIDROME       │          │
│   │   true      │    │   false     │         │ SMART PLAYLIST  │          │
│   │   ↓         │    │   ↓         │         │ QUERY           │          │
│   │ Play now    │    │ → Lidarr    │         │                 │          │
│   │             │    │   download  │         │                 │          │
│   └─────────────┘    └─────────────┘         └─────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Role of Each Component

| Request Type | Data Source | AI Role | Output |
|--------------|-------------|---------|--------|
| **"Play similar songs"** | Last.fm `getSimilarTracks` | **None** | Filter to `inLibrary: true` → Navidrome IDs |
| **"Discover new music"** | Last.fm `getSimilarTracks` | **None** | Filter to `inLibrary: false` → Lidarr candidates |
| **"Chill evening vibes"** | Navidrome Smart Playlist | **Translate mood → query** | Execute query → Navidrome IDs |
| **AI DJ auto-queue** | Last.fm `getSimilarTracks` | **None** | Filter to `inLibrary: true` → Navidrome IDs |

### Key Simplifications

1. **One API for similarity**: `lastFm.getSimilarTracks(artist, track)` replaces all 3 LLM-based systems
2. **Library enrichment already done**: Our Last.fm client already cross-references with Navidrome
3. **AI only translates**: "chill vibes" → `{genre: "ambient"}`, not "chill vibes" → list of song names
4. **No fuzzy matching needed**: Last.fm returns real song metadata, we just filter by `inLibrary`

---

## Implementation Phases

### Phase 1: Create Unified Recommendation Service

**Goal:** Create a single `src/lib/services/recommendations.ts` that replaces all 3 systems

**New File: `src/lib/services/recommendations.ts`**

```typescript
/**
 * Unified Recommendation Service
 * Replaces: ollama.ts, playlist-generator.ts, ai-dj/core.ts
 */
import { getLastFmClient } from './lastfm';
import { translateMoodToQuery } from './mood-translator'; // Small AI service
import { evaluateSmartPlaylist } from './smart-playlist-evaluator';
import type { Song } from '@/components/ui/audio-player';

export type RecommendationMode = 'similar' | 'discovery' | 'mood';

export interface RecommendationRequest {
  mode: RecommendationMode;
  // For 'similar' and 'discovery' modes:
  currentSong?: { artist: string; title: string };
  // For 'mood' mode:
  moodDescription?: string;
  // Common options:
  limit?: number;
  excludeSongIds?: string[];
  excludeArtists?: string[];
}

export interface RecommendationResult {
  songs: Song[];
  source: 'lastfm' | 'smart-playlist' | 'fallback';
  mode: RecommendationMode;
}

/**
 * Single entry point for ALL recommendations
 */
export async function getRecommendations(
  request: RecommendationRequest
): Promise<RecommendationResult> {
  const { mode, limit = 10 } = request;

  switch (mode) {
    case 'similar':
      return getSimilarSongs(request);
    case 'discovery':
      return getDiscoverySongs(request);
    case 'mood':
      return getMoodBasedSongs(request);
    default:
      throw new Error(`Unknown recommendation mode: ${mode}`);
  }
}

/**
 * Get similar songs from library (replaces AI DJ + auto recommendations)
 */
async function getSimilarSongs(request: RecommendationRequest): Promise<RecommendationResult> {
  const { currentSong, limit = 10, excludeSongIds = [], excludeArtists = [] } = request;

  if (!currentSong) {
    throw new Error('currentSong required for similar mode');
  }

  const lastFm = getLastFmClient();

  if (!lastFm) {
    // Fallback to genre-based random from library
    return fallbackToGenreRandom(currentSong, limit);
  }

  // Last.fm already enriches with library status!
  const similar = await lastFm.getSimilarTracks(currentSong.artist, currentSong.title, limit * 3);

  // Filter to library songs only
  const inLibrary = similar
    .filter(t => t.inLibrary && t.navidromeId)
    .filter(t => !excludeSongIds.includes(t.navidromeId!))
    .filter(t => !excludeArtists.some(ea =>
      t.artist.toLowerCase().includes(ea.toLowerCase())
    ));

  // Apply diversity (no repeat artists)
  const diverse = applyDiversity(inLibrary);

  return {
    songs: diverse.slice(0, limit).map(toSong),
    source: 'lastfm',
    mode: 'similar',
  };
}

/**
 * Get discovery songs NOT in library (replaces discovery mode)
 */
async function getDiscoverySongs(request: RecommendationRequest): Promise<RecommendationResult> {
  const { currentSong, limit = 10 } = request;

  if (!currentSong) {
    throw new Error('currentSong required for discovery mode');
  }

  const lastFm = getLastFmClient();

  if (!lastFm) {
    throw new Error('Last.fm required for discovery mode');
  }

  const similar = await lastFm.getSimilarTracks(currentSong.artist, currentSong.title, limit * 3);

  // Filter to songs NOT in library
  const notInLibrary = similar
    .filter(t => !t.inLibrary)
    .sort((a, b) => (b.match || 0) - (a.match || 0));

  return {
    songs: notInLibrary.slice(0, limit).map(toDiscoverySong),
    source: 'lastfm',
    mode: 'discovery',
  };
}

/**
 * Get mood-based songs using AI translation + smart playlist
 * (This is the ONLY place AI is used)
 */
async function getMoodBasedSongs(request: RecommendationRequest): Promise<RecommendationResult> {
  const { moodDescription, limit = 20 } = request;

  if (!moodDescription) {
    throw new Error('moodDescription required for mood mode');
  }

  // AI translates mood → smart playlist query
  // e.g., "chill evening vibes" → {genre: "ambient", bpm: "<100", rating: ">3"}
  const query = await translateMoodToQuery(moodDescription);

  // Navidrome smart playlist executes the query
  const songs = await evaluateSmartPlaylist(query, limit);

  return {
    songs,
    source: 'smart-playlist',
    mode: 'mood',
  };
}
```

**Expected Outcome:**
- Single service for all recommendations
- Sub-second responses (vs 10-45 seconds)
- Clear separation: Last.fm for similarity, AI only for mood translation

---

### Phase 2: Create Mood Translator Service (AI's Only Role)

**Goal:** Create a small, focused AI service that ONLY translates natural language to smart playlist queries

**New File: `src/lib/services/mood-translator.ts`**

```typescript
/**
 * Mood Translator Service
 * The ONLY place AI/LLM is used in the recommendation system
 *
 * Purpose: Translate natural language moods to Navidrome smart playlist queries
 * NOT used for: Picking songs, generating song lists, similarity scoring
 */
import { getLLMProvider } from './llm/factory';

export interface SmartPlaylistQuery {
  all?: QueryCondition[];
  any?: QueryCondition[];
  limit?: number;
  sort?: 'random' | 'rating' | 'playCount' | 'recent';
}

interface QueryCondition {
  field: 'genre' | 'year' | 'rating' | 'bpm' | 'artist' | 'album';
  operator: 'contains' | 'is' | 'gt' | 'lt' | 'between';
  value: string | number | [number, number];
}

/**
 * Translate a mood description to a smart playlist query
 *
 * @example
 * translateMoodToQuery("chill evening vibes for reading")
 * // Returns: { all: [{field: "genre", operator: "contains", value: "ambient"}], limit: 25 }
 *
 * @example
 * translateMoodToQuery("high energy workout music")
 * // Returns: { any: [{field: "genre", operator: "contains", value: "electronic"}, ...], limit: 30 }
 */
export async function translateMoodToQuery(moodDescription: string): Promise<SmartPlaylistQuery> {
  const provider = getLLMProvider();

  const prompt = `You are a music query translator. Convert the mood description to a Navidrome smart playlist JSON query.

MOOD: "${moodDescription}"

Available fields: genre, year, rating (1-5), bpm (60-200), artist, album
Available operators: contains, is, gt (greater than), lt (less than), between
Use "all" for AND conditions, "any" for OR conditions.

Return ONLY valid JSON. Examples:
- "chill vibes" → {"all": [{"field": "genre", "operator": "contains", "value": "ambient"}], "limit": 25, "sort": "random"}
- "90s rock" → {"all": [{"field": "genre", "operator": "contains", "value": "rock"}, {"field": "year", "operator": "between", "value": [1990, 1999]}], "limit": 20}
- "party music" → {"any": [{"field": "genre", "operator": "contains", "value": "dance"}, {"field": "genre", "operator": "contains", "value": "pop"}], "all": [{"field": "bpm", "operator": "gt", "value": 120}], "limit": 30}

JSON query:`;

  const response = await provider.generate({
    model: provider.getDefaultModel(),
    prompt,
    stream: false,
    temperature: 0.3, // Low temperature for consistent structured output
    maxTokens: 256,   // Small response needed
  }, 5000); // 5s timeout - this should be fast

  try {
    // Extract JSON from response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    // Fallback to a sensible default
    console.warn('Failed to parse mood translation, using fallback:', error);
    return {
      all: [{ field: 'rating', operator: 'gt', value: 3 }],
      limit: 20,
      sort: 'random',
    };
  }
}
```

**Key Design Decisions:**
1. **Low temperature (0.3)**: We want consistent, predictable JSON output
2. **Short timeout (5s)**: Translation is simple, shouldn't take long
3. **Small token limit (256)**: Just need a JSON object, not a novel
4. **Graceful fallback**: If AI fails, return a sensible default query

---

### Phase 3: Update Consumers to Use New Service

**Goal:** Update all places that call the old recommendation services to use the new unified service

**Files to Update:**

| File | Change |
|------|--------|
| `src/routes/api/recommendations.ts` | Use `getRecommendations({ mode: 'similar', ... })` |
| `src/routes/api/playlist.ts` | Use `getRecommendations({ mode: 'mood', ... })` |
| `src/components/audio-player.tsx` | Use `getRecommendations({ mode: 'similar', ... })` for AI DJ |
| `src/routes/dashboard.tsx` | Update recommendation fetching |

**Example Migration:**

```typescript
// BEFORE (ai-dj/core.ts)
const recommendations = await generateContextualRecommendations(
  context,
  batchSize,
  userId,
  useFeedback,
  excludeIds,
  excludeArtists
);

// AFTER (unified service)
const result = await getRecommendations({
  mode: 'similar',
  currentSong: { artist: context.currentSong.artist, title: context.currentSong.title },
  limit: batchSize,
  excludeSongIds: excludeIds,
  excludeArtists,
});
const recommendations = result.songs;
```

```typescript
// BEFORE (playlist-generator.ts)
const playlist = await generatePlaylist({
  style: 'chill evening vibes',
  userId,
  sourceMode: 'library',
});

// AFTER (unified service)
const result = await getRecommendations({
  mode: 'mood',
  moodDescription: 'chill evening vibes',
  limit: 20,
});
const playlist = result.songs;
```

---

### Phase 4: Persistent Listening History (Future Enhancement)

**Goal:** Like Platypush, build a local database of listening history for compound scoring

**Inspired by Platypush's approach:**
```sql
-- Track similarity scores compound over time
-- If 5 different songs you played all suggest "Song X", it gets higher score
SELECT
  t.artist, t.title,
  SUM(ts.match_score) as compound_score
FROM music_track t
JOIN music_similar ts ON t.id = ts.target_track_id
JOIN music_activity a ON ts.source_track_id = a.track_id
WHERE a.created_at >= NOW() - INTERVAL '7 days'
GROUP BY t.id
ORDER BY compound_score DESC
```

**This would require:**
- New DB tables: `listening_history`, `track_similarities`
- Background job to fetch Last.fm similar tracks for played songs
- Scoring algorithm that weighs repeated suggestions higher

**Note:** This is a future enhancement. Phases 1-3 provide immediate improvement without this complexity.

---

## Files Reference

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/lib/services/recommendations.ts` | **NEW** - Unified recommendation service (Phase 1) |
| `src/lib/services/mood-translator.ts` | **NEW** - AI mood → query translation (Phase 2) |

### Files to KEEP (no changes)

| File | Reason |
|------|--------|
| `src/lib/services/lastfm/client.ts` | Already has `getSimilarTracks` with library enrichment |
| `src/lib/services/lastfm/types.ts` | Types are correct |
| `src/lib/services/smart-playlist-evaluator.ts` | Used for mood-based queries |
| `src/lib/services/llm/factory.ts` | Used by mood translator |
| `src/lib/services/llm/providers/*` | LLM providers still needed for mood translation |

### Files to DELETE (after migration)

| File | Reason for Deletion |
|------|---------------------|
| `src/lib/services/ollama.ts` | Replaced by unified `recommendations.ts` |
| `src/lib/services/ollama/playlist-generator.ts` | Replaced by unified `recommendations.ts` |
| `src/lib/services/ollama/prompt-builder.ts` | Replaced by simpler `mood-translator.ts` |
| `src/lib/services/ollama/response-parser.ts` | No longer needed (Last.fm returns structured data) |
| `src/lib/services/ai-dj/core.ts` | Replaced by unified `recommendations.ts` |
| `src/lib/services/ai-dj/context-builder.ts` | No longer needed (Last.fm doesn't need song context) |
| `src/lib/services/ai-dj/recommendation-matcher.ts` | No longer needed (Last.fm already enriches with library) |
| `src/lib/services/ai-dj/artist-tracker.ts` | Replaced by simple `excludeArtists` parameter |
| `src/lib/services/ai-dj/index.ts` | Entry point no longer needed |
| `src/lib/services/ai-dj.ts` | Wrapper no longer needed |
| `src/lib/services/genre-matcher.ts` | No longer needed (Last.fm handles similarity) |
| `src/lib/services/library-profile.ts` | No longer needed for recommendations |
| `src/lib/services/recommendation-analytics.ts` | Review - may simplify or remove |

### Files to UPDATE (migration)

| File | Change |
|------|--------|
| `src/routes/api/recommendations.ts` | Import from new `recommendations.ts` |
| `src/routes/api/playlist.ts` | Import from new `recommendations.ts` |
| `src/stores/audio-store.ts` | Update AI DJ to use new service |
| `src/routes/dashboard.tsx` | Update recommendation fetching |

---

## Migration Strategy

### Backward Compatibility

During transition, support both approaches:

```typescript
// Feature flag approach
const USE_LASTFM_RECOMMENDATIONS = true; // Toggle for rollback

if (USE_LASTFM_RECOMMENDATIONS && lastFmClient) {
  return generateLastFmRecommendations(context);
} else {
  return generateOllamaRecommendations(context); // Old path
}
```

### Fallback Chain

If Last.fm fails or isn't configured:
1. **AI DJ**: Fall back to smart playlist with genre filter from current song
2. **Playlist Gen**: Fall back to current Ollama approach
3. **Discovery**: Require Last.fm (no fallback - it's the whole point)

---

## Success Metrics

### Before vs After Comparison

| Metric | Before (AI-Heavy) | After (Last.fm + Mood) |
|--------|-------------------|------------------------|
| **Response Time** | 10-45 seconds | <1 second |
| **Library Match Rate** | ~40% (fuzzy matching fails) | 100% (Last.fm enriches with library status) |
| **Code Complexity** | 3 separate systems, ~15 files | 2 files (recommendations.ts + mood-translator.ts) |
| **AI API Calls** | Every recommendation request | Only mood/style requests |
| **Recommendation Quality** | Based on LLM training data | Based on billions of real user scrobbles |

### Key Metrics to Track

1. **Response Time**: Should be <1s for similar/discovery, <5s for mood
2. **Library Match Rate**: Should be 100% for library mode (no fuzzy matching)
3. **Skip Rate**: Lower skip rate indicates better recommendations
4. **Code Lines Deleted**: Target ~2000 lines removed

---

## Summary: What Changes

### AI Does LESS

```
BEFORE: AI picks songs from your library
        AI matches song names to library
        AI generates similarity scores
        AI handles all recommendation types

AFTER:  AI ONLY translates "chill vibes" → {genre: "ambient"}
        That's it. Nothing else.
```

### Last.fm Does MORE

```
BEFORE: Last.fm only used for Story 7.2 discovery UI

AFTER:  Last.fm handles ALL song-to-song similarity
        - "Play similar songs" → Last.fm
        - "AI DJ auto-queue" → Last.fm
        - "Discovery mode" → Last.fm
        - Library enrichment already built into client
```

### Code Gets SIMPLER

```
BEFORE: 15+ files across 3 systems
        - ollama.ts
        - ollama/playlist-generator.ts
        - ollama/prompt-builder.ts
        - ollama/response-parser.ts
        - ai-dj/core.ts
        - ai-dj/context-builder.ts
        - ai-dj/recommendation-matcher.ts
        - ai-dj/artist-tracker.ts
        - ai-dj/index.ts
        - ai-dj.ts
        - genre-matcher.ts
        - library-profile.ts
        ... and more

AFTER:  2 new files
        - recommendations.ts (unified entry point)
        - mood-translator.ts (AI's only job)
```

---

## References

- [Platypush Music Automation Article](https://blog.platypush.tech/) - Inspiration for this approach
- [Last.fm API Documentation](https://www.last.fm/api)
- [Story 7.2: Last.fm Integration](../stories/epic-7.story-7.2.lastfm-integration.md)
- [Story 7.3: Discovery Pipeline](../stories/epic-7.story-7.3.discovery-pipeline.md)

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2024-12-03 | 1.0 | Initial architecture refactor document | Claude |
| 2024-12-03 | 2.0 | Major revision: Consolidated approach, clearer file changes, Platypush inspiration | Claude |
