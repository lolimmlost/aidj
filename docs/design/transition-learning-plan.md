# Transition Learning — Design Doc (scope-disciplined)

**Status:** Proposal / not started
**Author:** (design pass with Claude)
**Date:** 2026-08-20
**Related:** `blended-recommendation-scorer.ts`, `profile-recommendations.ts`, `compound-scoring.ts`, `dj-match-scorer.ts`, `session-materializer.ts`, `listening_history` schema

---

## 1. Problem

The AI DJ scores each candidate as a weighted blend of *properties of that song in isolation*
(Last.fm similarity, compound history, acoustic BPM/key/energy fit, feedback, skip, temporal).
Nothing in the system models **sequence** — "given that *A* just played, is *B* actually a good
*next* song?" The acoustic `dj-match-scorer` is the closest thing, but it's a physics model
(are the BPMs/keys compatible), not a behavioral one (did this user, in practice, enjoy B-after-A).

Concretely: a good organic Navidrome shuffle run can be a better sequence than what the AI DJ
produces, and today none of that sequence knowledge is captured — when the AI DJ takes over, the
good run is gone and nothing learned from it. **Transition learning is the mechanism for capturing
"what actually plays well after what" from real listening and feeding it back as a ranking signal.**

## 2. Core idea (stated honestly)

Mine ordered pairs `(A → B)` from `listening_history`, aggregate them into transition statistics,
and use those stats to **re-rank candidates the existing pipeline already produced**. That's it.

The textbook framing is `P(B | A, session)`. We are **not** building that. For a single-user-ish,
self-hosted library, a full conditional-probability model is over-engineered and data-starved (see §4).
What we can actually estimate is a **transition quality score** for a pair, with heavy backoff to
artist- and genre-granularity because song→song pairs are almost all unobserved.

## 3. Non-goals — explicit scope fences

These are the guardrails. If a task doesn't fit inside them, it is a *different* project.

- **NG-1. Transitions do not generate candidates.** The signal only re-weights songs the existing
  pipeline (`gatherCandidates`) already surfaced. If B was never a candidate, transitions never
  summon it. *Rationale:* candidate sourcing is I/O/latency-bound (Navidrome search throttle, Last.fm
  limits). Letting transitions pull in new candidates reopens that entire problem. This fence alone
  kills most of the potential scope creep.
- **NG-2. No ML model, no training loop, no LightGBM/XGBoost/embeddings.** The output is aggregate
  counts in a table and a deterministic scoring function. No model artifact to train, serve, or version.
- **NG-3. No new real-time write path.** We reuse the `listening_history` rows already being written.
  No new client events, no new scrobble fields in Phase 1.
- **NG-4. No session-trajectory / energy-curve modeling.** "Where is the session heading" is a
  separate proposal. Transition learning is strictly pairwise (last track → next track), optionally
  last-N in a later phase, and nothing more.
- **NG-5. Not wired into the profile-based (zero-API) path in Phase 1.** One integration point only
  (the blended scorer). Expanding to `profile-recommendations.ts` is a follow-up, gated on Phase 1
  proving out.
- **NG-6. No UI.** No "why this song" surfacing, no transition visualizer, no admin tuning screen.
  Weights live in code constants.

## 4. Reality checks (read before writing any code)

This is the part that decides whether the whole thing is worth doing. Be skeptical here.

### 4.1 Data sparsity is the existential risk
For a library of thousands of songs, the song×song transition matrix is almost entirely empty.
Most `(A → B)` pairs will have **support 0 or 1**. A single observation is not evidence — a
"count = 1" transition is noise. Consequences that are **non-negotiable**:

- Require a **minimum support** (e.g. `count >= 3`) before a song→song cell is trusted at all.
- **Backoff hierarchy** is mandatory, not optional: `song→song` → `artist→artist` → `genre→genre`.
  Artist→artist will carry almost all the usable signal early on; song→song is a late-game luxury.
- The scorer must degrade to **neutral (no effect)** when there's no support, never to a random or
  penalizing value.

If artist→artist support is also too thin after mining real history, **the honest outcome is: don't
ship it.** See kill criteria (§8).

### 4.2 Confounding / feedback loop — the subtle killer
Most historical transitions were **produced by the AI DJ or autoplay**, not chosen freely by the user.
If we mine those, we learn *the recommender's own past behavior* and reinforce it — a closed loop that
launders the current algorithm's biases into "learned" truth. `listening_history.source` lets us
separate this. Policy:

- **`source = 'manual'` and organic Navidrome shuffle are the gold signal** — weight highest.
- **`source = 'ai_dj'` / `'autoplay'` transitions are heavily discounted or excluded** from the
  *positive* signal. (They remain valid for the *negative* signal — see 4.3.)
- This directly addresses the motivating anecdote: a great manual/shuffle run is exactly what we want
  to learn from; an AI-DJ-generated run is exactly what we must not treat as ground truth.

### 4.3 Skips are the most reliable signal we have
Positive transitions are sparse and confounded; **negative** ones are cleaner. `A → B` where B was
`skipDetected = 1` is strong evidence "B is a bad follow to A," and it's valid *regardless of source*
(even the AI DJ picking B and the user skipping it is a real negative). Early value likely comes more
from **demoting bad transitions than promoting good ones.** Design the score to be asymmetric-friendly.

### 4.4 `sessionId` is populated late, so mining must not depend on it
`session-materializer.ts` backfills `listening_history.sessionId` *after* a session closes; it is
NULL at insert time and NULL for older rows. Therefore the mining job reconstructs adjacency from
`(userId, playedAt)` ordering with a **time-gap boundary** (e.g. gap > 30 min ⇒ not a transition),
using `sessionId` as a refinement only when present. Pairs must not straddle a large idle gap — those
aren't transitions, they're two separate sittings.

## 5. Data model

One new aggregate table. Counts only — no per-event rows beyond what `listening_history` already holds.

```
track_transitions
  id              text pk
  user_id         text  → user.id (cascade)
  from_key        text        -- normalized key of A
  to_key          text        -- normalized key of B
  granularity     text        -- 'song' | 'artist' | 'genre'
  positive_count  integer     -- B completed (or not skipped), source-weighted
  negative_count  integer     -- B skipped
  total_count     integer     -- all observed A→B
  last_observed   timestamp
  updated_at      timestamp

  unique (user_id, granularity, from_key, to_key)
  index (user_id, granularity, from_key)
```

- `from_key`/`to_key` are `songId`, lowercased artist, or normalized genre depending on `granularity`.
- Aggregates only ⇒ the table stays small (bounded by observed pairs, not library size²).
- Recompute is idempotent (truncate-by-user + rebuild, or incremental since `last_observed`).

*No migration to `listening_history` is required for Phase 1.*

## 6. Mining job

A batch job (same shape as existing compound/affinity recompute; reuse that trigger cadence — do not
invent a new scheduler):

1. Pull the user's `listening_history` ordered by `playedAt`.
2. Form adjacent pairs `(A, B)` where `playedAt(B) - playedAt(A) <= GAP_MAX` (and same `sessionId`
   when both non-null).
3. For each pair, at each granularity:
   - `total_count += 1`
   - if `B.skipDetected` ⇒ `negative_count += w_source`
   - else if `B.completed` ⇒ `positive_count += w_source`
   - where `w_source` = high for manual/shuffle, low for ai_dj/autoplay (§4.2).
4. Upsert into `track_transitions`.

`GAP_MAX` and the `w_source` weights are code constants. Apply the same recency decay philosophy
already used in `compound-scoring` (`RECENCY_DECAY_RATE`) if/when it matters — **not required for v1**;
raw counts first.

## 7. Scoring integration (re-ranker only)

Add one signal to `blended-recommendation-scorer.ts`, mirroring the existing pattern
(`getFeedbackScores`, `getSkipPenalties`, `getCompoundScoreBoosts`):

- `getTransitionScores(userId, seedSong, candidateSongs) → Map<songId, number>` returning a score in
  `[-1, 1]` (or `[0,1]` centered at 0.5 for consistency with the other signals).
- Lookup order per candidate: song→song (if support ≥ min) else artist→artist else genre→genre else
  **neutral**.
- Score from counts, e.g. a smoothed `(positive - negative) / (total + k)` (Laplace-style smoothing so
  low support pulls toward neutral, not toward extremes).
- Add `transition` to `SCORE_WEIGHTS`. **Rebalance, don't inflate** — take the weight from the existing
  budget (candidate: the acoustic `dj` 0.20 and `temporal` 0.05 are the most overlapping/lowest-signal).
  Suggested starting point: `transition: 0.10`, pulled from `dj` (→0.15) and `temporal` (→0.0/removed),
  to be tuned. The weights must still sum to 1.0.

Everything else in the pipeline (candidate gen, diversity rules, feedback loop) is untouched.

## 7b. Phase 0 results (2026-08-21, prod, user juan@appahouse.com, 15,570 plays / 5.7 yrs)

Probe: `scripts/probe-transition-feasibility.ts`. Verdict: **qualified green light — build a narrowed v1.**

- **Confounding: passes decisively.** 95.5% of A→B pairs are organic (scrobble/manual/radio);
  only 4.5% recommender-chosen. The "AI DJ learns itself" risk is effectively absent.
- **Negative signal: real.** 1,449 skip pairs (10.5%), all from in-app plays (scrobbles never skip).
- **Support (make-or-break):**
  - song→song: 187/12,603 cells ≥3 support (**1.5%**) → **DEAD. Drop song-granularity entirely.**
  - artist→artist: 414/10,401 ≥3 (**4.0%**), 189 seeds with a confident edge → **weak-pass; usable head, noisy tail.**
  - genre→genre: 42/221 ≥3 (**19%**), 12 seeds → reliable but coarse; **backoff floor only.**

**Scope changes forced by the data (supersede §5–§7 where they conflict):**
1. **Granularity = artist→artist + genre→genre ONLY.** Song→song is a mirage; do not build it.
2. **Min-support ≥3 + Laplace smoothing are mandatory** — 96% of artist pairs are singletons (noise).
3. **Recency decay is now required for v1** (not deferred): support spans 2020→2026; raw counts let
   ancient scrobbles outvote current taste. Apply `compound-scoring`'s decay approach.
4. **Framing: a head-of-rotation nudge (~150–200 artists), not a transformation.** Consistent with NG-1.

## 8. Phased plan + kill criteria

**Phase 0 — Feasibility probe (read-only, no schema).** A throwaway query/script that reconstructs
pairs from existing `listening_history` and reports: how many distinct users have enough history;
support distribution at song / artist / genre granularity; manual-vs-aidj source split.
**Kill criterion:** if artist→artist support is too thin to clear the min-support bar for a meaningful
fraction of real seeds, **stop here** — the table would be mostly neutral and the feature is cosmetic.

**Phase 1 — Table + mining + scorer signal (blended path only).** Build §5–§7. Ship behind a feature
flag, weight starting low. Success = measurable lift in completion rate / drop in skip rate on AI-DJ
plays vs the flag-off baseline, without a diversity regression.

**Phase 2 (only if Phase 1 earns it).** Wire into `profile-recommendations.ts`; consider last-N context
(not just last-1); consider recency decay. Each is separately justified or dropped.

Anything beyond Phase 2 (embeddings, learned probabilities, session trajectory) is **out of scope for
this doc** and needs its own proposal.

## 8b. Phase 1 implementation plan (concrete)

**Guiding fact:** `src/lib/services/artist-cooccurrence.ts` is a near-exact template. It already reads
`listening_history` ordered by `playedAt`, slices into sessions (`splitIntoSessions`, **exported —
reuse it**), accumulates with recency decay, does an atomic delete+rewrite in a transaction, exposes
`__internal` for tests, and is wired into `calculateFullUserProfile`. Transitions are the **directed,
skip-aware** sibling of that **undirected** co-occurrence signal. We mirror the file; we do **not**
touch or replace co-occurrence (seeded-radio depends on it).

Six PR-sized steps, each independently reviewable. Steps 1–3 ship no behavior change (flag off).

### Step 1 — Schema + migration (no behavior)
New `src/lib/db/schema/track-transitions.schema.ts`:
```ts
export const trackTransitions = pgTable("track_transitions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  granularity: text("granularity", { enum: ["artist", "genre"] }).notNull(), // song-level dropped (Phase 0: 1.5%)
  fromKey: text("from_key").notNull(),   // lower(artist) | normalized genre
  toKey: text("to_key").notNull(),
  totalCount: integer("total_count").notNull().default(0), // RAW observed adjacencies → support gate
  posWeight: real("pos_weight").notNull().default(0),      // decayed, source-weighted positive mass
  negWeight: real("neg_weight").notNull().default(0),      // decayed negative (skips), source-agnostic
  lastObserved: timestamp("last_observed").notNull(),
  calculatedAt: timestamp("calculated_at").$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  uniq: unique("track_transitions_unique").on(t.userId, t.granularity, t.fromKey, t.toKey),
  fromIdx: index("track_transitions_user_gran_from_idx").on(t.userId, t.granularity, t.fromKey),
}));
```
- Add `export * from "./track-transitions.schema";` to `src/lib/db/schema/index.ts` (**required** per CLAUDE.md).
- `npm run db` (drizzle-kit generate) → `drizzle/0030_*.sql` (journal is at 0029).
- **Why split raw `totalCount` from decayed `pos/negWeight`:** the support gate must be on *raw*
  observation count (≥3 real adjacencies), while the *score* uses decayed mass so 2020 scrobbles don't
  outvote current taste. One column can't do both.

### Step 2 — `src/lib/services/transition-scoring.ts` + unit tests (no wiring)
Mirror `artist-cooccurrence.ts`. Differences from co-occurrence:
- **Adjacency, not all-pairs:** within each session emit consecutive ordered pairs `play[i] → play[i+1]`.
- **Directed:** store one direction only (no bidirectional expansion).
- **Two granularities per adjacency:** emit an `artist` pair and a `genre` pair (skip a granularity when
  either key is empty — note scrobbles have null genre, so genre edges come only from in-app plays).
- **Positive/negative split** on the *destination* B:
  - `srcWeightPos` = 1.0 for organic origin (scrobble/manual/radio/null), 0.25 for recommender
    (`ai_dj`/`autoplay`/etc. — reuse the origin classifier from `probe-transition-feasibility.ts`).
  - `decay = exp(-RATE * daysAgo(B.playedAt))`, `RATE` from `halfLifeDays` (default 120 ⇒ `ln2/120`).
  - if `B.skipDetected` ⇒ `negWeight += decay` (source-agnostic — skips are always real).
  - else if `B.completed` ⇒ `posWeight += decay * srcWeightPos`.
  - `totalCount += 1` always (raw gate).
- **`computeForUser(userId)`** reads the user's **full** history (not `daysBack` — we want the long tail;
  decay handles recency). Self-loops (`fromKey === toKey`) skipped. Atomic delete-by-user + batched insert
  in a transaction, exactly like co-occurrence.
- **`getTransitionScores(userId, seed, candidates): Promise<Map<songId, number>>`** — one indexed query
  (`userId`, `granularity IN ('artist','genre')`, `fromKey IN (lower(seed.artist), norm(seed.genre))`),
  then per candidate:
  1. artist edge `(artist, seedArtist → candArtist)` if `totalCount >= minSupport` → score,
  2. else genre edge `(genre, seedGenre → candGenre)` if `totalCount >= minSupport` → score,
  3. else **neutral 0.5**.
  Score = `clamp01( ((posWeight - negWeight) / (posWeight + negWeight + K)) * 0.5 + 0.5 )`, `K=2`
  (Laplace-ish: thin edges pull toward neutral, never to extremes).
- Export `__internal` (`accumulateTransitions`, constants) for tests, mirroring co-occurrence.
- Tests (`__tests__/transition-scoring.test.ts`, mirror `artist-cooccurrence.test.ts`): adjacency ordering;
  self-loop skip; gap boundary (via reused `splitIntoSessions`); source weighting (organic vs recommender
  positive; skip negative regardless of source); decay monotonicity; genre pass with null genre; scoring
  bounds; min-support gate → neutral; artist→genre backoff; absent → neutral.

### Step 3 — Wire mining into the existing cadence (flag-gated, still no user-visible change)
In `compound-scoring.ts::calculateFullUserProfile`, after the co-occurrence block:
```ts
let transitionRows = 0;
if (getFeatureFlags().transitionLearning.enabled) {
  try {
    const { computeForUser } = await import('./transition-scoring');
    transitionRows = await computeForUser(userId);
  } catch (e) { console.error('👤 [Profile] transition mining failed:', e); }
}
```
Add `transitionRows` to the returned object + the completion log line. No new scheduler — this rides the
existing `POST /api/profile/update` cadence (startup / 10+ plays / manual refresh).

### Step 4 — Scorer signal (flag-gated) in `blended-recommendation-scorer.ts`
- Add `transition` to `SCORE_WEIGHTS` at **0** by default so flag-off is a true no-op. When the flag is
  on, apply an override that keeps the sum at 1.0 by pulling from the two lowest-signal weights:
  `{ dj: 0.12, temporal: 0.03, transition: flag.weight /*0.10*/ }` (was dj 0.20 / temporal 0.05).
- Add `transitionScores: Map<string, number>` to `ScoringContext`. Populate it in
  `getBlendedRecommendations` (it has the candidate `songs` + seed) via `getTransitionScores`, passed into
  `buildScoringContext` — only when the flag is on; otherwise an empty map (→ neutral, weight 0).
- In `scoreCandidate`, add signal #8: `const transitionScore = context.transitionScores.get(song.id) ?? 0.5;`
  and `+ (transitionScore * weights.transition)` in `finalScore`. Extend the `scores` object, the
  `ScoredCandidate` type, and `calculateAverageScores`.
- **Phase 1 wires the blended path only** (NG-5). `profile-recommendations.ts` is untouched.

### Step 5 — Feature flag (`src/lib/config/features.ts`)
```ts
transitionLearning: {
  enabled: false,      // default OFF
  weight: 0.10,        // scorer weight when enabled
  minSupport: 3,       // raw totalCount gate (Phase 0: below this is noise)
  halfLifeDays: 120,   // recency decay half-life
}
```

### Step 6 — Enable, populate, observe (juan only)
Flip the flag for juan (localStorage/env), trigger one `POST /api/profile/update` to build the table,
then watch the metrics in §9. Kill switch = flip the flag back; the table can be left in place (inert).

**Effort:** ~1–1.5 days. **Biggest risk:** genre edges lean entirely on in-app plays (scrobbles have null
genre), so genre backoff is thinner than the Phase 0 genre numbers (which counted all rows) imply — treat
genre strictly as a weak floor, not a co-primary.

## 9. Validation

- **Offline:** hold out recent history, check whether transition score would have predicted
  completed-vs-skipped follows better than chance (AUC-ish, back-of-envelope is fine).
- **Online:** feature-flag A/B on skip rate + completion rate of AI-DJ-sourced plays. This is the
  metric that matters; interpretable weights make regressions diagnosable.
- **Guardrail:** watch `uniqueArtists` in blended metadata — transitions must not collapse diversity by
  always steering to the same "safe next artist."

## 10. Open questions (resolve before Phase 1, not now)

- Per-user only, or a shared global prior blended in for cold-start users? (Global raises the
  multi-user privacy/relevance question — default **per-user only** unless Phase 0 shows single-user
  data is hopeless.)
- Does organic Navidrome shuffle even reach `listening_history` with a distinguishable `source`, or
  does it land as `null`/`manual`? This determines whether §4.2's gold signal is actually capturable.
  **Verify in Phase 0.**
- Is last-1 adjacency enough, or is the "great run" quality really a property of longer windows?
  (Kept out of v1 deliberately; revisit only with evidence.)
