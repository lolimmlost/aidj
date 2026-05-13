# Findings — Last.fm genre patterns + Platypush recap method

Research output for the brief at `lastfm-genre-recap-research-brief.md`. ~60 min budget. Sources at end.

---

## 1. Last.fm tag system primer

Last.fm tags are a **folksonomy**: any user can apply any free-text tag to any artist, track, or album. Multiple endpoints surface them: `artist.getTopTags`, `track.getTopTags`, `album.getTopTags`, plus `tag.getInfo` / `tag.getSimilar` / `tag.getTopArtists` operating on the tag dimension itself.

**Tag weights.** Each tag in `getTopTags` responses carries a `count` field that is **normalized 0–100 relative to the top tag for that entity** (it is *not* a raw count of applications, despite the field name). For Lana Del Rey the top tags are `female vocalists` = 100, `indie` = 93, `indie pop` = 88, etc. — i.e. the most-applied tag is anchored at 100 and others are proportional. This makes the values directly usable as similarity weights without further normalization. The official `artist.getTopTags` doc page is sparse and does not document the `count` semantics; the 0–100 normalization is confirmed by the unofficial docs and by sampling responses (see sources).

**Noise tags.** Folksonomy noise on Last.fm is real and well-documented. Most-applied tags across the whole site include `seen live`, `favorites` / `favourite` / `favourites`, `male vocalists`, `female vocalists`, `singer-songwriter` (sometimes), `awesome`, `under 2000 listeners`, plus year/decade tags (`00s`, `70s`) and country tags (`british`, `american`). The Million Song Dataset's last.fm subset and academic semantic-map work both flag these as the dominant non-musical contamination.

No project I found ships a canonical Last.fm noise-tag blocklist. The pragmatic recipes:
- Hard-coded blocklist of ~20–40 strings (`seen live`, `favorites`, `male/female vocalists`, `awesome`, `good`, `under 2000 listeners`, `loved tracks`, `my music`, etc.).
- Decade/year regex (`/^(19|20)\d0s?$/`, `/^\d{4}$/`).
- A min-weight threshold (drop tags with `count < ~15`) — kills the long tail where one user invented a tag.
- An artist-list overlap check (a "tag" that is also an artist name on Last.fm is almost always a fan tag like `fleetwood mac` applied to Fleetwood Mac tracks — drop it).

ListenBrainz acknowledges the same problem with **its own** (MusicBrainz-sourced) tags and has an open discourse thread proposing a `mb:`/`ht:` prefix system; it explicitly does **not** use Last.fm tags in its radio engine.

## 2. Tag-overlap vs. artist-similarity-graph vs. hybrid

Three options for "should this candidate stay in a radio seeded from X":

| Approach | Signal | Strengths | Weaknesses |
|---|---|---|---|
| **Tag overlap** (cosine on top-N tag vectors with weights) | Per-artist Last.fm `toptags` | Cheap to cache, smooth continuous score, handles cold-start artists with no `getsimilar` results, generalizes across genres ("70s mellow rock") | Folksonomy noise; biased toward popular artists with many taggers |
| **Artist-similarity graph** (Last.fm `artist.getsimilar` distance) | Last.fm co-listening graph | Captures real human listening adjacency; works when no shared tags exist | Cliffs in sparse parts of the graph; opaque match scores; current AIDJ usage already feels these cliffs |
| **Hybrid** | Both, combined | Filter for tag coherence *and* graph adjacency; either alone is allowed to rescue | More code, two caches |

**What comparable projects do:**
- **ListenBrainz Radio** (Troi): tag-driven, but uses **MusicBrainz** tags rather than Last.fm. Supports `tag:(trip hop)::nosim` to disable similar-tag expansion. Difficulty modes (easy/medium/hard) trade strictness of the tag match against recall.
- **Funkwhale**: pre-populates its tag table from MusicBrainz's official genre taxonomy (canonical vocabulary) and lets user-added tags coexist with a `musicbrainz_id` foreign-key when names match exactly. References but does not implement a "quality filter" for noise.
- **Maloja**: deliberately ships with no recommendation/radio at all; just stats.
- **MusicBrainz** itself imported ~6M genre tags into 1.3M recordings in 2021, sourced from Discogs + Last.fm + beaTunes — so the editorial side has effectively *already laundered* the most useful Last.fm tags into MusicBrainz genres.
- **Spotify Radio** (closed): widely reported to combine collaborative filtering (the graph side) with audio-feature similarity and editorial genre/mood tags — i.e. hybrid.

**Concrete recommendation for AIDJ.** Hybrid, but with tag-overlap as the *gate* and graph-similarity as the *rank*:
1. Cache `artist.getTopTags` per artist (covered below). Apply a blocklist + min-weight + decade-regex filter; keep the top 5–10 after filtering.
2. Replace `tokenizeGenre` / `filterByGenreOverlap` in `seeded-radio.ts` with a cosine over those filtered tag vectors. Use it as a **soft gate**: candidates below a coherence threshold are dropped (keep the existing 25% fallback so empty results never ship).
3. Keep `track.getsimilar` / `artist.getsimilar` as the rank signal you already pay for.
4. For artist-radio specifically, tag-cosine resolves the "hip-hop pick leaking into a classic-rock radio" failure mode directly, because the leaking artist's tag vector won't overlap with the seed's.

This sidesteps the brief's anti-goal of "don't rebuild the scorer" — the change is to the *gating* step, not the scorer.

## 3. Platypush compound-scoring math + recap module

The Platypush "music recommender" is a single ~2022 blog post by Fabio Manganiello (BlackLight): **["Automate your music collection"](https://blog.platypush.tech/article/Automate-your-music-collection)** (also mirrored on Medium / Better Programming). It is the source AIDJ already credits in `listening-history.schema.ts`.

**Schema (verbatim from the post):**
```sql
create table music_similar(
    source_track_id   int not null,
    target_track_id   int not null,
    match_score       float not null,
    primary key(source_track_id, target_track_id),
    foreign key(source_track_id) references music_track(id),
    foreign key(target_track_id) references music_track(id)
);
```
This is the same shape as AIDJ's `track_similarities`.

**Scoring formula (verbatim from the post).** The ranking of the i-th suggested track is the sum of `match_score`s from each recently-listened source track that has that suggestion as a similar:
```python
.order_by(func.sum(TrackSimilar.match_score).desc())
.limit(limit)
```
with a binary recency filter:
```python
listened_activity.c.created_at >= date.today() - timedelta(days=days)
```

**Two important differences from AIDJ's implementation:**
1. Platypush uses a **flat sum over a hard window** (default 7 days). No time-decay. AIDJ's `compound-scoring.ts` uses **exponential decay** (`weight = e^(-0.15 * days_ago)`, ~50% at 5 days) over a 14-day window. AIDJ is strictly more nuanced here.
2. Platypush has **no separate recap module**. The "recap" the maintainer referenced is the **`Discover Weekly [date]`** playlist generated by a cron: `@cron('0 6 * * 1')` (every Monday 6 AM), 25-track output ranked by the sum formula. There is also a **`New Releases [date]`** cron at Monday 7 AM that pulls from monitored artist releases — that's the "new music" half of the recap pattern, not similarity-based.

So: the "Platypush method for recaps" is not a distinct algorithm. It is the **same compound-scoring summation, but run periodically and persisted as a named playlist** rather than served live. The recap is a *materialization* of a snapshot, not a separate model. Platypush does not use Last.fm tags anywhere in this flow — only `track.getsimilar`.

## 4. Two concrete proposals

### Short-term: Last.fm artist-tags integration

Add a cache table and use it in `seeded-radio.ts`:

```ts
// drizzle schema sketch — src/lib/db/schema/artist-tags.schema.ts
export const artistTags = pgTable('artist_tags', {
  // Canonical artist key (lowercased, trimmed). Use name not Navidrome ID
  // because we need this keyed by what Last.fm returns.
  artistKey: text('artist_key').primaryKey(),
  // Optional MusicBrainz ID for later cross-walk to MB genres.
  mbid: text('mbid'),
  // Filtered top tags: [{name, weight}] sorted desc, ~5–10 entries post-filter.
  tags: jsonb('tags').$type<Array<{name: string; weight: number}>>().notNull(),
  // Source-of-truth tracking for cache busting.
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
  // TTL: tags barely change — 90 days is safe, 30 days conservative.
  expiresAt: timestamp('expires_at').notNull(),
});
```

Service surface:
- `getArtistTags(artistName): Promise<Tag[]>` — read-through cache calling `artist.getTopTags`.
- `applyTagFilter(rawTags): Tag[]` — apply blocklist + min-weight ≥ 15 + decade regex + drop tags equal to any artist name in the user's library.
- `tagCosine(a, b): number` — standard cosine over the two weight vectors (treat missing tags as 0).
- In `seeded-radio.ts`, replace `filterByGenreOverlap` body with: compute seed-artist tag vector once; for each candidate compute cosine vs seed; drop if below threshold (try 0.15). Keep the existing 25% fallback for empty-set safety.

TTL precedent: Last.fm tag distributions move on the order of months; the existing `track_similarities` table uses an `expiresAt`. 30–90 days is in line with what Picard-plugin and Lidify-style tools do.

This is roughly one schema file + one service file + a ~30-line edit to `seeded-radio.ts`. Single API call per uncached artist (one-time per artist for ~90 days).

### Longer-term: Recap / smart-summary for the Analytics page

Platypush's recap = **periodic materialization of the same scorer that drives the live recommender**. AIDJ already has the live scorer (`getBlendedRecommendations`) and the listening-history table. A "smart recap" module would:

1. **Weekly digest cron** (mirrors Platypush's Monday 6 AM). Compute and persist:
   - Top 10 tracks by play count (week / month / year scopes).
   - Top 5 artists by play count + by *novelty* (first-heard-this-period).
   - Top tag clusters from the new `artist_tags` cache (e.g. "53% of plays were `indie rock` / `dream pop` / `shoegaze`").
   - Skip-rate outliers (most-skipped artists, most-completed albums).
   - Listening peak hours (you already compute temporal prefs).
   - Suggested "Discover [week]" playlist: same 25-track sum-over-similars output as Platypush, persisted so users can compare week to week.
2. **Persistence shape**: a `recaps` table keyed by `(userId, periodKind, periodStart)` with a JSONB blob of the materialized summary. Cheap to render; immutable once written; trivially exportable.
3. **UI**: Analytics page tab "Recaps" with cards for week/month/year. The year-end version is the obvious "Wrapped" play.

What this *doesn't* do (per the brief's anti-goal): require a user Last.fm account. Everything aggregates over the local `listening_history` and the cached `artist_tags`.

The infrastructure pieces are already present — listening history, compound scores, artist affinity, temporal preferences. The recap module is a thin aggregator + persistor over them, plus the new tag cache for the genre-cluster slice.

## 5. Open questions and tradeoffs

- **`artist.getTopTags` `count` semantics.** Last.fm's official doc page does not state the 0–100 normalization explicitly. I'm asserting it from sample responses and unofficial docs — *flagged as speculation*. Worth confirming on a sample of 5–10 artists before implementing the cosine threshold.
- **MBID resolution.** The `artist_tags.mbid` column is optional and gives a path to swap in MusicBrainz editorial genres later. Navidrome surfaces MBIDs on tracks; whether that's reliably populated in this library is unverified.
- **Track vs. artist tags.** Per-track `track.getTopTags` is more specific (one Fleetwood Mac song = `mellow gold`, not just `classic rock`) but ~50× the API cost and ~50× the cache rows. Start with artist tags; only escalate to track tags if the artist-level granularity is too coarse for AIDJ's failure modes.
- **No public Last.fm noise-tag blocklist.** Every project that solves this rolls their own. I'd start with the obvious ~20 strings + heuristics in §1; expect to tune over a few weeks of observation.
- **Cosine threshold.** 0.15 is a guess. The Million Song Dataset has tag data you could empirically tune against; not in scope here.
- **Does Platypush have anything else hiding?** I checked the music-related blog index and only found the one recommender post + a 2025 mobile-streaming setup post. No separate recap engine. The "recap method" phrasing in the brief is best interpreted as "the cron-materialized weekly playlist version of the same compound formula."

---

## Sources

- [Last.fm API home](https://www.last.fm/api)
- [Last.fm `artist.getTopTags`](https://www.last.fm/api/show/artist.getTopTags)
- [Last.fm `track.getTopTags`](https://www.last.fm/api/show/track.getTopTags)
- [Unofficial Last.fm API docs (getTopTags JSON shapes)](https://lastfm-docs.github.io/api-docs/)
- [Million Song Dataset — Last.fm subset](http://millionsongdataset.com/lastfm/)
- [Skupin, "A Semantic Map of the last.fm Music Folksonomy"](https://cns.iu.edu/images/pres/2012-skupin-last-fm-giscience.pdf)
- [Fabio Manganiello — "Automate your music collection" (Platypush blog)](https://blog.platypush.tech/article/Automate-your-music-collection)
- [Fabio Manganiello — Better Programming mirror](https://medium.com/better-programming/automate-your-music-collection-using-this-python-package-3891754a48dc)
- [Platypush GitHub](https://github.com/BlackLight/platypush)
- [Maloja README](https://github.com/krateng/maloja)
- [Funkwhale genre-tags spec](https://docs.funkwhale.audio/develop/specs/genre-tags/index.html)
- [Funkwhale Picard tagging docs](https://docs.funkwhale.audio/user/libraries/content/tag.html)
- [ListenBrainz Recommendations API](https://listenbrainz.readthedocs.io/en/latest/users/api/recommendation.html)
- [Troi / LB Radio prompt reference](https://troi.readthedocs.io/en/latest/lb_radio.html)
- [MetaBrainz — "Tags that should be ignored in ListenBrainz" discourse](https://community.metabrainz.org/t/tags-that-should-be-ingnored-in-listenbrainz/814571)
- [MetaBrainz — genre-matching project (MB↔Last.fm/Discogs/beaTunes)](https://github.com/metabrainz/genre-matching)
- [ListenBrainz 2023 Recap (MetaBrainz blog) — example of a "recap" deliverable](https://blog.metabrainz.org/2024/02/26/listenbrainz-2023-recap/)
