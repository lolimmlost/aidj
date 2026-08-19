# Per-song YouTube (MeTube) fallback — issue #145

**Date:** 2026-08-18
**Status:** ✅ Built (backend + API + tests), pending deploy. No UI yet.

## What this solves

Playlist-import "misses" are sent to Lidarr, but a large fraction dead-end at
"artist has 0 albums" (issue #144) and silently never download. This adds a
second path: fetch each missed track **straight from YouTube via MeTube, one at a
time**, using yt-dlp's `ytsearch1:` search syntax — **no YouTube API key / OAuth
required**. Each result is verified against the requested artist/title so obvious
wrong-video / live / mix / channel-rip results are flagged instead of silently
polluting the library.

The landed file is named `Artist - Title` and drops into MeTube's download
folder, where the existing **Picard retag → Lidarr move → Navidrome rescan** flow
picks it up. This module stops at "downloaded + verified"; reconciling the track
back into the originating playlist is owned by the Import Manager (#132).

## Why `ytsearch1:` and not the YouTube API

`youtube-music.ts` exists but needs a Google API key + OAuth + quota. MeTube
passes its `url` field straight to yt-dlp, and `ytsearch1:<query>` tells yt-dlp
"download the top YouTube result for this query." Zero extra config. The prior
`queueMetubeDownload` (playlist-download.ts) explicitly bailed with "No YouTube
video ID available" — this fills exactly that gap.

## Pieces

- **`src/lib/services/youtube-fallback.ts`**
  - `normalizeSearchQuery(track)` — primary artist + de-noised title.
  - `buildYouTubeSearchUrl(query)` → `ytsearch1:…`.
  - `verifyDownload(track, item)` — fuzzy title/artist check → `{ matched, score, reason }`.
  - `queueAndAwaitDownload` — snapshots MeTube ids, queues one download, polls until
    a *new* item reaches finished/error (one-at-a-time makes the new-id detection
    unambiguous). 3s poll, 5-min per-track timeout.
  - `startYouTubeFallbackJob` / `getYouTubeFallbackJob` — in-process job registry
    (diagnostic/testing path polled while the page is open; no new DB table, mirrors
    media-flow-manager). Cap `MAX_TRACKS_PER_JOB = 50`.
- **`src/routes/api/downloads/youtube-fallback.ts`** (session-authed)
  - `POST` — start a job from an explicit `tracks[]` **or** an `importJobId`
    (pulls `no_match` + `pending_review` originals by default). Returns `{ jobId, total }`.
  - `GET ?jobId=…` — per-track status + summary.
- **`src/lib/services/__tests__/youtube-fallback.test.ts`** — 11 tests on the pure helpers.

## Per-track status model

`pending → searching → downloaded | mismatch | failed`

- `downloaded` — finished + verification passed (or verify disabled).
- `mismatch` — finished, but the result title doesn't look like the request (review before trusting).
- `failed` — MeTube error or 5-min timeout, after exhausting retries.

## Retries (added after the first prod test)

YouTube download failures are frequently transient — see the PO-token finding
below — so each track is retried up to `maxAttempts` (default 3, ceiling 5,
overridable per request). Between attempts the failed MeTube entry is deleted so
the same `ytsearch1:`-resolved id can be re-queued cleanly. The per-track
`attempts` count is surfaced in the GET status.

## Prod finding: MeTube PO-token / 403 (2026-08-18 first live test)

First live test track (`ytsearch1:Sun Room Insincere`) confirmed the search
resolves to the correct video ("Sun Room - Insincere [Official Audio]"), but the
download itself errored:

```
[youtube] [pot:bgutil:http] Error reaching GET http://127.0.0.1:4416/ping …
ERROR: unable to download video data: HTTP Error 403: Forbidden
```

yt-dlp wants a PO token from a bgutil provider at `127.0.0.1:4416` that is
unreachable, so token-gated videos 403. **This is a MeTube/yt-dlp ops issue,
independent of this feature**, but it caps the fallback's real-world success rate
until the POT provider is running/reachable (or yt-dlp is pointed at a client
that doesn't require the token). Retries help ride out the transient cases.

Also fixed from that test: dropped `custom_name_prefix`, which had doubled the
title (`"Sun Room - Insincere.Sun Room - Insincere [Official Audio]"`).

## How to test (Juan)

Start from the "Late aug" import misses (or any import job id):

```bash
# From a finished import job — pulls its no_match + pending_review tracks:
curl -s -X POST https://<app>/api/downloads/youtube-fallback \
  -H 'Content-Type: application/json' -b <session-cookie> \
  -d '{"importJobId":"01cb5639-dbff-4f81-b415-c71240551ada"}'

# Or explicit tracks:
curl -s -X POST https://<app>/api/downloads/youtube-fallback \
  -H 'Content-Type: application/json' -b <session-cookie> \
  -d '{"tracks":[{"artist":"Sun Room","title":"Insincere"},
                 {"artist":"Josh Baker","title":"My Place"},
                 {"artist":"A. G. Cook","title":"Idyll"}]}'

# Poll:
curl -s "https://<app>/api/downloads/youtube-fallback?jobId=<jobId>" -b <session-cookie>
```

Watch server logs for `[YouTubeFallback]` lines. Then confirm the downloaded files
land in MeTube's folder and run the Picard retag flow against them → Lidarr moves →
Navidrome rescans → reconciliation remaps any ghost id → track is playable.

## Runtime assumption to confirm on first run

MeTube forwards `ytsearch1:` to yt-dlp — verify the deployed MeTube accepts a
non-URL `url` (it does not go through `/api/metube/add`, which whitelists real
site URLs; this path calls the MeTube service directly). If MeTube rejects it,
fall back to resolving a video id via `youtube-music.ts` search first.

## Not built (follow-ups)

- **UI.** No button yet — API only. The existing `/downloads/youtube` page is a
  manual URL paste; a "download import misses" action could live there or in the
  import review UI.
- **Persistence.** Job state is in-memory (lost on redeploy). Fine for a testing
  tool; if this becomes a durable auto-fallback, fold it into the Import Manager (#132).
- **Auto-trigger.** Currently manual. Wiring "Lidarr 0-albums → auto YouTube
  fallback" is the #144 + #145 join.
