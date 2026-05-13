# Research brief — Last.fm-based genre/recommendation patterns + Platypush "recaps"

**Audience**: an agent or developer doing background research, output read by the AIDJ maintainer.
**Goal**: inform the next round of recommendation-quality and analytics improvements with a clear picture of (a) what Last.fm exposes that we don't yet use, and (b) what the Platypush music ecosystem has already figured out about period-summary aggregation ("recaps").
**Time budget**: ~60–90 minutes of research, ~600–1000 word writeup.

---

## What AIDJ is, in 60 seconds

Self-hosted Subsonic (Navidrome) frontend with an AI DJ layer. Recommendations are produced by a "blended scorer" combining:
- Last.fm `track.getsimilar` / `artist.getsimilar` for similarity signal.
- Compound scoring (Platypush-inspired): every played song fans out into Last.fm similar tracks, weighted by recency; songs suggested by *multiple* played sources rank higher.
- Per-user artist affinity, temporal preferences, skip-penalty, artist co-occurrence within sessions.
- Profile-based path that uses only DB-computed weights and zero API calls.

Genre tags currently come from Navidrome's `genre` column on each track — usually a single string (e.g. `"Rock"`, `"Hip Hop"`, `"Rock en Español"`). That's the only genre data the radio pipeline consults today.

A recent fix (commit `72426dd`) added a token-based genre filter to the artist-radio adjacent slice: tokenize each catalog track's `genre`, build a set, filter candidate tracks whose tokens don't overlap. Lenient on missing data, with a 25% fallback threshold.

## Current Last.fm surface we DO use

From `src/lib/services/lastfm/client.ts`:
- `track.getsimilar` (raw + enriched)
- `artist.getsimilar` (raw + enriched)
- `artist.gettoptracks`
- `tag.gettoptracks`
- `track.search`
- `track.getInfo`
- `user.getrecenttracks`

## Last.fm surface we DON'T use (relevant to this research)

- `artist.getInfo` — bio + similar artists + **top tags** (folksonomy: "classic rock", "soft rock", "70s", "fleetwood mac", "the queen and the king", etc.). Per-artist tag weights normalized 0–100.
- `artist.getTopTags` — same as above but standalone, returns weighted tag list.
- `track.getTopTags` — per-track folksonomy. A specific Fleetwood Mac track might be tagged `"blues rock"`, `"70s"`, `"mellow"` etc.
- `album.getTopTags` — per-album tags.
- `tag.getInfo` / `tag.getTopArtists` / `tag.getTopTracks` / `tag.getSimilar` — operate on the tag dimension itself.
- `user.getTopArtists` / `user.getTopTracks` / `user.getTopTags` / `user.getWeeklyChartList` — period-based summaries from Last.fm's own scrobble history (if user has connected Last.fm).
- `chart.gettopartists` / `chart.gettoptracks` — global popularity.

## What we want to know

### A. Genre coherence (improving the radio filter we just shipped)

1. **How does Last.fm's tag system compare to Navidrome's single-string `genre` field for similarity gating?** Specifically: tag weighting (0–100), tag overlap as a distance metric, whether we can use cosine similarity between two artists' top-N tag vectors as a continuous coherence score instead of a binary filter.
2. **What are common pitfalls of using Last.fm tags?** Folksonomy issues — tags like `"seen live"`, `"male vocalists"`, `"favorites"` aren't musical at all. What's the standard tag-blacklist or filtering approach?
3. **How do similar projects (Listenbrainz, Maloja, Funkwhale, etc.) reconcile Last.fm tags with editorial genres** (MusicBrainz, Discogs)? Is there a hybrid pattern worth copying?
4. **Caching strategy**: tags don't change often, but our pipeline currently fetches Last.fm on the hot path. What TTL is typical for tag data, and where would we store it? (We already have a `track_similarities` table; an `artist_tags` table is a natural addition.)
5. **Specific question**: for a "make a radio that sounds like X" use case, is the standard pattern to filter by **tag overlap** with the seed, or by **artist similarity** (Last.fm graph distance), or both? What does Spotify Radio reportedly do?

### B. The Platypush "recap" method

Per `listening-history.schema.ts` the compound-scoring approach was already inspired by Platypush. But the user mentioned a separate "Platypush method for recaps" — likely a different artifact. Likely candidates:

- Platypush's music plugins (`platypush.plugins.music.mpd`, `platypush.plugins.music.snapcast`) and its scrobbling / charts integrations.
- The blog post(s) by Platypush author Fabio Manganiello on building a personal music recommendation engine — there's a well-known multi-part series.
- Any code in the Platypush repo that aggregates listening history into periodic summaries (top tracks/artists/tags by week/month/year).

Research goals for this branch:

1. **Find the original Platypush blog post(s) on building a music recommender.** Author: Fabio Manganiello (BlackLight). Likely on platypush.tech or medium. Summarize: what does the compound-scoring math actually look like, what time-decay function does he use, how does he handle the cold-start problem, what does he do for periodic recaps vs. ongoing recommendation?
2. **Is there a separate "recap" module** distinct from the recommendation module? If so, what does it surface (top tracks/artists/tags/sessions, mood arc over time, listening peaks, …)?
3. **How does Platypush integrate Last.fm specifically** vs. local-only signal? Is Last.fm scrobbling treated as ground truth, or is internal play history the source?
4. **Adjacent projects**: Maloja, ListenBrainz, FunkWhale — do any of them publish their recap/wrapped algorithms? Spotify Wrapped is a closed model; what do the open alternatives do?

## Useful entry points for the agent

- Last.fm API docs: https://www.last.fm/api
- Platypush docs: https://docs.platypush.tech
- Platypush music sources: https://git.platypush.tech/platypush/platypush
- Maloja: https://github.com/krateng/maloja  (open-source self-hosted scrobbler + stats)
- ListenBrainz API: https://listenbrainz.readthedocs.io
- MusicBrainz tags/genre data model: https://musicbrainz.org/doc/Genre

## Deliverable shape

A markdown writeup of ~600–1000 words with these sections:

1. **Last.fm tag system primer** — what tags are, how weights work, how to filter noise tags.
2. **Comparison: tag-overlap filter vs. artist-similarity-graph vs. hybrid** — concrete recommendation for AIDJ's next step, including a sketch of what an `artist_tags` cache table would look like.
3. **Platypush compound-scoring math and recap module** — what we got from him already vs. what we haven't pulled in. Direct quotes / pseudo-code preferred.
4. **Two concrete proposals** for AIDJ's next quality improvement:
   - Short-term: a one-shot tag-cache integration that upgrades the existing genre filter from Navidrome's `genre` string to Last.fm artist tags.
   - Longer-term: a recap / smart-summary feature for the Analytics page that uses Platypush-style aggregation.
5. **Open questions and tradeoffs** — anything the agent couldn't resolve.

## Anti-goals

- **Do not** rebuild the existing compound scorer. We have it.
- **Do not** propose a "scrap Navidrome and use X" migration. Navidrome is the music server and stays.
- **Do not** propose anything that requires the user to maintain a Last.fm account or scrobble there. We can use the Last.fm API key for similarity/tag lookups without user scrobbles flowing the other direction.

## Context dump for follow-up

Project root: `/home/default/Desktop/dev/aidj`. Relevant files:
- `src/lib/services/lastfm/client.ts` — current Last.fm methods
- `src/lib/services/seeded-radio.ts` — recently added `tokenizeGenre` + `filterByGenreOverlap`
- `src/lib/services/compound-scoring.ts` — the Platypush-inspired scorer
- `src/lib/db/schema/listening-history.schema.ts` — has the Platypush attribution comment

User on host: `juan@10.0.0.227`. Production DB: container `ywf93h18i1g99xit9g7shjne`, name `ai_dj`. ~12,700 plays in `listening_history`, ~700 in `recommendation_feedback`.
