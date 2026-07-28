# Radio & Recommendation Architecture

How songs get from "user presses play" to a fresh, personalized queue. Covers the full pipeline
from affinity computation through candidate sourcing, scoring, diversity enforcement, and the
new Expand Library discovery flow.

## System Overview

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   User Action    │     │   Artist         │     │   Onboarding     │
│  (play/like/skip)│     │   Affinity DB    │     │  (seed artists)  │
└────────┬─────────┘     └────────▲─────────┘     └────────┬─────────┘
         │                        │                        │
         ▼                        │                        ▼
┌──────────────────┐     ┌────────┴─────────┐     ┌──────────────────┐
│ Listening History│────▶│  calculateArtist │     │  Seed at 0.70    │
│    (DB table)    │     │  Affinities()    │     │  play_count=0    │
└──────────────────┘     └────────┬─────────┘     └──────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
             ┌───────────┐ ┌───────────┐ ┌───────────┐
             │  Radio    │ │  Seeded   │ │  AI DJ    │
             │  Shuffle  │ │  Radio    │ │  (auto)   │
             └─────┬─────┘ └─────┬─────┘ └───────────┘
                   │             │
                   ▼             ▼
              ┌─────────────────────┐
              │    Queue + Player   │
              │  (audio store)      │
              └─────────────────────┘
```

---

## 1. Artist Affinity

**File:** `src/lib/services/artist-affinity.ts`

Computes a 0–1 affinity score per artist based on 90-day listening history.

### Formula

```
base  = 0.50 × normalizedPlayCount + 0.35 × normalizedLikedCount
score = base × (1 − 0.15 × normalizedSkipCount)
```

Normalization is relative to the user's own max — so the most-played artist always approaches 1.0.

### Recompute trigger

Client-side counter fires every 10 radio plays with a 4h cooldown (`POST /api/listening-history/compound-scores`). The dashboard `radioPlayCount` effect in `src/routes/dashboard/index.tsx` drives this.

### Stale onboarding purge

Onboarding seeds artists at `affinityScore: 0.70` with `play_count: 0` (`src/routes/api/onboarding/artists/select.ts:89`). These never decay on their own. The affinity recompute now deletes any `play_count=0` entries whose artist isn't in the user's listening history — preventing ghost artists from dominating the radio pool.

---

## 2. Radio Shuffle

**File:** `src/routes/api/radio/shuffle.ts`  
**Endpoint:** `GET /api/radio/shuffle`

Used by the dashboard "Start Radio" button. Builds a queue from the user's affinity profile + random library discovery.

### Algorithm

1. Pull top **50** affinity artists (ordered by score descending)
2. **Guarantee top 2** artists (always present for identity signal)
3. **Randomly sample 12** from the remaining 48
4. Search Navidrome for songs by each selected artist
5. Randomly sample from each artist's catalog
6. Mix in **30% random library songs** (discovery/variety)
7. Deduplicate by song ID
8. Apply safe-mode filter (if enabled)
9. Final Fisher-Yates shuffle

### Why top 2, not top 5

Originally the top 5 artists were guaranteed every shuffle. With a sharp affinity dropoff (e.g. Fleetwood Mac at 0.72, then 2Pac at 0.21), this meant every shuffle started with the same 5 artists. Reducing to 2 keeps a minimal identity signal while letting the remaining 12 random picks create genuine variety.

---

## 3. Seeded Radio

**File:** `src/lib/services/seeded-radio.ts`  
**Endpoint:** `POST /api/radio/seeded`

Generates a radio queue from a specific seed (song, album, playlist, or artist). This is what fires when the user taps "Start Radio" from a song row, album, or liked songs.

### Entry points

| Seed kind | Handler | Strategy |
|-----------|---------|----------|
| `song` | `generateFromSong()` | Score from single seed, place seed at track 1 |
| `album` | `generateFromCollection()` | Pick 3–5 seed tracks, score each, interleave |
| `playlist` | `generateFromCollection()` | Same as album (handles liked-songs, DB playlists, Navidrome playlists) |
| `artist` | `generateFromArtist()` | Split catalog vs. adjacent by variety knob, co-occurrence + scorer |

### Liked Songs Radio flow

1. Detect `playlistId === 'liked-songs'` or DB playlist named "❤️ Liked Songs"
2. Fetch starred songs via Navidrome (per-user credentials)
3. `pickSeedTracks()` — select 3–5 diverse seed tracks using temporal + feedback signals
4. For each seed → `scoreFromSeed()` → `getBlendedRecommendations()`
5. Interleave results (round-robin across seeds to prevent single-seed domination)
6. Deduplicate → enforce artist diversity → apply recency cap
7. Return songs + `discoveryArtists` (artists not in library)

### Artist variety knob

The `variety` parameter (`low | medium | high`) controls how much of the queue comes from the seed artist's own catalog vs. adjacent artists:

| Variety | Catalog fraction | Adjacent fraction |
|---------|-----------------|-------------------|
| low | 60% | 40% |
| medium | 35% | 65% |
| high | 15% | 85% |

### Post-processing pipeline

Applied in order after scoring:

1. **`dedupe()`** — remove duplicate song IDs
2. **`enforceArtistDiversity()`** — max 1 song per artist (except seed artist)
3. **`applyRecencyCap()`** — max 40% of output can be from last 30 days' listening history
4. **`applyDurationTarget()`** — trim to target minutes if `targetMinutes` was set
5. **Genre coherence filter** — (artist radio only) drop candidates whose genre tokens don't overlap with seed catalog

---

## 4. Blended Recommendation Scorer

**File:** `src/lib/services/blended-recommendation-scorer.ts`

The core scoring engine. Gathers candidates from multiple sources, scores each against multiple signals, and returns ranked results.

### Candidate Sources

Sources are queried **sequentially** (not parallel) to avoid Navidrome rate limiting. Each source searches Navidrome to find library matches.

| Source | Max candidates | Search strategy |
|--------|---------------|-----------------|
| Last.fm similar tracks | 20 | `getSimilarTracksRaw()` → search top 12 in library |
| Same artist | 2 | Search seed artist name, limit to avoid domination |
| Last.fm similar artists | 10 | `getSimilarArtistsRaw()` → search top 5 in library |
| Aurral similar artists | 8 | MusicBrainz cache-only (no API calls), top 6 |
| Genre-based | 10 | `getRandomSongs()` pool, filter by genre similarity ≥ 0.3 |

**Throttling:** 100ms delay between each Navidrome search call.

### Scoring Signals

Every candidate is scored against **all** signals regardless of source:

| Signal | Weight | Source |
|--------|--------|--------|
| Last.fm similarity | 0.25 | Match score from Last.fm API |
| Compound score | 0.20 | Pre-computed listening history correlation |
| DJ matching | 0.20 | BPM/Energy/Key compatibility for smooth transitions |
| Feedback | 0.15 | Explicit thumbs up/down from user |
| Skip penalty | 0.10 | Frequency of skipping this song |
| Temporal | 0.05 | Time-of-day preference match |
| Diversity | 0.05 | Bonus for artists not already in queue |

### Final score

```
finalScore = Σ(signal × weight)  // weighted sum across all signals
```

Results are sorted by `finalScore` descending, then diversity rules applied (max 1 song per artist, minimum 2 unique artists).

---

## 5. Discovery Artists (Expand Library)

When the scorer searches for Last.fm or Aurral recommended artists/tracks in the Navidrome library and finds **no match**, those artists are collected as `discoveryArtists` instead of being silently dropped.

### Data flow

```
gatherLastFmSimilarTracks()     ─┐
gatherSimilarArtistsSongs()      ├─▶ unmatchedArtists Map
gatherAurralSimilarArtistsSongs()─┘         │
                                            ▼
                                   gatherCandidates()
                                     return { candidates, discoveryArtists }
                                            │
                                            ▼
                                   getBlendedRecommendations()
                                     metadata.discoveryArtists
                                            │
                                            ▼
                                   scoreFromSeed() / generateFrom*()
                                     SeededRadioResult.discoveryArtists
                                            │
                                            ▼
                                   POST /api/radio/seeded
                                     response.data.discoveryArtists
                                            │
                                            ▼
                                   audio store
                                     radioDiscoveryArtists[]
                                            │
                                            ▼
                                   queue-panel.tsx (desktop only)
                                     "Expand your library" artist bubbles
```

### Artist bubble behavior

- Shown only during radio sessions, desktop only (`hidden md:block`)
- Each bubble shows artist name + source badge (lastfm/aurral)
- **Tap flow:** Search Lidarr → if found and not in library, add & monitor → SLSK downloads it. If not found, navigate to `/downloads?search=<artist>` for manual search
- Max 8 discovery artists per radio session, sorted by match score descending
- Artists that matched in one source but not another are filtered out (only truly missing artists appear)

### Deduplication across seeds

When `generateFromCollection()` runs multiple seeds (e.g. liked songs radio picks 5 seed tracks), each seed may produce its own discovery artists. These are merged into a single map keyed by lowercase artist name, keeping the highest match score. Final list is capped at 8.

---

## 6. Key Files

| File | Role |
|------|------|
| `src/lib/services/artist-affinity.ts` | Affinity computation + stale purge |
| `src/lib/services/blended-recommendation-scorer.ts` | Multi-signal candidate scoring engine |
| `src/lib/services/seeded-radio.ts` | Seeded radio generation (song/album/playlist/artist) |
| `src/routes/api/radio/shuffle.ts` | Affinity-based radio shuffle endpoint |
| `src/routes/api/radio/seeded.ts` | Seeded radio API endpoint |
| `src/routes/api/onboarding/artists/select.ts` | Onboarding artist seed (affinity 0.70) |
| `src/lib/stores/audio.ts` | Client state (radioDiscoveryArtists, radioSeed, etc.) |
| `src/components/ui/queue-panel.tsx` | Queue panel UI + discovery artist bubbles |
| `src/routes/dashboard/index.tsx` | Recompute trigger (every 10 plays) |

---

## 7. Known Tradeoffs & Future Work

**Recency cap is approximate.** The 40% / 30-day cap runs after interleaving and diversity, so the actual ratio may drift slightly from target. Acceptable — the knob is intentionally loose.

**Genre coherence filter can be aggressive.** If the seed catalog has sparse genre tags, the filter may drop too many candidates. Fallback: if <30% survive filtering, the filter is bypassed entirely.

**Last.fm is the primary discovery signal.** Without a Last.fm API key, the scorer falls back to same-artist + genre-based + Aurral cache-only. Quality drops significantly.

**Discovery artists require Lidarr.** The Expand Library flow assumes Lidarr + SLSK are configured. If Lidarr is down or unreachable, the bubble tap falls back to the downloads page for manual search.

**Compound scores are eventually consistent.** They're recomputed via `POST /api/listening-history/compound-scores` every 10 plays with a 4h cooldown. Short-term preference shifts won't be reflected until the next recompute cycle.
