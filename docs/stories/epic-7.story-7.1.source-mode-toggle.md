# Epic 7 Story 7.1: Source Mode Toggle

## Status
Done

## Priority
High (Foundation for all discovery features)

## Story
As a user,
I want to control whether recommendations come from my library, external sources, or a mix,
so that I can choose between reliable playback and music discovery.

## Acceptance Criteria

1. Add source mode selector to playlist generator UI with three options:
   - Library Only (default) - only songs in Navidrome
   - Discovery - only songs NOT in library
   - Mix - configurable ratio (default 70% library / 30% discovery)

2. Update recommendation/playlist API to accept `sourceMode` parameter

3. For "Library Only" mode:
   - Only return songs that exist in Navidrome
   - Filter out any recommendations not found in library
   - Show "Queue" action buttons

4. For "Discovery" mode:
   - Return songs NOT in library
   - Include metadata for Lidarr lookup (artist, album, track)
   - Show "Download" button instead of "Queue" button
   - Requires Last.fm integration (Story 7.2) for full functionality

5. For "Mix" mode:
   - Return configurable ratio of library/discovery songs
   - Clearly label each recommendation's source (badge/icon)
   - Show appropriate action buttons per song

6. Persist user's preferred source mode in preferences store

7. Update AI prompt to respect source mode constraints:
   - Library Only: "Only suggest songs from my library"
   - Discovery: "Suggest songs I don't have that match my taste"
   - Mix: "Suggest a mix of songs from my library and new discoveries"

## Tasks / Subtasks

### Backend
- [x] Add `sourceMode` to `PlaylistRequest` interface (`src/routes/api/playlist.ts`)
  - Type: `'library' | 'discovery' | 'mix'`
  - Default: `'library'`
- [x] Add `mixRatio` optional parameter for mix mode (default: 0.7)
- [x] Update playlist API to include source mode logic
- [x] Update playlist API endpoint to accept and pass source mode
- [x] Add source filtering logic after recommendation generation:
  - Library: uses mood-based recommendations from smart playlist
  - Discovery: uses Last.fm genre-first discovery
  - Mix: interleaves library and discovery songs

### Frontend
- [x] Create `SourceModeSelector` component (`src/components/playlist/source-mode-selector.tsx`)
  - Three buttons/tabs: Library | Discovery | Mix
  - Optional slider for mix ratio when Mix is selected
- [x] Add selector to dashboard playlist generator section
- [ ] Add selector to `/dj/playlist-generator` page (when activated) - page is placeholder
- [x] Update recommendation cards to show source badge (`SourceBadge` component)
- [x] Conditional action buttons based on source
- [x] Loading states per mode

### Preferences
- [x] Add `defaultSourceMode` to preferences schema
- [x] Add `mixRatio` to preferences schema
- [x] Persist selection to preferences store
- [x] Load default on component mount

### Testing
- [ ] Unit test: prompt generation for each source mode
- [ ] Unit test: filtering logic for each mode
- [ ] Unit test: mix ratio calculation
- [ ] Integration test: API with source mode parameter
- [ ] E2E test: user selects each mode and sees appropriate results

## UI Design

```
┌─────────────────────────────────────────────────────────────┐
│  Generate Playlist                                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Source:  [Library Only]  [Discovery]  [Mix]                │
│            ^^^selected^^^                                    │
│                                                              │
│  ┌─ Mix Ratio (only shown when Mix selected) ─────────────┐ │
│  │  Library ━━━━━━━━━━━━━━━━━━━○━━━━━━━━ Discovery         │ │
│  │                           70%                            │ │
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  Style: [_______________________________] [Generate]         │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Results:

┌─────────────────────────────────────────────────────────────┐
│  1. Song A - Artist A                                       │
│     [In Library] ✓                          [Queue ▼]       │
├─────────────────────────────────────────────────────────────┤
│  2. Song B - Artist B                                       │
│     [Discovery] ★                           [Download]      │
├─────────────────────────────────────────────────────────────┤
│  3. Song C - Artist C                                       │
│     [In Library] ✓                          [Queue ▼]       │
└─────────────────────────────────────────────────────────────┘
```

## Technical Notes

### Prompt Modifications

**Library Only:**
```
Generate a playlist using ONLY songs from my library.
My library contains: [artist list], [song sample]
Do NOT suggest any songs that are not in this list.
```

**Discovery:**
```
Suggest songs I likely don't have but would enjoy.
Based on my library (artists: [list]), recommend similar artists
and tracks that match my taste but are NOT in my collection.
Focus on variety and new discoveries.
```

**Mix:**
```
Generate a playlist mixing songs from my library with new discoveries.
Aim for approximately {mixRatio}% from library, {100-mixRatio}% new.
My library: [artist list], [song sample]
Include both familiar favorites and exciting new finds.
```

### Data Flow

```
User selects mode →
  API receives sourceMode →
    Prompt builder adds constraints →
      LLM generates recommendations →
        Post-filter by source mode →
          Enrich with library status →
            Return to UI
```

## Dependencies

- Story 7.2 (Last.fm Integration) - Required for Discovery mode to suggest external music
- Existing: Navidrome search service
- Existing: Lidarr service (for download buttons in discovery mode)

## Dev Notes

### File Locations
- Service: `src/lib/services/ollama/playlist-generator.ts`
- Prompt builder: `src/lib/services/ollama/prompt-builder.ts`
- API: `src/routes/api/playlist.ts`
- UI Component: `src/components/playlist/source-mode-selector.tsx` (new)
- Preferences: `src/lib/stores/preferences.ts`

### Backwards Compatibility
- Default to `'library'` mode for existing behavior
- Existing API calls without sourceMode continue to work

## Testing Requirements

- Unit tests for each source mode filtering
- Unit tests for prompt generation
- Integration test with mock LLM response
- E2E test for full user flow

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2024-11-30 | 1.0 | Initial draft | Claude |
