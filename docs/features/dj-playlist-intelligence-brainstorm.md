# DJ-Style Playlist Intelligence - Brainstorm

> Saved: 2026-01-19
> Status: Planning / Future Feature

## Current State

Building blocks already in place:
- `MixCompatibilityBadges` component for harmonic mixing display
- BPM/key data available on some tracks
- AI DJ inserting recommendations periodically throughout queue

---

## Ideas for "DJ Mode" Toggle

### 1. BPM Flow Control
- **Gradual BPM progression** - don't jump from 120→160, ramp smoothly
- **BPM tolerance setting** - e.g., "stay within ±5 BPM of current"
- **Energy curve presets**:
  - Warm-up (slow build)
  - Peak Time (high energy plateau)
  - Cooldown (gradual descent)

### 2. Harmonic Mixing (Camelot Wheel)
- Only queue songs in compatible keys (same key, +1/-1 on wheel, relative major/minor)
- Visual indicator: green = perfect mix, yellow = workable, red = clash
- Option to prioritize harmonic compatibility vs variety

### 3. Energy/Mood Continuity
- Tag songs with energy levels (1-10) from audio analysis or manual
- Avoid jarring transitions (chill song → aggressive banger)
- "Vibe lock" - keep similar energy for X songs before allowing shifts

### 4. Smart Transition Points
- Consider song outros/intros - some songs mix better than others
- Track "mixability score" based on how songs end (fade out vs hard stop)

---

## Data Sources to Consider

| Source | What it provides |
|--------|------------------|
| **Navidrome metadata** | BPM, genre (if tagged) |
| **Last.fm** | Tags, similar tracks |
| **Audio analysis** (future) | Energy, danceability, key detection |
| **User feedback** | "These two songs mix well together" |

---

## UX Ideas

### Toggle Options
🎚️ **DJ Mode: OFF / Smooth / Strict**
- OFF = current behavior
- Smooth = soft preferences (prefer but don't require)
- Strict = hard rules (reject incompatible songs)

### Settings Panel
- BPM range slider (±3, ±5, ±10, Any)
- Harmonic mixing toggle
- Energy curve selector
- "Surprise me" randomness dial (0% = strict DJ rules, 100% = pure variety)

---

## Technical Approach

### Scoring System
Each candidate song gets a compatibility score:
```
score = (bpm_match * 0.3) + (key_match * 0.3) + (energy_match * 0.2) + (variety * 0.2)
```

### Filter vs Sort
Decide whether incompatible songs are:
- **Filtered out entirely** (strict mode)
- **Sorted lower but still possible** (smooth mode)

### Lookahead
When inserting at position N, consider what's at N-1 AND N+1 for smooth transitions both ways

---

## Open Questions

- Where does BPM/key data come from if not already tagged?
- Should this apply to AI DJ only, or also manual queue additions?
- How to handle songs with missing metadata? (skip them? use genre as proxy?)
- Should users be able to "force" a song even if it breaks the flow?

---

## Prerequisites

**Crossfades need to be working first** - the audio transition layer should be solid before adding intelligent track selection on top.

---

## Related Files
- `src/components/dj/mix-compatibility-badges.tsx`
- `src/lib/stores/audio.ts` (crossfade settings)
- `src/routes/dj/settings.tsx`
