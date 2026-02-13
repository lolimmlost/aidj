# Epic 7 Story 7.5: Harmonic Mixing Suggestions (Pro)

## Status
Ready for Development

## Priority
Medium (Pro DJ feature)

## Story
As a professional DJ,
I want recommendations that consider BPM and musical key,
so that I can create seamless mixes with harmonic transitions.

## Acceptance Criteria

1. Extract and display BPM and key metadata from Navidrome tracks:
   - Read existing metadata if available
   - Display in song cards and player

2. Implement Camelot wheel compatibility scoring:
   - Same key = 100% (perfect match)
   - Adjacent keys on wheel = 85% (great match)
   - Relative major/minor = 75% (good match)
   - Compatible energy changes = 60%
   - Incompatible = 0-30% (warning)

3. Implement BPM compatibility scoring:
   - Within ±3% = 100% (seamless)
   - Within ±6% = 75% (pitch adjustment needed)
   - Within ±10% = 50% (noticeable change)
   - Beyond ±10% = 25% (significant tempo shift)

4. When generating recommendations, factor in:
   - Current/last played track's BPM and key
   - User's preferred BPM range tolerance
   - Harmonic mixing preference (strict/flexible/off)
   - Energy direction (maintain/increase/decrease)

5. Display compatibility indicators in recommendation UI:
   - BPM badge showing tempo and +/- from current
   - Key badge with Camelot notation (e.g., "8A")
   - Overall "mix score" (0-100)
   - Color coding: green (great) / yellow (ok) / red (clash)

6. Add sorting/filtering by mix compatibility:
   - Sort by best match
   - Filter by minimum score threshold
   - Filter by BPM range
   - Filter by key compatibility

7. Settings for harmonic mixing:
   - Enable/disable harmonic suggestions
   - Strictness level (strict/flexible/off)
   - BPM tolerance range
   - Preferred energy flow

## Tasks / Subtasks

### Harmonic Mixing Service
- [ ] Create `src/lib/services/harmonic-mixing.ts`
- [ ] Implement Camelot wheel data structure:
  ```typescript
  const CAMELOT_WHEEL = {
    '1A': { minor: 'Abm', adjacent: ['12A', '2A'], relative: '1B' },
    '1B': { major: 'B', adjacent: ['12B', '2B'], relative: '1A' },
    // ... all 24 keys
  };
  ```
- [ ] Implement `getKeyCompatibility(keyA, keyB): number`
- [ ] Implement `getBpmCompatibility(bpmA, bpmB): number`
- [ ] Implement `calculateMixScore(trackA, trackB): MixScore`
- [ ] Implement `getSuggestedKeys(currentKey): string[]`

### Metadata Extraction
- [ ] Check Navidrome API for BPM/key fields
- [ ] Parse ID3 tags for BPM (TBPM frame)
- [ ] Parse ID3 tags for key (TKEY frame)
- [ ] Create fallback for missing metadata
- [ ] Consider integration with audio analysis tools

### Recommendation Integration
- [ ] Update prompt builder to include harmonic context:
  ```
  Current track: 128 BPM, key of Am (8A Camelot)
  Suggest tracks that mix well harmonically.
  Prefer similar tempo (±5 BPM) and compatible keys.
  ```
- [ ] Add post-processing to score and sort by compatibility
- [ ] Filter out poor matches if strict mode enabled

### UI Components
- [ ] Create `BpmBadge` component
- [ ] Create `KeyBadge` component with Camelot notation
- [ ] Create `MixScoreBadge` component (0-100 with color)
- [ ] Create `HarmonicIndicator` for transition preview
- [ ] Add badges to recommendation cards
- [ ] Add badges to now playing display

### Filtering/Sorting
- [ ] Add mix score to recommendation data
- [ ] Implement sort by compatibility
- [ ] Add filter controls:
  - Min score slider
  - BPM range inputs
  - Key filter dropdown
- [ ] Save filter preferences

### Settings
- [ ] Add harmonic mixing section to settings
- [ ] Toggle: Enable harmonic suggestions
- [ ] Dropdown: Strictness (Strict / Flexible / Off)
- [ ] Slider: BPM tolerance (±1% to ±15%)
- [ ] Toggle: Show compatibility badges

### Testing
- [ ] Unit tests for Camelot wheel logic
- [ ] Unit tests for BPM compatibility
- [ ] Unit tests for mix score calculation
- [ ] Integration test with real track metadata
- [ ] E2E test: recommendations sorted by compatibility

## Camelot Wheel Reference

```
        MINOR KEYS              MAJOR KEYS
           (A)                     (B)

          12A                     12B
      11A     1A             11B     1B
    10A         2A         10B         2B
   9A           3A        9B           3B
    8A         4A          8B         4B
      7A     5A              7B     5B
          6A                     6B

Key Relationships:
- Adjacent (±1): Best harmonic mix
- Same number (A↔B): Relative major/minor
- Diagonal: Energy change
```

### Key Mapping

| Camelot | Key (Minor) | Key (Major) |
|---------|-------------|-------------|
| 1A/1B   | Ab minor    | B major     |
| 2A/2B   | Eb minor    | Gb major    |
| 3A/3B   | Bb minor    | Db major    |
| 4A/4B   | F minor     | Ab major    |
| 5A/5B   | C minor     | Eb major    |
| 6A/6B   | G minor     | Bb major    |
| 7A/7B   | D minor     | F major     |
| 8A/8B   | A minor     | C major     |
| 9A/9B   | E minor     | G major     |
| 10A/10B | B minor     | D major     |
| 11A/11B | Gb minor    | A major     |
| 12A/12B | Db minor    | E major     |

## UI Design

### Recommendation Card with Harmonic Info

```
┌─────────────────────────────────────────────────────────────┐
│  Dreams - Fleetwood Mac                                     │
│                                                              │
│  [120 BPM -3%] [8A Am] [Mix: 92]                           │
│       ↑           ↑         ↑                               │
│    green       green     green                              │
│                                                              │
│  "Similar vibe to current track, perfect key match"        │
│                                                              │
│  [In Library ✓]                           [Queue ▼]        │
└─────────────────────────────────────────────────────────────┘
```

### Compatibility Legend

```
Mix Score:
  90-100  🟢  Perfect mix
  70-89   🟡  Good mix
  50-69   🟠  Requires skill
  0-49    🔴  Challenging

BPM:
  ±3%     🟢  Seamless
  ±6%     🟡  Pitch adjust
  ±10%    🟠  Noticeable
  >10%    🔴  Big jump

Key:
  Same    🟢  Perfect
  ±1      🟢  Great
  Relative 🟡  Good
  Other   🔴  Clash
```

## Technical Notes

### Mix Score Algorithm

```typescript
interface MixScore {
  overall: number;      // 0-100
  bpm: number;          // 0-100
  key: number;          // 0-100
  energy?: number;      // 0-100 if available
  recommendation: 'perfect' | 'good' | 'challenging' | 'avoid';
}

function calculateMixScore(
  currentTrack: Track,
  candidateTrack: Track,
  settings: HarmonicSettings
): MixScore {
  const bpmScore = getBpmCompatibility(
    currentTrack.bpm,
    candidateTrack.bpm,
    settings.bpmTolerance
  );

  const keyScore = getKeyCompatibility(
    currentTrack.key,
    candidateTrack.key
  );

  // Weighted average (BPM slightly less important than key for DJs)
  const overall = (keyScore * 0.6) + (bpmScore * 0.4);

  return {
    overall: Math.round(overall),
    bpm: Math.round(bpmScore),
    key: Math.round(keyScore),
    recommendation: getRecommendation(overall),
  };
}
```

### Metadata Sources

| Source | How to Get |
|--------|------------|
| Navidrome | API may have bpm/key if extracted |
| ID3 Tags | TBPM, TKEY frames |
| MusicBrainz | Acoustic analysis data |
| Essentia | Open source audio analysis |
| KeyFinder | Open source key detection |
| Beets | Music tagger with analysis plugins |

## Dependencies

- Navidrome API for track metadata
- Track currently playing (audio store)
- User preferences for settings

## Future Enhancements

- Audio analysis integration for tracks without metadata
- Transition suggestions (e.g., "Mix at 2:45 outro")
- Key detection on upload
- BPM tap detection

## Dev Notes

### File Locations
- Service: `src/lib/services/harmonic-mixing.ts`
- Types: `src/lib/services/harmonic-mixing/types.ts`
- Components: `src/components/dj/harmonic/`
- Settings: Extend existing preferences store

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2024-11-30 | 1.0 | Initial draft | Claude |
