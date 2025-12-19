export type Song = {
  id: string;
  name: string;
  title?: string; // Alternative name field from API
  albumId: string;
  album?: string; // Album name for display
  duration: number;
  track: number;
  url: string;
  artist?: string; // Optional for display
  genre?: string; // Optional genre for recommendations
  // Story 7.5: Harmonic mixing metadata
  bpm?: number; // Beats per minute (from Navidrome or audio analysis)
  key?: string; // Musical key (e.g., "C", "Am", "F#m")
  energy?: number; // Energy level 0-1 (for DJ mixing)
};

// Camelot wheel notation for DJ-friendly key display
export type CamelotKey =
  | '1A' | '1B' | '2A' | '2B' | '3A' | '3B'
  | '4A' | '4B' | '5A' | '5B' | '6A' | '6B'
  | '7A' | '7B' | '8A' | '8B' | '9A' | '9B'
  | '10A' | '10B' | '11A' | '11B' | '12A' | '12B';

// Map musical keys to Camelot notation
export const KEY_TO_CAMELOT: Record<string, CamelotKey> = {
  'Abm': '1A', 'B': '1B',
  'Ebm': '2A', 'F#': '2B',
  'Bbm': '3A', 'Db': '3B',
  'Fm': '4A', 'Ab': '4B',
  'Cm': '5A', 'Eb': '5B',
  'Gm': '6A', 'Bb': '6B',
  'Dm': '7A', 'F': '7B',
  'Am': '8A', 'C': '8B',
  'Em': '9A', 'G': '9B',
  'Bm': '10A', 'D': '10B',
  'F#m': '11A', 'A': '11B',
  'C#m': '12A', 'E': '12B',
  // Alternative/enharmonic notations
  'G#m': '1A', 'Gb': '2B', 'C#': '3B', 'D#m': '2A', 'A#m': '3A', 'A#': '6B',
  'D#': '6B', 'G#': '4B', // Enharmonic equivalents of Eb and Ab
};

// Get Camelot notation for a key
export function getCamelotKey(key: string | undefined): CamelotKey | null {
  if (!key) return null;
  return KEY_TO_CAMELOT[key] || null;
}

// Check if two Camelot keys are compatible for harmonic mixing
export function areCamelotKeysCompatible(key1: CamelotKey, key2: CamelotKey): { compatible: boolean; score: number; relationship: string } {
  const num1 = parseInt(key1.slice(0, -1));
  const letter1 = key1.slice(-1);
  const num2 = parseInt(key2.slice(0, -1));
  const letter2 = key2.slice(-1);

  // Perfect match
  if (key1 === key2) {
    return { compatible: true, score: 1.0, relationship: 'Same key' };
  }

  // Same number (relative major/minor)
  if (num1 === num2) {
    return { compatible: true, score: 0.9, relationship: 'Relative major/minor' };
  }

  // Adjacent on wheel (+1 or -1, wrapping 12->1)
  const diff = Math.abs(num1 - num2);
  if ((diff === 1 || diff === 11) && letter1 === letter2) {
    return { compatible: true, score: 0.85, relationship: 'Adjacent key' };
  }

  // 2 steps away on wheel
  if ((diff === 2 || diff === 10) && letter1 === letter2) {
    return { compatible: true, score: 0.7, relationship: 'Two steps' };
  }

  // Diagonal (adjacent number, different letter)
  if ((diff === 1 || diff === 11) && letter1 !== letter2) {
    return { compatible: true, score: 0.6, relationship: 'Diagonal' };
  }

  return { compatible: false, score: 0.3, relationship: 'Key clash' };
}
