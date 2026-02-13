# Epic 7 Story 7.6: Set Builder (Pro)

## Status
Ready for Development

## Priority
Low (Advanced Pro DJ feature)

## Story
As a professional DJ,
I want to plan my sets with energy curves and structure,
so that I can prepare for gigs with intentional flow.

## Acceptance Criteria

1. Create Set Builder interface:
   - Timeline/track list view with visual energy curve
   - Drag-and-drop reordering
   - Add/remove tracks
   - Set duration tracker

2. Track energy visualization:
   - Energy level per track (1-10 scale)
   - Visual curve showing set progression
   - Smooth transitions indicator
   - Gap/clash warnings

3. Set templates:
   - Warm Up (30 min, energy 3→5)
   - Peak Time (60 min, energy 7→9)
   - Cool Down (30 min, energy 5→3)
   - Full Set (2+ hours with all phases)
   - Custom (user-defined duration and energy curve)

4. AI-assisted set generation:
   - "Fill my set" - AI populates tracks matching energy curve
   - "Suggest next" - AI recommends next track based on position
   - "Fix transitions" - AI identifies and fixes energy jumps
   - Respects harmonic mixing if enabled (Story 7.5)

5. Set metadata display:
   - Total duration (actual vs target)
   - Average BPM with range
   - Key distribution pie chart
   - Genre breakdown
   - Energy curve graph

6. Export options:
   - Save as Navidrome playlist
   - Export as M3U file
   - Export track list (PDF/CSV/text)
   - Copy to clipboard

7. Set history:
   - Save/load sets
   - Name and tag sets
   - Track when/where played
   - Clone existing sets

## Tasks / Subtasks

### Set Data Model
- [ ] Create `Set` interface:
  ```typescript
  interface DJSet {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    targetDuration: number; // minutes
    template?: SetTemplate;
    tracks: SetTrack[];
    tags: string[];
    notes?: string;
    playedAt?: PlayHistory[];
  }

  interface SetTrack {
    id: string;
    songId: string;
    position: number;
    energy: number; // 1-10
    transitionNote?: string;
  }

  interface SetTemplate {
    name: string;
    duration: number;
    energyCurve: number[]; // Array of target energies
  }
  ```
- [ ] Create set storage service (localStorage + optional DB)
- [ ] Implement CRUD operations for sets

### Set Builder UI
- [ ] Create `src/routes/dj/set-builder.tsx` page
- [ ] Create `SetBuilderCanvas` component:
  - Track list with drag handles
  - Energy curve overlay
  - Duration indicator
- [ ] Create `TrackRow` component:
  - Song info display
  - Energy slider (1-10)
  - BPM/Key badges
  - Remove button
  - Drag handle
- [ ] Create `EnergyCurve` visualization component
- [ ] Implement drag-and-drop with @dnd-kit

### Template System
- [ ] Create `SetTemplateSelector` component
- [ ] Define built-in templates:
  ```typescript
  const TEMPLATES = {
    warmUp: {
      name: 'Warm Up',
      duration: 30,
      energyCurve: [3, 3, 4, 4, 5, 5],
    },
    peakTime: {
      name: 'Peak Time',
      duration: 60,
      energyCurve: [7, 7, 8, 8, 9, 9, 9, 8, 8, 9, 9, 9],
    },
    coolDown: {
      name: 'Cool Down',
      duration: 30,
      energyCurve: [5, 5, 4, 4, 3, 3],
    },
    fullSet: {
      name: 'Full Set (2hr)',
      duration: 120,
      energyCurve: [3, 4, 5, 6, 7, 8, 9, 9, 8, 7, 6, 5, 4, 3],
    },
  };
  ```
- [ ] Template preview visualization
- [ ] Custom template builder

### AI Set Generation
- [ ] Implement `fillSet(template, libraryProfile)`:
  - Select tracks matching target energy
  - Consider BPM progression
  - Apply harmonic mixing if enabled
  - Fill duration requirement
- [ ] Implement `suggestNext(currentTrack, remainingDuration)`:
  - Based on energy target
  - Harmonic compatibility
  - Genre consistency
- [ ] Implement `analyzeTransitions(set)`:
  - Find energy jumps > 2
  - Find key clashes
  - Suggest fixes

### Set Metadata
- [ ] Create `SetStats` component showing:
  - Duration (actual/target)
  - Track count
  - Avg BPM ± range
  - Key distribution chart
  - Genre breakdown chart
- [ ] Create energy curve preview with actual vs target

### Export Features
- [ ] Export to Navidrome playlist
- [ ] Export as M3U file
- [ ] Export as PDF track list
- [ ] Export as CSV
- [ ] Copy to clipboard

### Set Management
- [ ] Create `SetLibrary` page/modal
- [ ] Save/load functionality
- [ ] Clone set
- [ ] Delete set
- [ ] Search/filter sets
- [ ] Add tags

### Testing
- [ ] Unit tests for set operations
- [ ] Unit tests for template logic
- [ ] Unit tests for AI fill algorithm
- [ ] E2E test: create set from template
- [ ] E2E test: drag-and-drop reordering
- [ ] E2E test: export set

## UI Design

### Set Builder Main View

```
┌─────────────────────────────────────────────────────────────┐
│  Set Builder                                    [Save] [⚙️] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Set Name: [My Friday Night Set_____________]               │
│                                                              │
│  Template: [Peak Time (60 min) ▼]  [Apply] [Custom...]     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Energy Curve                                                │
│  10│                    ████                                 │
│   9│                ████    ████                            │
│   8│            ████            ████                        │
│   7│        ████                    ████                    │
│   6│    ████                            ████                │
│   5│████                                    ████            │
│   4│                                            ████        │
│   3│                                                        │
│    └────────────────────────────────────────────────────    │
│     0min          30min          60min                       │
│                                                              │
│  ── Target Curve  ▬▬ Actual Curve                          │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Tracks                                [+ Add] [AI Fill]    │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ⋮⋮ 1. Intro Track - Artist          Energy: [████░░] │  │
│  │      120 BPM │ 8A │ 4:32              6/10    [✕]    │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ⋮⋮ 2. Building Up - Artist          Energy: [█████░] │  │
│  │      122 BPM │ 8A │ 5:15              7/10    [✕]    │  │
│  │      ⚠️ Energy jump > 2 from previous                 │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ⋮⋮ 3. Peak Banger - Artist          Energy: [██████] │  │
│  │      128 BPM │ 9A │ 6:00              9/10    [✕]    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  [+ Add Track...]                                           │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Stats                                                       │
│  Duration: 15:47 / 60:00    Tracks: 3    Avg BPM: 123       │
│  Keys: 8A (67%), 9A (33%)   Energy: 6 → 9 (building)        │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  [Preview Set] [Export ▼] [Clear] [AI: Suggest Next]       │
└─────────────────────────────────────────────────────────────┘
```

### Add Track Modal

```
┌─────────────────────────────────────────────────────────────┐
│  Add Track to Set                                    [✕]    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Search: [________________________] [🔍]                    │
│                                                              │
│  Filter by:  BPM [120] - [130]  Key: [Any ▼]               │
│              Energy: [7] - [9]  Genre: [House ▼]            │
│                                                              │
│  AI Suggestion: Based on position, try tracks with:         │
│  - Energy: 8-9                                               │
│  - BPM: 124-130                                              │
│  - Key: 8A, 9A, or 7A                                        │
│  [Auto-fill with AI suggestions]                            │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Results:                                                    │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Track Name - Artist                                   │  │
│  │ 126 BPM │ 8A │ 5:30 │ Energy: 8      [+ Add]         │  │
│  │ Mix Score: 95 🟢 Perfect match                        │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Another Track - Artist                                │  │
│  │ 128 BPM │ 9A │ 4:45 │ Energy: 9      [+ Add]         │  │
│  │ Mix Score: 87 🟢 Great match                          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Technical Notes

### Energy Level Guide

| Level | Description | Example Genres |
|-------|-------------|----------------|
| 1-2   | Ambient, very chill | Ambient, Downtempo |
| 3-4   | Relaxed, easy listening | Deep House, Lo-fi |
| 5-6   | Moderate energy | Tech House, Indie Dance |
| 7-8   | High energy | Progressive, Big Room |
| 9-10  | Peak energy, drops | Techno, DnB, Hardstyle |

### AI Fill Algorithm

```typescript
async function fillSet(
  template: SetTemplate,
  library: Song[],
  options: FillOptions
): Promise<SetTrack[]> {
  const tracks: SetTrack[] = [];
  let currentDuration = 0;
  let currentBpm: number | null = null;
  let currentKey: string | null = null;

  // Calculate target points from template curve
  const targetPoints = interpolateEnergyCurve(
    template.energyCurve,
    template.duration
  );

  while (currentDuration < template.duration) {
    // Get target energy for current position
    const targetEnergy = getEnergyAtPosition(targetPoints, currentDuration);

    // Find candidates matching criteria
    const candidates = library.filter(song =>
      isEnergyMatch(song.energy, targetEnergy, 1) &&
      !tracks.some(t => t.songId === song.id) &&
      (options.respectHarmonic
        ? isHarmonicMatch(song.key, currentKey)
        : true) &&
      (currentBpm
        ? isBpmMatch(song.bpm, currentBpm, options.bpmTolerance)
        : true)
    );

    // Score and select best candidate
    const scored = candidates.map(song => ({
      song,
      score: calculateFitScore(song, targetEnergy, currentBpm, currentKey),
    }));
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) break;

    const selected = scored[0].song;
    tracks.push({
      id: generateId(),
      songId: selected.id,
      position: tracks.length,
      energy: selected.energy || targetEnergy,
    });

    currentDuration += selected.duration / 60; // Convert to minutes
    currentBpm = selected.bpm;
    currentKey = selected.key;
  }

  return tracks;
}
```

## Dependencies

- Story 7.5 (Harmonic Mixing) - For key/BPM compatibility
- Navidrome playlist API - For export
- Audio store - For playback preview
- Drag-and-drop library (@dnd-kit recommended)

## Future Enhancements

- Live set recording (track what you actually played)
- Set sharing with other users
- Rekordbox/Serato export
- Sync with DJ software via Link
- Crowd energy feedback integration

## Dev Notes

### File Locations
- Page: `src/routes/dj/set-builder.tsx`
- Components: `src/components/dj/set-builder/`
- Service: `src/lib/services/set-builder.ts`
- Store: `src/lib/stores/sets.ts`

### Libraries to Consider
- @dnd-kit/core - Drag and drop
- recharts - Energy curve visualization
- jspdf - PDF export
- file-saver - File downloads

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2024-11-30 | 1.0 | Initial draft | Claude |
