# Smart Playlists Feature

## Overview

The Smart Playlist feature allows users to create dynamic playlists using Navidrome's native rule-based system (.nsp format). Unlike AI-generated playlists, smart playlists pull songs from your existing library based on criteria you define.

## Features

### 🎯 Preset Templates

Eight ready-to-use playlist templates inspired by the Navidrome Smart Playlist Collection:

1. **Never Played** - Songs you haven't listened to yet (playcount = 0)
2. **Favorites** - Highly rated (5 stars) or loved tracks with less than 5 plays
3. **Unrated Songs** - Tracks without ratings - helps organize your library
4. **Random Mix** - Random selection from your entire library
5. **Recent Releases** - Songs from the last 3 years
6. **80s & 90s Classics** - Songs from 1980-1999
7. **Long Tracks** - Songs over 5 minutes long
8. **Short & Sweet** - Quick songs under 3 minutes

> **Note**: These presets use fields that work best with available metadata (year, duration, playcount, rating, loved).

### 🔧 Custom Rule Builder

Build complex queries with visual UI:
- **Field Selection**: title, artist, album, genre, year, rating, play count, loved, etc.
- **Operator Selection**: is, contains, greater than, in range, and more
- **Value Input**: Text, number, or boolean based on field type
- **Multiple Rules**: Combine rules with AND logic
- **Sorting**: Sort by any field, multiple fields, or random
- **Limits**: Control how many songs appear in the playlist

### 👁️ Live Preview

- Click "Preview" to see matching songs before creating
- Shows song count and first 10 matching songs
- Updates based on current rules

## Architecture

### Components

**SmartPlaylistEditor** (`src/components/playlists/smart-playlist-editor.tsx`)
- Main UI component with tabs for Presets and Custom Rules
- Integrates with TanStack Query for data fetching
- Handles rule building and playlist creation

**SmartPlaylistEvaluator** (`src/lib/services/smart-playlist-evaluator.ts`)
- Translates Navidrome .nsp format into song queries
- Applies filters, sorting, and limits
- Returns matching songs from library

### API Endpoints

**POST /api/playlists/smart/preview**
- Preview songs matching smart playlist rules
- Request: `{ rules: SmartPlaylistRules }`
- Response: `{ songs: SubsonicSong[], count: number }`

**POST /api/playlists/smart**
- Create smart playlist with Navidrome rules
- Request: `{ name: string, rules: SmartPlaylistRules }`
- Response: `{ playlist: Playlist }`

### Navidrome Rule Format

Smart playlists use Navidrome's native .nsp format:

```json
{
  "name": "Recently Played",
  "all": [{ "inTheLast": { "lastplayed": 30 } }],
  "sort": "lastplayed",
  "order": "desc",
  "limit": 100
}
```

#### Supported Fields

**Widely Available (Recommended):**
- `title`, `album`, `artist` - Song metadata (always available)
- `genre` - Genre tag (usually available if tagged)
- `year` - Release year (widely available)
- `duration` - Song length in seconds (always available)
- `bitrate` - Audio bitrate (usually available)

**Limited Availability (Depends on Navidrome Setup):**
- `rating` - User rating (requires Navidrome user interaction tracking)
- `playcount` - Number of plays (requires Navidrome scrobbling enabled)
- `loved` - Loved/favorited status (requires user interaction)
- `dateadded`, `lastplayed`, `dateloved` - Date fields (rarely available via Subsonic API)

> **Best Practice**: Use fields from the "Widely Available" category for the most reliable smart playlists.

#### Supported Operators

- **Equality**: `is`, `isNot`
- **Comparison**: `gt` (greater than), `lt` (less than)
- **String**: `contains`, `notContains`, `startsWith`, `endsWith`
- **Range**: `inTheRange` (for numbers/years)
- **Date**: `inTheLast`, `notInTheLast`, `before`, `after`

#### Logic Operators

- **all**: AND logic (all conditions must match)
- **any**: OR logic (any condition must match)

Example with multiple conditions:

```json
{
  "name": "80s Top Songs",
  "all": [
    { "any": [
      { "is": { "loved": true } },
      { "gt": { "rating": 3 } }
    ]},
    { "inTheRange": { "year": [1981, 1990] } }
  ],
  "sort": "year",
  "order": "desc",
  "limit": 25
}
```

## Usage

### In Code

```tsx
import { SmartPlaylistEditor } from '@/components/playlists/smart-playlist-editor';

// Basic usage
<SmartPlaylistEditor />

// With custom trigger
<SmartPlaylistEditor
  trigger={<Button>Create Smart Playlist</Button>}
/>
```

### User Flow

1. Click "New Smart Playlist" button
2. Choose a **Preset** or build **Custom Rules**:
   - **Preset**: Select from 6 templates, customize name
   - **Custom**: Add rules, configure sorting and limits
3. Click **Preview** to see matching songs
4. Adjust rules as needed
5. Click **Create Playlist** to save

## Current Limitations

### 1. Date-Based Operators

**Status**: Partial Support

Date operators (`inTheLast`, `notInTheLast`, `before`, `after`) are placeholders. Navidrome's Subsonic API doesn't expose all required date fields.

**Workaround**: These operators currently return all songs. Full support requires additional Navidrome API fields.

### 2. Large Libraries

**Status**: Performance Concern

Currently loads up to 10,000 songs to evaluate rules.

**Recommendation**: For libraries >10,000 songs, implement:
- Pagination
- Server-side rule evaluation
- Caching strategies

### 3. Missing Metadata

**Status**: Configuration Dependent

Some fields like `playCount`, `loved`, `lastplayed` may not be available depending on Navidrome configuration and Subsonic API version.

**Workaround**: Rules using unavailable fields will still work but may not filter accurately.

## Future Enhancements

### Planned Features

1. **Auto-Refresh** - Automatically update playlists when library changes
2. **Smart Playlist Management** - Edit existing smart playlist rules
3. **Export/Import** - Share .nsp files with other users
4. **Advanced Operators** - Additional filtering options
5. **Server-Side Evaluation** - Better performance for large libraries

### Integration Opportunities

1. **Navidrome Native Support** - When Navidrome adds .nsp file support
2. **Enhanced Metadata** - Use extended Subsonic API fields when available
3. **Custom Tags** - Support for user-defined tags in Navidrome
4. **Library Scoping** - Multi-library smart playlists

## Technical Details

### Rule Evaluation Process

1. **Fetch Songs**: Get all songs from Navidrome (via `getSongsGlobal`)
2. **Apply Filters**:
   - Process 'all' conditions (AND logic)
   - Process 'any' conditions (OR logic)
3. **Apply Sorting**:
   - Single or multi-field sorting
   - Random sorting support
4. **Apply Limit**: Truncate to specified song count
5. **Return Results**: Matching songs in SubsonicSong format

### Data Flow

```
User Input → SmartPlaylistEditor
           → POST /api/playlists/smart/preview
           → evaluateSmartPlaylistRules()
           → Filter/Sort/Limit songs
           → Return preview
           → User confirms
           → POST /api/playlists/smart
           → Save to database
           → Refresh playlist list
```

### Database Schema

Smart playlists are stored in `userPlaylists` table with:
- `smartPlaylistCriteria`: JSONB field containing full Navidrome rules
- Regular playlist fields: `name`, `songCount`, `totalDuration`
- Songs stored in `playlistSongs` junction table

## Examples

### Example 1: Create "Hidden Gems" Playlist

```typescript
const rules = {
  name: 'Hidden Gems',
  all: [
    { gt: { rating: 3 } },
    { any: [
      { lt: { playcount: 3 } },
      { is: { playcount: 0 } }
    ]}
  ],
  sort: 'rating',
  order: 'desc',
  limit: 50
};
```

### Example 2: Create "90s Rock" Playlist

```typescript
const rules = {
  name: '90s Rock',
  all: [
    { inTheRange: { year: [1990, 1999] } },
    { contains: { genre: 'rock' } }
  ],
  sort: 'random',
  limit: 100
};
```

### Example 3: Multi-Field Sorting

```typescript
const rules = {
  name: '2000s Hits by Year and Rating',
  all: [{ inTheRange: { year: [2000, 2009] } }],
  sort: '-year,-rating,title',  // Descending year, descending rating, ascending title
  limit: 200
};
```

## Troubleshooting

### Issue: Preview shows no songs

**Possible Causes:**
- Rules too restrictive
- Missing metadata in library
- Navidrome API limitations

**Solutions:**
1. Relax filter criteria
2. Check Navidrome library scan completion
3. Verify metadata is present in music files
4. Test with simpler rules first

### Issue: Slow preview performance

**Possible Causes:**
- Large library (>5000 songs)
- Complex rule combinations
- Network latency

**Solutions:**
1. Add more restrictive filters
2. Reduce song limit
3. Use server-side caching
4. Consider pagination

### Issue: Date filters not working

**Expected Behavior:**
Date operators currently have limited support due to Subsonic API constraints.

**Solutions:**
- Use alternative filters (recently added, play count)
- Wait for enhanced Navidrome API support
- Use presets that don't rely on dates

## References

- [Navidrome Smart Playlists Documentation](https://www.navidrome.org/docs/usage/smartplaylists/)
- [Subsonic API Specification](http://www.subsonic.org/pages/api.jsp)
- Story 3.8: Navidrome Smart Playlist Integration

## Support

For issues or feature requests:
1. Check this documentation
2. Review Navidrome's smart playlist docs
3. Check GitHub issues
4. Create new issue with:
   - Rule definition (JSON)
   - Expected vs actual behavior
   - Navidrome version
   - Library size
