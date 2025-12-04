/**
 * Smart Playlist Evaluator
 *
 * Evaluates Navidrome smart playlist rules (.nsp format) and returns matching songs
 * from the user's library using Navidrome's Subsonic API.
 */

import { getSongsGlobal, type SubsonicSong } from './navidrome';

// Navidrome condition value can be various types depending on the operator
type ConditionValue = string | number | boolean | [number, number];

// A condition is an object with an operator as the key and field/value as nested object
type RuleCondition = Record<string, Record<string, ConditionValue>> | { all: RuleCondition[] } | { any: RuleCondition[] };

interface SmartPlaylistRules {
  name?: string;
  comment?: string;
  all?: RuleCondition[];
  any?: RuleCondition[];
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
}

/**
 * Evaluate smart playlist rules and return matching songs
 */
export async function evaluateSmartPlaylistRules(rules: SmartPlaylistRules): Promise<SubsonicSong[]> {
  console.log('🔍 Evaluating smart playlist rules:', JSON.stringify(rules, null, 2));

  try {
    // Get all songs from library
    // Note: For production, we should implement pagination and caching
    const allSongs = await getSongsGlobal(0, 10000);
    console.log(`📚 Retrieved ${allSongs.length} songs from library`);

    // Filter songs based on rules
    let filteredSongs = allSongs.map(song => ({
      id: song.id,
      title: song.name || song.title || '',
      artist: song.artist || '',
      album: song.album || '',
      albumId: song.albumId || '',
      duration: song.duration?.toString() || '0',
      track: song.track?.toString() || '0',
      year: song.year || 0,
      genre: song.genre || '',
      // Add metadata for filtering
      playCount: song.playCount || 0,
      rating: song.rating || 0,
      loved: song.loved || false,
      // Note: Some fields may not be available via Subsonic API
      // We'll handle missing fields gracefully
    }));

    // Apply 'all' conditions (AND logic)
    // If rules.all is empty or undefined, no filtering is applied (all songs pass)
    if (rules.all && rules.all.length > 0) {
      for (const condition of rules.all) {
        filteredSongs = applyCondition(filteredSongs, condition);
      }
    }

    // Apply 'any' conditions (OR logic)
    if (rules.any && rules.any.length > 0) {
      const anyMatches: SubsonicSong[] = [];
      for (const condition of rules.any) {
        const matches = applyCondition(filteredSongs, condition);
        anyMatches.push(...matches);
      }
      // Remove duplicates
      filteredSongs = Array.from(new Map(anyMatches.map(s => [s.id, s])).values());
    }

    // Apply sorting
    if (rules.sort) {
      filteredSongs = sortSongs(filteredSongs, rules.sort, rules.order || 'asc');
    }

    // Apply limit
    if (rules.limit) {
      filteredSongs = filteredSongs.slice(0, rules.limit);
    }

    console.log(`✅ Filtered to ${filteredSongs.length} songs matching rules`);
    return filteredSongs;
  } catch (error) {
    console.error('Failed to evaluate smart playlist rules:', error);
    throw error;
  }
}

/**
 * Apply a single condition to filter songs
 */
function applyCondition(songs: SubsonicSong[], condition: RuleCondition): SubsonicSong[] {
  const operator = Object.keys(condition)[0];
  const fieldValue = condition[operator];

  // Handle nested 'all' or 'any' conditions
  if (operator === 'all') {
    let result = songs;
    for (const nestedCondition of fieldValue) {
      result = applyCondition(result, nestedCondition);
    }
    return result;
  }

  if (operator === 'any') {
    const anyMatches: SubsonicSong[] = [];
    for (const nestedCondition of fieldValue) {
      const matches = applyCondition(songs, nestedCondition);
      anyMatches.push(...matches);
    }
    return Array.from(new Map(anyMatches.map(s => [s.id, s])).values());
  }

  const field = Object.keys(fieldValue)[0];
  const value = fieldValue[field];

  console.log(`  📌 Applying condition: ${operator} ${field} ${JSON.stringify(value)}`);

  return songs.filter(song => {
    const songValue = getSongField(song, field);

    switch (operator) {
      case 'is':
        // For text fields like genre/artist/album, use case-insensitive contains matching
        // This is more flexible than exact match and handles multi-value genre fields
        if (typeof songValue === 'string' && typeof value === 'string') {
          return songValue.toLowerCase().includes(value.toLowerCase());
        }
        return songValue === value;

      case 'isNot':
        if (typeof songValue === 'string' && typeof value === 'string') {
          return !songValue.toLowerCase().includes(value.toLowerCase());
        }
        return songValue !== value;

      case 'gt':
        return Number(songValue) > Number(value);

      case 'lt':
        return Number(songValue) < Number(value);

      case 'contains':
        return String(songValue).toLowerCase().includes(String(value).toLowerCase());

      case 'notContains':
        return !String(songValue).toLowerCase().includes(String(value).toLowerCase());

      case 'startsWith':
        return String(songValue).toLowerCase().startsWith(String(value).toLowerCase());

      case 'endsWith':
        return String(songValue).toLowerCase().endsWith(String(value).toLowerCase());

      case 'inTheRange': {
        const numValue = Number(songValue);
        return numValue >= value[0] && numValue <= value[1];
      }

      case 'inTheLast':
        // This requires date fields which may not be fully available via Subsonic
        // For now, we'll use a simple heuristic or return all songs
        console.warn(`  ⚠️ inTheLast operator not fully supported for field "${field}"`);
        return true;

      case 'notInTheLast':
        console.warn(`  ⚠️ notInTheLast operator not fully supported for field "${field}"`);
        return true;

      case 'before':
      case 'after':
        console.warn(`  ⚠️ ${operator} operator not fully supported for field "${field}"`);
        return true;

      default:
        console.warn(`  ⚠️ Unknown operator: ${operator}`);
        return true;
    }
  });
}

// Track which fields we've warned about to avoid spam
const warnedFields = new Set<string>();

/**
 * Get a field value from a song
 */
function getSongField(song: SubsonicSong, field: string): string | number | boolean {
  switch (field) {
    case 'title':
      return song.title || '';
    case 'album':
      return song.album || '';
    case 'artist':
      return song.artist || '';
    case 'genre':
      return song.genre || '';
    case 'year':
      return song.year || 0;
    case 'rating':
      return song.rating || 0;
    case 'playcount':
    case 'playCount':
      return song.playCount || 0;
    case 'loved':
      return song.loved || false;
    case 'duration':
      return parseInt(song.duration || '0');
    case 'bitrate':
      return song.bitrate || 0;
    // Navidrome date fields (may not be available via Subsonic API)
    case 'dateadded':
    case 'dateAdded':
    case 'created':
      // Return empty string for date fields - these aren't typically available
      // via Subsonic API, only in native Navidrome .nsp files
      return '';
    case 'lastplayed':
    case 'lastPlayed':
      return '';
    case 'dateloved':
    case 'dateLoved':
      return '';
    default:
      // Only warn once per field to avoid log spam
      if (!warnedFields.has(field)) {
        console.warn(`  ⚠️ Unknown field: ${field} (this warning will only show once)`);
        warnedFields.add(field);
      }
      return '';
  }
}

/**
 * Sort songs based on field and order
 */
function sortSongs(songs: SubsonicSong[], sortField: string, order: 'asc' | 'desc'): SubsonicSong[] {
  if (sortField === 'random') {
    return [...songs].sort(() => Math.random() - 0.5);
  }

  // Handle multi-field sorting (e.g., "-year,-rating,title")
  const sortFields = sortField.split(',').map(f => f.trim());

  return [...songs].sort((a, b) => {
    for (const field of sortFields) {
      const isDesc = field.startsWith('-');
      const cleanField = field.replace(/^[+-]/, '');
      const direction = isDesc ? -1 : (order === 'desc' ? -1 : 1);

      const aValue = getSongField(a, cleanField);
      const bValue = getSongField(b, cleanField);

      if (aValue < bValue) return -1 * direction;
      if (aValue > bValue) return 1 * direction;
    }
    return 0;
  });
}
