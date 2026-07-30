# Listening Sessions — Design Spec

## Problem

The AI DJ is producing great mixes but there's no way to tell it "that was a good session" or analyze *why* certain sessions hit. Today we have:

- **Per-song signals**: thumbs up/down, skip detection, completion rate, source tagging (`ai_dj`, `manual`, `radio`, `autoplay`)
- **Session reconstruction**: `getLongestSessions()` infers sessions from 15-min gaps in `listening_history` — but these are ephemeral calculations with no identity, no rating, no metadata

We need listening sessions as first-class entities so users can rate them and we can mine the patterns that separate a fire mix from a mediocre one.

## Goals

1. **Materialize sessions** — persist them as DB rows with computed stats, not just gap-based reconstructions
2. **Session rating** — let users like/rate sessions via a lightweight UI gesture
3. **Session analytics** — expose APIs to query sessions with their stats, compare liked vs unliked
4. **Feed back into AI DJ** — use liked-session patterns to bias future recommendations

## Non-goals (for now)

- Session sharing / social features
- Session playlists (recreating the exact queue) — the songs are already in `listening_history`
- Real-time session tracking on the client — we materialize server-side from history

---

## Data Model

### `listening_sessions` table

Sessions are materialized server-side by scanning `listening_history` for gaps. A background job (or on-demand API call) creates/updates session rows.

```
listening_sessions
├── id                  text PK (uuid)
├── userId              text FK → user.id (cascade delete)
├── startedAt           timestamp NOT NULL
├── endedAt             timestamp NOT NULL
├── durationMinutes     integer NOT NULL
│
├── songCount           integer NOT NULL
├── uniqueArtistCount   integer NOT NULL
├── uniqueGenreCount    integer NOT NULL
├── completionRate      real NOT NULL        -- % of songs completed (>80% played)
├── skipRate            real NOT NULL        -- % of songs skipped
├── avgPlayPercentage   real NOT NULL        -- average play_duration/song_duration
│
├── topArtists          jsonb NOT NULL       -- [{name, count}] top 5
├── topGenres           jsonb NOT NULL       -- [{name, count}] top 5
├── sourceMix           jsonb NOT NULL       -- {ai_dj: 12, manual: 3, radio: 0, autoplay: 2}
├── dominantSource      text                -- 'ai_dj' | 'manual' | 'radio' | 'autoplay' | 'mixed'
│
├── -- Temporal context
├── dayOfWeek           integer              -- 1-7 (1=Monday)
├── hourOfDay           integer              -- 0-23 (session start hour)
├── season              text                 -- 'spring' | 'summer' | 'fall' | 'winter'
│
├── -- User rating
├── rating              integer              -- NULL = unrated, 1 = liked
├── ratedAt             timestamp
│
├── -- Bookkeeping
├── createdAt           timestamp NOT NULL DEFAULT now()
├── updatedAt           timestamp NOT NULL DEFAULT now()
│
├── UNIQUE(userId, startedAt)               -- one session per start time per user
│
├── INDEX(userId)
├── INDEX(userId, startedAt)
├── INDEX(userId, rating)
├── INDEX(userId, dominantSource)
```

### Why not extend `listening_history`?

Sessions are aggregates across multiple `listening_history` rows. Adding a `sessionId` FK to `listening_history` is the link between them — we add that column so every play knows which session it belongs to.

```
listening_history (new column)
├── sessionId           text FK → listening_sessions.id (SET NULL on delete)
```

---

## Session Boundary Rules

A session **starts** when a play is recorded and no play exists within the prior `GAP_MINUTES` (default: 15).

A session **ends** when the next play is more than `GAP_MINUTES` after the previous play's `playedAt + playDuration`.

**Minimum session size**: 3 songs. Anything shorter is noise (accidental plays, quick checks).

**Merging**: If a user pauses for 14 minutes and resumes, that's the same session. Only a true 15+ minute gap splits sessions.

---

## Materialization Strategy

### Option chosen: Periodic batch job + on-demand

A background job runs every 30 minutes:

1. Query `listening_history` rows where `sessionId IS NULL` and `playedAt > (now - 2 hours)`
2. Group into sessions using the gap algorithm (same as existing `getLongestSessions`)
3. For each group of 3+ songs:
   - Check if a `listening_sessions` row already exists for that `(userId, startedAt)` — update if so (the session grew)
   - Otherwise create a new row
4. Backfill `sessionId` on the `listening_history` rows
5. For sessions that ended > 15 min ago, mark them as finalized (won't grow)

The on-demand path (`POST /api/listening-history/sessions/materialize`) runs the same logic for the current user — called by the UI when the user opens the sessions view.

### Why not real-time?

Creating/updating sessions on every `recordSongPlay` call adds latency to the hot path. The 30-minute batch is simpler, and sessions only need to be finalized after a gap anyway.

---

## API Endpoints

### `GET /api/listening-history/sessions`

**Already exists** — currently returns longest sessions via gap reconstruction. We migrate this to return materialized `listening_sessions` rows instead.

Query params:
- `from`, `to` — date range (ISO strings)
- `preset` — `'week' | 'month' | 'year'` (shorthand for date range)
- `source` — filter by `dominantSource`
- `rated` — `'true'` to return only rated sessions
- `sort` — `'recent' | 'longest' | 'rating'` (default: `'recent'`)
- `limit` — max sessions (default: 20, max: 50)

Response:
```json
{
  "success": true,
  "sessions": [
    {
      "id": "uuid",
      "startedAt": "2026-07-30T14:00:00Z",
      "endedAt": "2026-07-30T16:30:00Z",
      "durationMinutes": 150,
      "songCount": 38,
      "uniqueArtistCount": 22,
      "uniqueGenreCount": 8,
      "completionRate": 0.84,
      "skipRate": 0.08,
      "topArtists": [{"name": "Radiohead", "count": 4}, ...],
      "topGenres": [{"name": "Alternative Rock", "count": 12}, ...],
      "sourceMix": {"ai_dj": 30, "manual": 5, "autoplay": 3},
      "dominantSource": "ai_dj",
      "dayOfWeek": 3,
      "hourOfDay": 14,
      "rating": 1,
      "ratedAt": "2026-07-30T16:35:00Z"
    }
  ],
  "total": 47
}
```

### `GET /api/listening-history/sessions/:id`

Returns a single session with its full track list (joined from `listening_history`).

Response adds:
```json
{
  "session": { ... },
  "tracks": [
    {
      "songId": "abc123",
      "artist": "Radiohead",
      "title": "Karma Police",
      "album": "OK Computer",
      "playDuration": 250,
      "songDuration": 263,
      "completed": true,
      "skipped": false,
      "source": "ai_dj",
      "playedAt": "2026-07-30T14:02:00Z"
    }
  ]
}
```

### `POST /api/listening-history/sessions/:id/rate`

Rate a session.

Body:
```json
{
  "rating": 1
}
```

`rating: 1` = liked, `rating: null` = remove rating.

We keep it simple — a binary like, not a 1-5 scale. The signal we want is "I want more sessions like this." Adding granularity just adds friction.

Response:
```json
{
  "success": true,
  "sessionId": "uuid",
  "rating": 1
}
```

### `POST /api/listening-history/sessions/materialize`

Trigger session materialization for the current user. Returns the number of sessions created/updated.

Response:
```json
{
  "success": true,
  "created": 3,
  "updated": 1,
  "backfilledPlays": 47
}
```

### `GET /api/listening-history/sessions/insights`

Compare liked vs unliked sessions to surface patterns.

Response:
```json
{
  "success": true,
  "totalSessions": 47,
  "ratedSessions": 12,
  "likedSessions": 9,
  "insights": {
    "likedAvgDuration": 95,
    "unlikedAvgDuration": 42,
    "likedAvgSkipRate": 0.05,
    "unlikedAvgSkipRate": 0.18,
    "likedAvgCompletionRate": 0.89,
    "unlikedAvgCompletionRate": 0.71,
    "likedTopSources": {"ai_dj": 7, "mixed": 2},
    "likedTopGenres": [{"name": "Alternative Rock", "count": 6}],
    "likedTopArtists": [{"name": "Radiohead", "count": 5}],
    "likedAvgUniqueArtists": 18,
    "unlikedAvgUniqueArtists": 8,
    "preferredDayOfWeek": 5,
    "preferredHourOfDay": 21
  }
}
```

---

## UI Interaction Points

### 1. Session end prompt (primary entry point)

When the user pauses and 15+ minutes pass (session boundary), the next time they interact with the app, show a non-blocking toast/banner:

> **Your last session** — 38 songs, 2.5 hours  
> [Heart icon] Like this mix

Tapping the heart calls `POST /api/listening-history/sessions/:id/rate`. The banner auto-dismisses after 10 seconds or on any other interaction.

### 2. Sessions tab in Listening Analytics

A new tab alongside the existing analytics views. Shows a chronological list of sessions with:
- Duration, song count, dominant source badge
- Top artists (compact chips)
- Like button per session
- Expandable track list

### 3. Session detail view

Tapping a session opens a detail view with the full track list, stats breakdown, and the like button.

---

## Feeding Back Into AI DJ

Once we have enough liked sessions (10+), we can extract patterns:

1. **Genre distribution** — what genre mix do liked sessions have?
2. **Artist diversity** — liked sessions tend to have higher unique artist counts
3. **Skip rate threshold** — sessions with <10% skip rate get liked more
4. **Source preference** — does the user like pure AI DJ sessions or mixed?
5. **Temporal patterns** — do they like evening sessions more?

These become additional scoring signals in the blended recommendation scorer, gated behind a minimum data threshold.

---

## Implementation Plan

### Phase 1: Schema + materialization (this PR)
- [ ] `listening_sessions` schema
- [ ] Add `sessionId` column to `listening_history`
- [ ] Session materialization service (`src/lib/services/session-materializer.ts`)
- [ ] Background job in task-aggregator
- [ ] `POST /api/listening-history/sessions/materialize` endpoint
- [ ] Migrate `GET /api/listening-history/sessions` to use materialized data

### Phase 2: Rating + session detail
- [ ] `POST /api/listening-history/sessions/:id/rate` endpoint
- [ ] `GET /api/listening-history/sessions/:id` endpoint with track list
- [ ] Session end prompt UI (toast/banner)
- [ ] Sessions tab in Listening Analytics

### Phase 3: Insights + AI DJ integration
- [ ] `GET /api/listening-history/sessions/insights` endpoint
- [ ] Session preference signal in blended-recommendation-scorer
- [ ] Insights dashboard card

---

## Migration

```sql
-- New table
CREATE TABLE listening_sessions ( ... );

-- New column on existing table
ALTER TABLE listening_history ADD COLUMN session_id TEXT REFERENCES listening_sessions(id) ON DELETE SET NULL;
CREATE INDEX listening_history_session_id_idx ON listening_history(session_id);
```

No data loss. The materialization job backfills sessions from existing `listening_history` data — all historical sessions get created retroactively.
