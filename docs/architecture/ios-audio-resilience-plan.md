# iOS Audio Resilience - Comprehensive Plan

> **Status:** Planning
> **Created:** 2026-01-27
> **Context:** Dual-deck crossfade system with iOS Safari background playback

## Research Summary

### Industry State of Affairs

iOS Safari HTML5 audio is notoriously unreliable. Even popular libraries like [howler.js](https://github.com/goldfire/howler.js/issues/1753) struggle with:
- Audio not playing after returning from background
- Random playback stops ([Issue #862](https://github.com/goldfire/howler.js/issues/862))
- iOS 15+ blocking Web Audio API in background ([Issue #1525](https://github.com/goldfire/howler.js/issues/1525))
- Live streams buffering forever on iOS 17.4 ([Issue #1711](https://github.com/goldfire/howler.js/issues/1711))

### Key Patterns from Research

| Pattern | Source | Implementation |
|---------|--------|----------------|
| **AudioContext state check** | howler.js #1753 | Check for `"suspended"` or `"interrupted"` before play |
| **User interaction warm-up** | [GitHub Gist](https://gist.github.com/kus/3f01d60569eeadefe3a1) | Prime audio on first user gesture |
| **Stalled event → load()** | [Apple Community](https://discussions.apple.com/thread/6838273) | Force reload on stall, but beware false positives |
| **Buffer monitoring** | [Mediabuffer](https://github.com/krisnoble/Mediabuffer) | Track buffered vs currentTime ratio |

### What We Already Have

| Feature | Status | Notes |
|---------|--------|-------|
| Dual-deck crossfade | ✅ | With abort fallback |
| Mobile deck priming | ✅ | Silent audio on first play |
| Visibility recovery | ✅ | Stall detection + resume |
| Media Session debounce | ✅ | Bluetooth glitch protection |
| isPlaying sync defense | ✅ | Won't pause playing audio |
| Buffer stall detection | ✅ | On visibility change only |

---

## Gap Analysis

### Critical Gaps

#### 1. No Real-Time Stall Detection
**Problem:** Buffer stall detection only runs on visibility change. If user is actively using the app and audio stalls mid-playback, there's no recovery.

**Evidence:** Logs showed `time=77.4` frozen while `buffered=77.3` - playback stalled but no recovery attempted until user switched away and back.

**Solution:** Implement a stall watchdog that monitors `currentTime` progress.

#### 2. No `stalled` Event Handling
**Problem:** HTML5 audio fires `stalled` when buffering fails (~3 seconds no data). We don't handle it.

**Caveat:** Safari fires `stalled` spuriously during normal playback. Need to filter false positives.

**Solution:** Handle `stalled` event with debouncing and validation.

#### 3. No AudioContext State Recovery
**Problem:** iOS can suspend the AudioContext when backgrounded. We don't check/resume it.

**Evidence:** howler.js recommends checking `Howler.ctx.state === "suspended"` before play.

**Solution:** Check AudioContext state on visibility change and before play attempts.

### Medium Priority Gaps

#### 4. Both Decks Have Progress Edge Case
**Problem:** If both decks have `currentTime > 0` after failed crossfade cleanup, activeDeckRef correction might pick wrong one.

**Solution:** Use most recent activity timestamp or highest currentTime as tiebreaker.

#### 5. Network Recovery
**Problem:** When network goes offline→online, no automatic recovery for stalled playback.

**Solution:** Listen for `online` event and attempt recovery if audio was playing.

### Low Priority Gaps

#### 6. Duration = Infinity Handling
**Problem:** Streaming audio shows `Infinity` duration. Crossfade timing based on `duration - currentTime` won't work.

**Solution:** Skip crossfade for infinite duration streams, or use time-based heuristics.

---

## Implementation Plan

### Phase 1: Stall Watchdog (High Priority)

Add a real-time stall detector that monitors playback progress.

```typescript
// Stall watchdog state
const lastProgressTimeRef = useRef<number>(0);
const lastProgressValueRef = useRef<number>(0);
const stallCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

// In a useEffect:
const STALL_THRESHOLD_MS = 5000; // 5 seconds no progress = stall
const CHECK_INTERVAL_MS = 2000;  // Check every 2 seconds

stallCheckIntervalRef.current = setInterval(() => {
  const audio = getActiveDeck();
  if (!audio || audio.paused || !useAudioStore.getState().isPlaying) return;

  const now = Date.now();
  const currentProgress = audio.currentTime;

  // Check if time has advanced
  if (currentProgress > lastProgressValueRef.current + 0.5) {
    // Progress made - reset watchdog
    lastProgressTimeRef.current = now;
    lastProgressValueRef.current = currentProgress;
  } else if (now - lastProgressTimeRef.current > STALL_THRESHOLD_MS) {
    // Stalled! Attempt recovery
    console.log('🚨 [STALL WATCHDOG] Playback stalled - attempting recovery');
    attemptStallRecovery(audio);
    lastProgressTimeRef.current = now; // Reset to prevent rapid retries
  }
}, CHECK_INTERVAL_MS);
```

**Recovery Strategy:**
1. First attempt: `audio.play()` - kicks browser to continue buffering
2. Second attempt: Seek back 2-5 seconds and play
3. Third attempt: `audio.load()` then seek to position and play
4. Final fallback: Skip to next song

### Phase 2: Stalled Event Handler (Medium Priority)

Handle the HTML5 `stalled` event with false-positive filtering.

```typescript
const stalledCountRef = useRef<number>(0);
const lastStalledTimeRef = useRef<number>(0);

const handleStalled = (e: Event) => {
  const deck = e.target as HTMLAudioElement;
  if (deck !== getActiveDeck()) return; // Ignore inactive deck

  const now = Date.now();

  // Filter false positives: Safari fires stalled during normal load
  // Only act if we were playing and time hasn't advanced
  if (deck.paused) return;
  if (deck.currentTime < 1) return; // Still loading initial data

  // Debounce: don't fire repeatedly
  if (now - lastStalledTimeRef.current < 10000) return;
  lastStalledTimeRef.current = now;

  console.log('🔴 [STALLED EVENT] Browser reports stall');

  // Check if we're actually stalled (buffered <= currentTime)
  const bufferedEnd = deck.buffered.length > 0
    ? deck.buffered.end(deck.buffered.length - 1)
    : 0;

  if (deck.currentTime >= bufferedEnd - 1) {
    // Genuine stall - attempt recovery
    attemptStallRecovery(deck);
  }
};
```

### Phase 3: AudioContext State Check (Medium Priority)

Check and resume AudioContext on visibility change and play attempts.

```typescript
const checkAndResumeAudioContext = async () => {
  // Get the AudioContext (create if needed for analysis)
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

  if (audioContext.state === 'suspended' || audioContext.state === 'interrupted') {
    console.log(`🔊 [AUDIO CONTEXT] State is ${audioContext.state} - resuming`);
    try {
      await audioContext.resume();
      console.log('🔊 [AUDIO CONTEXT] Resumed successfully');
      return true;
    } catch (err) {
      console.error('🔊 [AUDIO CONTEXT] Resume failed:', err);
      return false;
    }
  }
  return true;
};

// Call before play attempts:
const safePlay = async (audio: HTMLAudioElement) => {
  await checkAndResumeAudioContext();
  return audio.play();
};
```

### Phase 4: Network Recovery (Low Priority)

Listen for network restoration and recover stalled playback.

```typescript
useEffect(() => {
  const handleOnline = () => {
    console.log('🌐 [NETWORK] Back online');

    const audio = getActiveDeck();
    const storeIsPlaying = useAudioStore.getState().isPlaying;

    if (audio && storeIsPlaying && audio.paused) {
      console.log('🌐 [NETWORK] Attempting to resume playback after reconnect');
      audio.play().catch(err => {
        console.log('🌐 [NETWORK] Resume failed:', err.message);
      });
    }
  };

  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}, [getActiveDeck]);
```

### Phase 5: Edge Case Hardening (Low Priority)

#### Both Decks Have Progress
```typescript
// In activeDeckRef correction logic:
if (deckAHasProgress && deckBHasProgress) {
  // Both have progress - use the one with higher currentTime (more recent)
  const correctDeck = deckA.currentTime > deckB.currentTime ? 'A' : 'B';
  if (activeDeckRef.current !== correctDeck) {
    console.log(`🎮 [STORE] Both decks have progress - using ${correctDeck} (higher currentTime)`);
    activeDeckRef.current = correctDeck;
  }
}
```

#### Infinite Duration Handling
```typescript
// In crossfade trigger logic:
if (!isFinite(deck.duration)) {
  console.log('[XFADE] Skipping crossfade - infinite duration (live stream)');
  return; // Don't attempt crossfade for live streams
}
```

---

## Recovery Function

Centralized stall recovery with escalating strategies:

```typescript
const recoveryAttemptRef = useRef<number>(0);
const MAX_RECOVERY_ATTEMPTS = 3;

const attemptStallRecovery = async (audio: HTMLAudioElement) => {
  const attempt = ++recoveryAttemptRef.current;
  const savedTime = audio.currentTime;

  console.log(`🔧 [RECOVERY] Attempt ${attempt}/${MAX_RECOVERY_ATTEMPTS} at ${savedTime.toFixed(1)}s`);

  if (attempt > MAX_RECOVERY_ATTEMPTS) {
    console.log('🔧 [RECOVERY] Max attempts reached - skipping to next song');
    recoveryAttemptRef.current = 0;
    nextSong();
    return;
  }

  // Check AudioContext first
  await checkAndResumeAudioContext();

  try {
    if (attempt === 1) {
      // Attempt 1: Simple play() to kick buffering
      await audio.play();
      console.log('🔧 [RECOVERY] Attempt 1 succeeded (play())');
    } else if (attempt === 2) {
      // Attempt 2: Seek back and play
      const seekTarget = Math.max(0, savedTime - 3);
      audio.currentTime = seekTarget;
      await audio.play();
      console.log(`🔧 [RECOVERY] Attempt 2 succeeded (seek to ${seekTarget.toFixed(1)}s)`);
    } else {
      // Attempt 3: Full reload
      const src = audio.src;
      audio.src = '';
      audio.src = src;
      audio.currentTime = Math.max(0, savedTime - 5);
      await audio.play();
      console.log('🔧 [RECOVERY] Attempt 3 succeeded (reload)');
    }

    // Success - reset counter after brief delay
    setTimeout(() => {
      recoveryAttemptRef.current = 0;
    }, 5000);

  } catch (err) {
    console.log(`🔧 [RECOVERY] Attempt ${attempt} failed:`, (err as Error).message);
    // Will retry on next watchdog check
  }
};
```

---

## Testing Checklist

### Stall Scenarios to Test
- [ ] Buffer underrun mid-playback (slow network simulation)
- [ ] Return from background after long idle
- [ ] Bluetooth disconnect/reconnect during playback
- [ ] Network offline→online during playback
- [ ] Lock screen for extended period
- [ ] Switch to different app and back
- [ ] Crossfade during low buffer condition

### Recovery Verification
- [ ] Watchdog detects stall within 5 seconds
- [ ] Recovery attempts escalate correctly
- [ ] Max attempts triggers skip to next song
- [ ] No false positives during normal playback
- [ ] No recovery loops (rapid retry prevention)

---

## Implementation Priority

| Phase | Priority | Effort | Impact |
|-------|----------|--------|--------|
| Phase 1: Stall Watchdog | High | Medium | High |
| Phase 2: Stalled Event | Medium | Low | Medium |
| Phase 3: AudioContext | Medium | Low | Medium |
| Phase 4: Network Recovery | Low | Low | Low |
| Phase 5: Edge Cases | Low | Low | Low |

**Recommended Order:** Phase 1 → Phase 3 → Phase 2 → Phase 4 → Phase 5

---

## Related Documents

- [AI DJ Mode Hybrid Plan](./ai-dj-mode-hybrid-plan.md)
- [Profile-Based Recommendations](./.claude/plans/glowing-churning-naur.md)

## Sources

- [howler.js Issue #1753 - Background Audio Recovery](https://github.com/goldfire/howler.js/issues/1753)
- [howler.js Issue #862 - Random Audio Stops](https://github.com/goldfire/howler.js/issues/862)
- [howler.js Issue #1525 - iOS 15 Background Blocking](https://github.com/goldfire/howler.js/issues/1525)
- [MDN - HTMLMediaElement stalled event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/stalled_event)
- [Apple Community - Safari Audio Stalls](https://discussions.apple.com/thread/6838273)
- [Mediabuffer - Buffer Management](https://github.com/krisnoble/Mediabuffer)
- [iOS AudioContext Fix Gist](https://gist.github.com/kus/3f01d60569eeadefe3a1)
