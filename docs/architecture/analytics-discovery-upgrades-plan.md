# Analytics & Discovery Upgrades Plan

> **Branch:** `feat/analytics-discovery-upgrades`
> **Base:** `feat/crossfade-v2` (PR #5)
> **Created:** 2026-02-01
> **Sources:** Competitive analysis of Koito, Your Spotify, your_lastfm, Lidify

---

## Overview

10 upgrades organized into 4 epics, ordered by dependency and impact. Each upgrade is
designed to be independently shippable — merge after each one, not at the end.

**Existing infrastructure we build on:**
- Drizzle ORM + PostgreSQL (listeningHistory, compoundScores, recommendationFeedback, musicIdentitySummaries, artistAffinities, temporalPreferences)
- Recharts 3 for charts
- BlendedRecommendationScorer with 7 weighted signals
- Music Identity system with AI-powered summaries, mood profiles, trend analysis
- Last.fm client with token-bucket rate limiter
- Lidarr client with artist search + add
- Cache service with TTL support

---

## Epic 1: Dashboard Analytics Enhancements

Low-effort, high-impact visual improvements to the existing dashboard and Music Identity pages.

### 1.1 Period-Over-Period Comparison Cards
**Priority:** HIGH | **Effort:** Low | **Source:** Your Spotify

Add percentage-change indicators to dashboard summary cards (total listens, minutes listened, unique artists, etc).

**How it works:**
- Given a date range `[start, end]`, calculate `lastPeriod` as the equivalent previous window
- Query `listeningHistory` for both periods, compute delta percentage
- Display as `+23%` (green) or `-12%` (red) badge on existing stat cards

**Files to create:**
| File | Purpose |
|------|---------|
| `src/lib/utils/period-comparison.ts` | `getLastPeriod(start, end)` and `getPercentChange(current, previous)` helpers |

**Files to modify:**
| File | Changes |
|------|---------|
| `src/lib/services/listening-history.ts` | Add `getListeningStatsByPeriod(userId, start, end)` query |
| `src/components/dashboard/DashboardHero.tsx` | Add delta badges to existing stat display |
| `src/routes/api/listening-history/stats.ts` | New endpoint returning current + previous period stats |

**Schema:** No new tables — queries existing `listeningHistory` table.

**Query pattern:**
```sql
-- Current period
SELECT COUNT(*) as total_plays, COUNT(DISTINCT artist) as unique_artists,
       SUM(play_duration) as total_seconds
FROM listening_history
WHERE user_id = ? AND played_at BETWEEN ? AND ?

-- Previous period (same duration, shifted back)
SELECT COUNT(*) as total_plays, COUNT(DISTINCT artist) as unique_artists,
       SUM(play_duration) as total_seconds
FROM listening_history
WHERE user_id = ? AND played_at BETWEEN ? AND ?
```

---

### 1.2 Listening Hour Distribution Chart
**Priority:** HIGH | **Effort:** Low | **Source:** Your Spotify

24-hour bar chart showing when the user listens most. Feeds into temporal recommendations and Music Identity.

**Files to create:**
| File | Purpose |
|------|---------|
| `src/components/music-identity/ListeningHourChart.tsx` | Recharts `BarChart` with 24 bars (0-23h) |

**Files to modify:**
| File | Changes |
|------|---------|
| `src/lib/services/listening-history.ts` | Add `getListeningByHour(userId, start?, end?)` query |
| `src/routes/api/listening-history/by-hour.ts` | New endpoint |
| `src/components/music-identity/MusicIdentityDashboard.tsx` | Add chart to dashboard |

**Query:**
```sql
SELECT EXTRACT(HOUR FROM played_at) as hour, COUNT(*) as plays
FROM listening_history
WHERE user_id = ?
GROUP BY hour ORDER BY hour
```

---

### 1.3 Artist Diversity Metric
**Priority:** MEDIUM | **Effort:** Low | **Source:** Your Spotify

Track unique artists per period. Display as "47 unique artists this week (up from 32)".

**Files to modify:**
| File | Changes |
|------|---------|
| `src/lib/services/listening-history.ts` | Add `getArtistDiversity(userId, start, end)` |
| `src/components/music-identity/MusicIdentityDashboard.tsx` | Add diversity stat card |

Uses the same period-comparison utility from 1.1.

---

### 1.4 Album Age Trending
**Priority:** MEDIUM | **Effort:** Low-Medium | **Source:** Your Spotify

Track average release year of listened music over time. "Your taste is trending toward older music this month."

**Challenge:** `listeningHistory` does not store `album_year`. We need to either:
- (a) Denormalize: Add `albumYear` column to `listeningHistory` and populate on insert
- (b) Join: Look up from Navidrome at query time (slow)

**Recommended:** Option (a) — add column, populate from Navidrome metadata on insert.

**Files to modify:**
| File | Changes |
|------|---------|
| `src/lib/db/schema/listening-history.schema.ts` | Add `albumYear integer` column |
| `src/lib/services/listening-history.ts` | Populate `albumYear` on insert from Navidrome song metadata |
| `src/routes/api/listening-history/album-age.ts` | New endpoint: avg release year per month |
| `src/components/music-identity/MusicIdentityDashboard.tsx` | Add trend line chart |

**Migration:** Add column with `ALTER TABLE listening_history ADD COLUMN album_year INTEGER`.
Backfill script to populate existing rows from Navidrome.

---

### 1.5 Longest Listening Sessions Detection
**Priority:** LOW | **Effort:** Low | **Source:** Your Spotify

Detect continuous listening sessions (gap < 10 minutes between songs) and surface the longest ones.

**Files to create:**
| File | Purpose |
|------|---------|
| `src/lib/services/session-detector.ts` | `detectSessions(plays[])` — groups plays into sessions with gap threshold |

**Files to modify:**
| File | Changes |
|------|---------|
| `src/routes/api/listening-history/sessions.ts` | New endpoint returning top 5 longest sessions |
| `src/components/music-identity/MusicIdentityDashboard.tsx` | "Your longest session" stat |

**Algorithm:**
```typescript
function detectSessions(plays: { playedAt: Date; songDuration: number }[], gapThresholdMs = 600000) {
  const sessions: { start: Date; end: Date; plays: number; durationMs: number }[] = [];
  let currentSession = { start: plays[0].playedAt, plays: 1, lastEnd: plays[0].playedAt };

  for (let i = 1; i < plays.length; i++) {
    const gap = plays[i].playedAt.getTime() - currentSession.lastEnd.getTime();
    if (gap <= gapThresholdMs) {
      currentSession.plays++;
      currentSession.lastEnd = new Date(plays[i].playedAt.getTime() + (plays[i].songDuration || 180) * 1000);
    } else {
      sessions.push({ start: currentSession.start, end: currentSession.lastEnd, plays: currentSession.plays, durationMs: currentSession.lastEnd.getTime() - currentSession.start.getTime() });
      currentSession = { start: plays[i].playedAt, plays: 1, lastEnd: plays[i].playedAt };
    }
  }
  return sessions.sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
}
```

---

## Epic 2: Image & Visual Improvements

### 2.1 Deezer Image Fallback
**Priority:** HIGH | **Effort:** Low | **Source:** your_lastfm, Lidify, Koito

Add Deezer's free, no-auth API as a fallback image source when Navidrome/Last.fm images are missing.

**Deezer API (no key required):**
- Artist: `GET https://api.deezer.com/search/artist?q={name}` → `data[0].picture_xl`
- Album: `GET https://api.deezer.com/search/album?q={artist} {album}` → `data[0].cover_xl`

**Files to create:**
| File | Purpose |
|------|---------|
| `src/lib/services/deezer.ts` | `getDeezerArtistImage(name)` and `getDeezerAlbumImage(artist, album)` |

**Files to modify:**
| File | Changes |
|------|---------|
| `src/lib/services/navidrome.ts` | Add fallback to Deezer when `coverArt` is missing |
| `src/lib/services/lastfm/client.ts` | Add Deezer fallback when Last.fm image URLs are empty |

**Implementation:**
```typescript
export async function getDeezerArtistImage(artistName: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}`);
    const data = await res.json();
    return data.data?.[0]?.picture_xl || data.data?.[0]?.picture_large || null;
  } catch {
    return null;
  }
}

export async function getDeezerAlbumImage(artist: string, album: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.deezer.com/search/album?q=${encodeURIComponent(`${artist} ${album}`)}`);
    const data = await res.json();
    return data.data?.[0]?.cover_xl || data.data?.[0]?.cover_large || null;
  } catch {
    return null;
  }
}
```

**Caching:** Use the existing `CacheService` with a 7-day TTL for Deezer image URLs.

---

### 2.2 Dynamic Album Art Colors
**Priority:** MEDIUM | **Effort:** Low | **Source:** Koito

Extract dominant color from current track's album art to create ambient background in the player/now-playing view.

**Approach:** Use the browser's `Canvas` API to sample the album art image and extract the dominant color. Apply as a gradient behind the player bar.

**Files to create:**
| File | Purpose |
|------|---------|
| `src/lib/utils/color-extractor.ts` | `extractDominantColor(imageUrl): Promise<{r,g,b}>` using canvas sampling |

**Files to modify:**
| File | Changes |
|------|---------|
| `src/components/layout/PlayerBar.tsx` | Apply extracted color as CSS variable `--player-accent` on the player background |
| `src/lib/stores/audio.ts` | Add `currentAccentColor` state, updated on song change |

**Implementation notes:**
- Load album art into an offscreen canvas, sample pixels, find dominant color via k-means or simple bucket sort
- Cache color per `albumId` in memory (`Map<string, string>`) to avoid re-extraction
- Apply as subtle gradient: `background: linear-gradient(135deg, rgba(r,g,b,0.15), transparent)`
- Fallback to theme accent color when extraction fails or image is missing

---

## Epic 3: Data Bootstrapping & History

### 3.1 Historical Last.fm Scrobble Backfill
**Priority:** HIGH | **Effort:** Medium | **Source:** your_lastfm

One-time import of complete Last.fm listening history into the `listeningHistory` table.
This is the single highest-impact upgrade — it gives compound scoring years of data
on day one instead of starting cold.

**Last.fm API:** `user.getrecenttracks` with pagination (200 per page, up to 200,000+ scrobbles).

**Files to create:**
| File | Purpose |
|------|---------|
| `src/lib/services/lastfm-history-sync.ts` | Full sync logic: paginate, match to Navidrome, insert |
| `src/routes/api/lastfm/sync-history.ts` | POST endpoint to trigger sync (with progress tracking) |

**Files to modify:**
| File | Changes |
|------|---------|
| `src/lib/services/lastfm/client.ts` | Add `getRecentTracks(user, page, limit, from?)` method |
| `src/components/ai-dj-settings.tsx` or settings page | Add "Import Last.fm History" button with progress indicator |

**Sync algorithm:**
```
1. GET user.getrecenttracks?user={username}&limit=200&page=1
2. Extract total_pages from response
3. For each page (1 to total_pages):
   a. Fetch page with 500ms delay between requests (rate limit)
   b. For each track:
      - Search Navidrome for matching song (artist + title)
      - If found: insert into listeningHistory with playedAt from Last.fm timestamp
      - If not found: skip (song not in library)
      - Use INSERT ... ON CONFLICT (user_id, song_id, played_at) DO NOTHING
   c. Emit progress via response streaming or SSE
4. After sync: trigger compound score recalculation
```

**Rate limiting:** Last.fm allows 5 req/s. With 200 tracks/page, a 50,000 scrobble history = 250 pages = ~2 minutes of API calls. Add configurable delay (default 500ms between pages).

**Progress tracking:**
```typescript
interface SyncProgress {
  status: 'running' | 'complete' | 'error';
  totalPages: number;
  currentPage: number;
  totalScrobbles: number;
  matched: number;    // Found in Navidrome
  skipped: number;    // Not in library
  duplicates: number; // Already in listeningHistory
}
```

**UI:** Button in settings → opens modal with progress bar → triggers compound score recalc on completion.

**Deduplication:** Add unique constraint on `(user_id, song_id, played_at)` to `listeningHistory` if not present. Use `ON CONFLICT DO NOTHING`.

---

### 3.2 Interest Tracking Over Time
**Priority:** MEDIUM | **Effort:** Medium | **Source:** Koito

Track when a user discovers artists and how their interest evolves. Produces rising/declining curves that can feed into recommendation weights.

**Approach:** Bucketed listen analysis (same as Koito's `interest.sql` pattern). For a given artist:
1. Find first and last listen
2. Divide that range into N time buckets
3. Count listens per bucket
4. Return time-series showing interest curve

**Files to create:**
| File | Purpose |
|------|---------|
| `src/lib/services/interest-tracker.ts` | `getArtistInterestCurve(userId, artist, buckets?)` |
| `src/components/music-identity/InterestGraph.tsx` | Recharts `AreaChart` showing interest over time |

**Files to modify:**
| File | Changes |
|------|---------|
| `src/components/music-identity/MusicIdentityDashboard.tsx` | Add interest graphs for top artists |
| `src/lib/services/blended-recommendation-scorer.ts` | Optional: weight recommendations by interest trend (rising artists get boost) |

**Query:**
```sql
WITH artist_range AS (
  SELECT MIN(played_at) as first_listen, MAX(played_at) as last_listen
  FROM listening_history
  WHERE user_id = ? AND LOWER(artist) = LOWER(?)
),
buckets AS (
  SELECT generate_series(0, ?-1) as bucket_idx
)
SELECT
  bucket_idx,
  first_listen + (last_listen - first_listen) * bucket_idx / ? as bucket_start,
  COUNT(lh.id) as listen_count
FROM buckets
LEFT JOIN listening_history lh ON ...
GROUP BY bucket_idx
ORDER BY bucket_idx
```

---

## Epic 4: Discovery & Library Integration

### 4.1 "Add to Lidarr" from Recommendations
**Priority:** MEDIUM | **Effort:** Low-Medium | **Source:** Lidify

When a recommended track is from an artist not in the user's Navidrome library, offer a one-click "Add to Lidarr" button that:
1. Looks up the artist's MusicBrainz ID (MBID)
2. Adds the artist to Lidarr with the user's configured quality profile

**Files to create:**
| File | Purpose |
|------|---------|
| `src/lib/services/musicbrainz.ts` | `lookupArtistMBID(artistName): Promise<string \| null>` using MusicBrainz search API |
| `src/routes/api/lidarr/add-artist.ts` | POST endpoint: takes artist name, looks up MBID, adds to Lidarr |

**Files to modify:**
| File | Changes |
|------|---------|
| `src/lib/services/lidarr.ts` | Add `addArtist(mbid, name)` method using existing Lidarr client |
| `src/components/ui/queue-panel.tsx` | Add "Add to Lidarr" button on songs from non-library artists |
| `src/components/recommendations/RecommendationCard.tsx` | Add Lidarr button |

**MusicBrainz lookup:**
```typescript
export async function lookupArtistMBID(artistName: string): Promise<string | null> {
  const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json&limit=5`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AIDJ/1.0 (https://github.com/lolimmlost/aidj)' }
  });
  const data = await res.json();

  // Fuzzy match best result
  for (const artist of data.artists || []) {
    if (artist.name.toLowerCase() === artistName.toLowerCase()) {
      return artist.id; // MBID
    }
  }
  return data.artists?.[0]?.id || null; // Best guess fallback
}
```

**Rate limiting:** MusicBrainz requires 1 req/s max. Use existing rate limiter pattern.

---

### 4.2 Shareable Music Identity Cards (Server-Side)
**Priority:** LOW | **Effort:** Medium | **Source:** your_lastfm

Generate PNG images of Music Identity summaries for social sharing. The existing `ShareableCard.tsx` component renders client-side — this adds server-side rendering for consistent output.

**Approach:** Use `@napi-rs/canvas` (Rust-based, no native deps) or `satori` (Vercel's HTML-to-SVG-to-PNG) for server-side rendering.

**Files to create:**
| File | Purpose |
|------|---------|
| `src/lib/services/card-renderer.ts` | Server-side image generation from Music Identity data |
| `src/routes/api/music-identity/share-image.ts` | GET endpoint: returns PNG for a summary |

**Files to modify:**
| File | Changes |
|------|---------|
| `src/components/music-identity/ShareableCard.tsx` | Add "Download as Image" button that hits the API |

**Note:** This is the lowest priority item. The existing client-side `ShareableCard.tsx` already provides sharing functionality. Server-side rendering only adds consistency across devices.

---

## Implementation Order

Ordered by dependency chain and impact:

| Order | Item | Epic | Effort | Depends On |
|-------|------|------|--------|------------|
| 1 | Period-Over-Period Comparison Cards | 1.1 | Low | Nothing |
| 2 | Deezer Image Fallback | 2.1 | Low | Nothing |
| 3 | Listening Hour Distribution | 1.2 | Low | Nothing |
| 4 | Artist Diversity Metric | 1.3 | Low | 1.1 (uses same period util) |
| 5 | Historical Last.fm Scrobble Backfill | 3.1 | Medium | Nothing (but best done early for data) |
| 6 | Album Age Trending | 1.4 | Low-Med | 3.1 (benefits from backfilled data) |
| 7 | Dynamic Album Art Colors | 2.2 | Low | Nothing |
| 8 | Interest Tracking Over Time | 3.2 | Medium | 3.1 (needs history data) |
| 9 | Add to Lidarr from Recommendations | 4.1 | Low-Med | Nothing |
| 10 | Shareable Music Identity Cards (Server) | 4.2 | Medium | Nothing (nice-to-have) |

---

## New Files Summary

| File | Epic | Purpose |
|------|------|---------|
| `src/lib/utils/period-comparison.ts` | 1.1 | Period delta calculation helpers |
| `src/lib/services/session-detector.ts` | 1.5 | Listening session detection |
| `src/lib/services/deezer.ts` | 2.1 | Deezer free API client (images) |
| `src/lib/utils/color-extractor.ts` | 2.2 | Album art dominant color extraction |
| `src/lib/services/lastfm-history-sync.ts` | 3.1 | Full Last.fm scrobble import |
| `src/lib/services/interest-tracker.ts` | 3.2 | Artist interest curve calculation |
| `src/lib/services/musicbrainz.ts` | 4.1 | MusicBrainz MBID lookup |
| `src/lib/services/card-renderer.ts` | 4.2 | Server-side image generation |
| `src/components/music-identity/ListeningHourChart.tsx` | 1.2 | 24-hour bar chart component |
| `src/components/music-identity/InterestGraph.tsx` | 3.2 | Artist interest area chart |
| `src/routes/api/listening-history/stats.ts` | 1.1 | Period stats endpoint |
| `src/routes/api/listening-history/by-hour.ts` | 1.2 | Hourly distribution endpoint |
| `src/routes/api/listening-history/album-age.ts` | 1.4 | Album age trending endpoint |
| `src/routes/api/listening-history/sessions.ts` | 1.5 | Longest sessions endpoint |
| `src/routes/api/lastfm/sync-history.ts` | 3.1 | History import trigger |
| `src/routes/api/lidarr/add-artist.ts` | 4.1 | Add artist to Lidarr |
| `src/routes/api/music-identity/share-image.ts` | 4.2 | Shareable PNG endpoint |

## Modified Files Summary

| File | Items |
|------|-------|
| `src/lib/services/listening-history.ts` | 1.1, 1.2, 1.3, 1.4 |
| `src/lib/db/schema/listening-history.schema.ts` | 1.4 (add `albumYear` column) |
| `src/components/dashboard/DashboardHero.tsx` | 1.1 |
| `src/components/music-identity/MusicIdentityDashboard.tsx` | 1.2, 1.3, 1.5, 3.2 |
| `src/lib/services/navidrome.ts` | 2.1 |
| `src/lib/services/lastfm/client.ts` | 2.1, 3.1 |
| `src/components/layout/PlayerBar.tsx` | 2.2 |
| `src/lib/stores/audio.ts` | 2.2 |
| `src/lib/services/lidarr.ts` | 4.1 |
| `src/components/ui/queue-panel.tsx` | 4.1 |
| `src/components/recommendations/RecommendationCard.tsx` | 4.1 |
| `src/components/ai-dj-settings.tsx` | 3.1 (import button) |
| `src/components/music-identity/ShareableCard.tsx` | 4.2 |
| `src/lib/services/blended-recommendation-scorer.ts` | 3.2 (optional interest weighting) |

---

## Schema Changes

Only one schema migration needed:

```sql
-- Migration: Add albumYear to listening_history
ALTER TABLE listening_history ADD COLUMN album_year INTEGER;
CREATE INDEX listening_history_album_year_idx ON listening_history(album_year);

-- Add unique constraint for dedup during Last.fm import
-- (if not already present)
CREATE UNIQUE INDEX IF NOT EXISTS listening_history_dedup_idx
  ON listening_history(user_id, song_id, played_at);
```

---

## Dependencies to Add

| Package | Purpose | Epic |
|---------|---------|------|
| None required for 1.x, 2.1, 3.1, 4.1 | — | — |
| `@napi-rs/canvas` OR `satori` + `sharp` | Server-side image gen (optional) | 4.2 |

All other features use existing dependencies (Recharts 3, Drizzle, fetch API).

---

## Testing Strategy

Each upgrade should be verified before moving to the next:

- **1.1-1.5:** Check dashboard renders correctly, verify SQL queries return expected data
- **2.1:** Verify Deezer images load for artists/albums with missing Navidrome/Last.fm artwork
- **2.2:** Check color extraction works, verify fallback to theme color, check performance (should not lag on song change)
- **3.1:** Test with a Last.fm account, verify scrobble count matches, check deduplication, verify compound scores improve after backfill
- **3.2:** Verify interest curves render for artists with >10 listens, check bucketing logic
- **4.1:** Test MusicBrainz lookup accuracy, verify Lidarr add succeeds, check error handling for missing artists
- **4.2:** Verify PNG generation matches client-side card appearance

---

## What This Does NOT Include

Features from the competitive analysis that were deliberately excluded:

| Feature | Reason for exclusion |
|---------|---------------------|
| 12-theme system (Koito) | AIDJ already has dark/light via ThemeProvider; full multi-theme is a separate initiative |
| Romanization/transliteration | Niche use case; revisit if international library support is requested |
| Prometheus metrics (Your Spotify) | Over-engineering for a self-hosted app |
| Friend compatibility (your_lastfm) | Requires multi-user infra; AIDJ is currently single-user focused |
| Full Spotify polling loop | AIDJ uses Navidrome, not Spotify direct |
| In-memory KV with TTL (Koito) | Existing CacheService covers this |
| Skeleton loading states (Koito) | Nice-to-have but purely cosmetic; not bundled here |
