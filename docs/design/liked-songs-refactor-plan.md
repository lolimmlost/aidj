# Liked Songs / Stars Reconciliation — Refactor Plan

**Status:** proposed
**Author:** investigation 2026-08-13 (Juan + Claude)
**Related:** PR #133 (missing-file ghost stars), issue #130, #124 (dup liked playlists)

## Problem

Songs removed from Liked Songs reappear; unstars don't stick; feedback and likes
are entangled. Root causes were reproduced live against prod on 2026-08-13.

### Confirmed findings (evidence)

1. **"Remove from playlist" ≠ unstar.**
   `DELETE /api/playlists/$id/songs/$songId` (`src/routes/api/playlists/$id/songs/$songId.ts`)
   deletes only the `playlist_songs` row. The song stays starred in Navidrome.
   - *Test:* removed 6 from ❤️ Liked Songs (369→363), hit Sync →
     `Rebuilt Liked Songs playlist: 369 songs` → all 6 returned.

2. **The Liked Songs playlist is a full clear-and-reinsert MIRROR of Navidrome
   stars, rebuilt from 4+ triggers with no single owner:**
   - `rebuildLikedSongsPlaylist()` in `src/lib/services/liked-songs-sync.ts`
   - an **inline duplicate** rebuild in `src/routes/api/recommendations/feedback.ts` (~L235)
   - `POST /api/playlists/sync`
   - `POST /api/playlists/liked-songs/sync`
   - partial single-row delete in `DELETE /api/navidrome/star`
   Any rebuild re-adds every currently-starred song, so removals can't win.

3. **Feedback IS merged with stars/likes.**
   `feedback.ts`: `thumbs_up → starSong`, `thumbs_down → unstarSong`, then rebuild.
   A thumbs-up on a recommendation stars the song and adds it to Liked Songs.
   *Data:* feedback `thumbs_up` = 470 vs real stars = 363.

4. **Duplicate/fragile playlist selection.**
   Two mirror playlists hold the identical star set:
   - `❤️ Liked Songs` (app, `navidromeId=null`, id `8fbb6f16…`)
   - `Loved Songs` (Navidrome-backed, `navidromeId=99x5…`, id `4c2fcfb1…`)
   All selection uses `name ILIKE '%liked%' ORDER BY updatedAt DESC LIMIT 1` —
   non-deterministic and name-dependent.

5. **Missing-file ghost stars** (separate, PR #133): the pre-fix native starred
   fetch returned deleted-file "ghosts" that got re-merged. Fixed by `missing=false`.

### Design principle

**Navidrome stars are the single source of truth.** `liked_songs_sync`,
`recommendation_feedback (source='library')`, and the Liked Songs `playlist_songs`
are all *derived caches* of the star set. Every mutation must keep them in lockstep,
and there must be exactly one code path that rebuilds the cache.

---

## Plan (staged)

### PR #133 — missing-file ghost stars (already open)
Land first. `getStarredSongs` → native `missing=false`; reconciliation re-star/unstar.

### PR A — "Remove from Liked Songs = unstar" + single rebuild owner (quick, high value)

Goal: removals stick; kill the copy-pasted rebuild.

1. **Remove = unstar for the Liked Songs playlist.**
   In the playlist view (`src/routes/playlists/$id.tsx`), when `isLikedSongsPlaylist`,
   route the row "remove" action through the star write-through
   (`DELETE /api/navidrome/star?id=`) instead of `removeSongMutation`.
   Alternatively (server-side, more robust): have
   `DELETE /api/playlists/$id/songs/$songId` detect the Liked Songs playlist and
   delegate to the unstar write-through.
2. **One rebuild function.** Delete the inline rebuild in `feedback.ts` and call the
   shared `rebuildLikedSongsPlaylist()` from `liked-songs-sync.ts`.
3. **Extract a single `setSongLiked(userId, songId, liked, creds)` service** that does,
   in one place: Navidrome (un)star → upsert/delete `recommendation_feedback`
   (source='library') → set `liked_songs_sync.is_active` → add/remove `playlist_songs`
   row → fix `song_count`. Point `star.ts` POST/DELETE and feedback's star path at it.

**Acceptance:** unstar (heart) and remove (row) both drop the song from Navidrome +
all caches; a subsequent Sync/rebuild does NOT bring it back.

### PR B — deterministic playlist selection + de-dup (medium)

Goal: exactly one canonical Liked Songs playlist, selected by a stable key.

1. Add a stable marker to `user_playlists` — e.g. `kind` enum
   (`'liked' | 'user' | 'smart' | 'navidrome'`) or a boolean `is_liked_songs`.
   Backfill the canonical `❤️ Liked Songs` row.
2. Replace every `name ILIKE '%liked%' ORDER BY updatedAt DESC LIMIT 1` with a lookup
   by that marker (in `liked-songs-sync.ts`, `star.ts`, `feedback.ts`, `$id.ts`).
3. Resolve the `Loved Songs` (Navidrome-backed) vs `❤️ Liked Songs` duplication:
   decide the canonical one, stop double-mirroring, migrate/rename the other.
4. Make the `'liked-songs'` route alias resolve to the marked row explicitly.

**Acceptance:** all liked operations target the same row regardless of names; no
second auto-mirrored playlist.

### PR C — decouple feedback from stars (design decision needed)

Options:
- **(recommended) Decouple:** `thumbs_up/down` = recommendation signal only; star/like
  = library action only. Stop `starSong`/`unstarSong` inside the feedback endpoint.
  Liked Songs is driven purely by stars.
- **Keep linked but explicit:** if a thumbs-up should still like the song, make it an
  intentional, documented one-way effect through `setSongLiked()` (not a full rebuild),
  and surface it in the UI.

**Acceptance:** thumbs feedback no longer silently rebuilds/repopulates Liked Songs;
`thumbs_up` count reconciles with real stars (modulo intentional manual thumbs).

### PR D — reconcile-on-refresh backstop (small)

Out-of-band changes (unstarring in the Navidrome client) still need a catch-up.
On opening Liked Songs, trigger the single rebuild owner so the view self-heals from
stars. Also fixes the "unstar in Navidrome client doesn't reflect" lag.

### Also: library-reconciliation not running

The 6-hourly reconciliation job has **zero logs** on prod — it never initializes.
This is what remaps metube→Picard duplicate IDs (the "two rows per track" trap, e.g.
"Odee"). Track separately: find why `initializeReconciliation` isn't called on boot.

---

## Risks / testing

- Touches prod-facing star/like flows — cover `setSongLiked()` with unit tests
  (star, unstar, idempotency, dup-id no-op) and one e2e (remove from Liked Songs → stays gone).
- DB marker migration must re-export from `src/lib/db/schema/index.ts` and be applied
  manually on deploy (migrations don't auto-run — see CLAUDE.md).
- Verify cross-device sync unaffected (heart state flows through feedback cache).
