# Crossfade: How Playback Decisions Are Made

The crossfade subsystem is not just "fade out, fade in." It drives most of the
hot-path playback decisions: when to advance to the next song, when to record a
play in listening history, when to scrobble, when to evict a song from the
queue, and when to suppress duplicate transitions. This document maps those
decisions to the files and refs that own them.

## Architecture

**Dual decks.** Two `HTMLAudioElement` instances, referenced as Deck A and
Deck B, routed through Web Audio `GainNode`s into a `masterGain`. Only one
deck is "active" at any time (`activeDeckRef: 'A' | 'B'`); the other preloads
the next song during a crossfade. Gain ramps are scheduled on the audio
thread (`scheduleGainRamp`) so they keep running when the JS thread is
throttled (backgrounded tab, GC pauses).

**Key files.**

| File | Role |
|---|---|
| `src/lib/hooks/useCrossfade.ts` | Owns `startCrossfade`, `abortCrossfade`, `completeCrossfade`. Talks to Web Audio graph. |
| `src/lib/hooks/useDeckEventHandlers.ts` | Listens to `timeupdate`/`ended`/`stalled`/`canplay` on both decks. Decides when to trigger `startCrossfade`. Owns onEnded scrobble/record path. |
| `src/lib/hooks/useSongLoader.ts` | Loads the current song into the active deck. Owns the 10s load timeout (`skipUnavailableSong`). |
| `src/components/layout/PlayerBar.tsx` | Host component. Creates the shared refs, wires the callbacks, owns `recordListeningHistory` and `handleNextSong`. |

## Shared refs (the state machine)

These refs cross hook boundaries — they *are* the contract between the
subsystems.

| Ref | Written by | Read by | Purpose |
|---|---|---|---|
| `crossfadeInProgressRef` | `useCrossfade` | `useCrossfade`, `useDeckEventHandlers`, `useStallRecovery`, `useSongLoader` | Gate. `true` means a crossfade is ramping — suppress onEnded, suppress new crossfade starts, suppress stall recovery. |
| `crossfadeAbortedAtRef` | `useCrossfade.abortCrossfade` (unconditionally, `useCrossfade.ts:127`) | `useDeckEventHandlers` timeupdate gate (10s cooldown, line 154) and onEnded gate (3s suppression, line 246) | Retry cooldown. Stamped on **every** abort so the timeupdate loop doesn't immediately re-enter `startCrossfade`. |
| `hasScrobbledRef` / `scrobbleThresholdReachedRef` | onEnded, onCrossfadeComplete, handleNextSong, onCrossfadeAbort+songHasEnded branch, useSongLoader cleanup | Same sites | Prevents double-scrobble for the same song across overlapping transition paths. |
| `currentSongIdRef` | `useSongLoader`, onCrossfadeComplete | All listening-history / scrobble sites | The outgoing song's ID, captured before the deck swaps. |
| `playbackSnapshotRef` | timeupdate (`useDeckEventHandlers.ts:125`) | onCrossfadeComplete, onCrossfadeAbort, handleNextSong | Last known `(currentTime, duration, songId)` for the outgoing song. Used when the active deck has already been reassigned to the next song. |

## Decision points

### 1. When to start a crossfade

Owner: `useDeckEventHandlers.ts:148-174` (timeupdate handler).

All of the following must hold:

- `xfadeDuration > 0` and `timeRemaining <= xfadeDuration` and `timeRemaining > 0.5`
- `!crossfadeInProgressRef.current`
- `Date.now() - crossfadeAbortedAtRef.current >= 10_000` (retry cooldown)
- `repeatMode !== 'one'`
- Not the last song, unless `repeatMode === 'all'` or shuffle is on
- `playlist.length > 1`

If all pass, `startCrossfade(nextSongData, xfadeDuration)` is called. Note that
`timeRemaining` uses `effectiveDuration` — the audio element's `duration` when
finite, else the store's metadata duration (for transcoded/chunked streams
where `duration === Infinity`).

### 2. When to abort a crossfade

Owner: `useCrossfade.ts:122-158` (`abortCrossfade`).

Triggers:

- **10s `canplaythrough` timeout** (line 286-300) — inactive deck never reached
  readyState >= 2. At the deadline the fallback accepts `readyState >= 3`
  cleanly and `readyState >= 2` with a warning (plays anyway, may stutter
  briefly as data buffers). Only `readyState < 2` aborts with reason
  containing `timeout`.
- **`play()` rejection** (line 203-206) — typically autoplay policy blocking a
  backgrounded tab. Reason: `play() failed - likely autoplay blocked`.
- **User pause during ramp** (line 181-188) — store subscription sees
  `isPlaying` flip false.
- **Safety timeout** after `xfadeDuration + 10s` (line 302-314) if the inactive
  deck isn't playing and past 1s. Must exceed the 10s canplaythrough window so
  the two don't race.
- **Completion-time check** (line 197-200) — inactive deck was expected to be
  playing but stopped mid-ramp.

Every abort does the following **in order**:

1. Stamp `crossfadeAbortedAtRef.current = Date.now()` — unconditionally. This
   is the single most important invariant in the subsystem; without it the
   timeupdate loop re-enters `startCrossfade` dozens of times per second.
2. Restore gains (active=1.0, inactive=0) and cancel any scheduled ramps.
3. Pause and clear `src` on the inactive deck.
4. Classify: `isLoadFailure = reason.includes('timeout') || reason.includes('never became ready')`.
5. Check `songHasEnded` on the active deck (`currentTime >= duration - 0.5` or `ended`).
6. Fire `onCrossfadeAbort(nextSongData, isLoadFailure)` **only if**
   `isLoadFailure || songHasEnded`. Otherwise the callback is silent — the
   song is still playing, we'll try again on the next natural end.

### 3. When to record listening history and scrobble

Four paths converge on `recordListeningHistory` + `scrobbleSong(id, true)` for
the **outgoing** song. They are mutually exclusive via
`hasScrobbledRef` / crossfade gates.

| Path | File / Line | Trigger |
|---|---|---|
| Natural end (no crossfade) | `useDeckEventHandlers.ts:251-262` (onEnded) | `ended` event fires and neither `crossfadeInProgressRef` nor the 3s abort window apply. |
| Crossfade completed | `PlayerBar.tsx:257-286` (`onCrossfadeComplete`) | Ramp finished, new deck swapped in. |
| Crossfade aborted but old song ended | `PlayerBar.tsx:307-326` (`onCrossfadeAbort` + `songHasEnded`) | Load timeout or play() reject landed right as the current song ran out. Without this branch the scrobble is lost, because the onEnded 3s suppression will swallow it. |
| Manual skip (Next button) | `PlayerBar.tsx:212-233` (`handleNextSong`) | User pressed Next. Records with `userInitiatedSkip=true`. |

Known gap (not yet fixed, flagged earlier in session):
`useSongLoader.ts:325-330` cleanup path scrobbles Navidrome when the
`scrobbleThresholdReached` flag is set, but does **not** call
`recordListeningHistory`. A song that unmounts without any of the four paths
above firing won't land in our DB even though Navidrome records it.

### 4. When to remove a song from the queue

Owner: `PlayerBar.tsx:297-305` (`onCrossfadeAbort`).

Gated on `isLoadFailure` only. The subtlety: before this gate existed, *any*
crossfade abort — including `play()` rejections caused by autoplay policy —
would evict the next song and toast "unavailable." That evicted playable
songs during background playback. Now:

- Load timeout / never-ready → evict + toast "Skipped X — unavailable".
- Autoplay reject / user pause / safety timeout → leave in queue; let
  `useSongLoader`'s own 10s load timeout handle genuinely broken files.

### 5. When to advance (nextSong)

Called from:

- `useDeckEventHandlers.ts:298` — after onEnded, once scrobble/record are done.
- `useDeckEventHandlers.ts:179-183` — `[INFINITY]` safety net for
  chunked/transcoded streams that never fire `ended`. Advances without
  recording history. (Known gap — rare since we switched to `format=raw` in
  the stream proxy, which preserves Content-Length.)
- `PlayerBar.tsx:285` (`onCrossfadeComplete`) — after the old deck's play has
  been recorded.
- `PlayerBar.tsx:330` (`onCrossfadeAbort` + `songHasEnded`) — same reasoning,
  on the abort path.
- `handleNextSong` — user pressed Next.

## Suppression windows

Two short windows are critical for not double-counting plays:

**3s onEnded suppression after any abort** (`useDeckEventHandlers.ts:246-249`).
When `abortCrossfade` fires at the tail of a song, the onEnded event follows
within ~200ms for the old deck. Without this gate the play would be scrobbled
twice: once by the abort+songHasEnded branch and once by onEnded.

**10s timeupdate cooldown after any abort** (`useDeckEventHandlers.ts:154`).
Prevents the timeupdate handler — which fires every ~250ms — from
immediately re-calling `startCrossfade` the moment an abort returns control.
Without this, autoplay-blocked aborts retry until the song ends, each retry
doing a full deck teardown.

## Interaction diagram (happy path + main failure mode)

```
timeupdate on active deck
    │
    ├─ timeRemaining <= xfadeDuration && !inProgress && !cooldown
    │     └─► startCrossfade
    │           ├─ inactive.src = next.url; inactive.load()
    │           ├─ wait canplaythrough (5s timeout)
    │           ├─ inactive.play()
    │           │     ├─ resolved → schedule gain ramps → completeCrossfade
    │           │     │                                      └─► onCrossfadeComplete
    │           │     │                                            └─► scrobble + record + nextSong
    │           │     └─ rejected → abortCrossfade('play() failed…')
    │           │                       ├─ stamp crossfadeAbortedAtRef
    │           │                       ├─ restore gains, pause inactive deck
    │           │                       └─ onCrossfadeAbort(song, isLoadFailure=false)
    │           │                             ├─ songHasEnded? scrobble+record+nextSong
    │           │                             └─ else: do nothing — song still playing
    │           └─ canplaythrough never fires → abortCrossfade('timeout…')
    │                 └─ onCrossfadeAbort(song, isLoadFailure=true)
    │                       ├─ evict from queue + toast
    │                       └─ songHasEnded? scrobble+record+nextSong
    │
    └─ ended (active deck)
          ├─ crossfadeInProgressRef? skip (crossfade owns this transition)
          ├─ within 3s of abort? skip (abort owns this transition)
          └─ else: scrobble + record + nextSong
```

## Invariants

- `abortCrossfade` stamps `crossfadeAbortedAtRef` **before** any other work,
  unconditionally.
- Queue eviction is gated on `isLoadFailure` and `isLoadFailure` alone.
- Exactly one of (onEnded, onCrossfadeComplete, onCrossfadeAbort+songHasEnded,
  handleNextSong) records a play per song — enforced by `hasScrobbledRef`
  plus the 3s onEnded suppression after aborts.
- `playbackSnapshotRef` is the authoritative `(currentTime, duration)` for
  the outgoing song. Never read `activeDeck.currentTime` directly in a
  transition path — on rapid skips the deck may already hold the next song.
- `currentSongIdRef` is updated inside `onCrossfadeComplete` *after* the
  outgoing song is scrobbled/recorded and *before* `nextSong()` runs.
