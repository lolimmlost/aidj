/**
 * Energy Estimator Service
 *
 * Estimates energy level (0-1) for songs when actual energy data isn't available.
 * Uses genre, BPM, and other heuristics to provide reasonable estimates.
 *
 * Energy levels:
 * - 0.0-0.3: Low energy (ambient, ballads, acoustic)
 * - 0.3-0.5: Medium-low energy (chill, indie, folk)
 * - 0.5-0.7: Medium energy (pop, rock, R&B)
 * - 0.7-0.85: High energy (dance, electronic, hip-hop)
 * - 0.85-1.0: Very high energy (metal, hardcore, EDM bangers)
 */

// Genre to base energy mapping
const GENRE_ENERGY_MAP: Record<string, number> = {
  // Very high energy (0.85-1.0)
  'metal': 0.95,
  'hardcore': 0.95,
  'death metal': 0.95,
  'black metal': 0.92,
  'thrash metal': 0.93,
  'metalcore': 0.90,
  'dubstep': 0.90,
  'hardstyle': 0.95,
  'drum and bass': 0.88,
  'dnb': 0.88,
  'jungle': 0.85,
  'gabber': 0.98,
  'speedcore': 0.98,
  'punk': 0.88,
  'punk rock': 0.85,
  'hardcore punk': 0.92,

  // High energy (0.7-0.85)
  'rock': 0.75,
  'hard rock': 0.80,
  'alternative rock': 0.72,
  'grunge': 0.75,
  'electronic': 0.78,
  'edm': 0.82,
  'house': 0.78,
  'tech house': 0.80,
  'techno': 0.80,
  'trance': 0.82,
  'progressive house': 0.75,
  'electro': 0.80,
  'hip-hop': 0.72,
  'hip hop': 0.72,
  'rap': 0.75,
  'trap': 0.78,
  'grime': 0.80,
  'dancehall': 0.75,
  'reggaeton': 0.78,
  'funk': 0.72,
  'disco': 0.75,
  'ska': 0.75,

  // Medium energy (0.5-0.7)
  'pop': 0.65,
  'synth-pop': 0.65,
  'synthpop': 0.65,
  'dance': 0.70,
  'pop rock': 0.68,
  'indie rock': 0.62,
  'indie': 0.60,
  'alternative': 0.60,
  'britpop': 0.65,
  'r&b': 0.58,
  'rnb': 0.58,
  'soul': 0.55,
  'neo-soul': 0.52,
  'gospel': 0.60,
  'country': 0.55,
  'country rock': 0.60,
  'blues rock': 0.58,
  'world': 0.55,
  'latin': 0.62,
  'salsa': 0.68,
  'reggae': 0.50,
  'dub': 0.48,

  // Medium-low energy (0.3-0.5)
  'folk': 0.42,
  'folk rock': 0.48,
  'singer-songwriter': 0.40,
  'acoustic': 0.38,
  'blues': 0.45,
  'jazz': 0.45,
  'smooth jazz': 0.35,
  'bebop': 0.50,
  'swing': 0.55,
  'bossa nova': 0.35,
  'lounge': 0.32,
  'easy listening': 0.30,
  'soft rock': 0.45,
  'trip-hop': 0.42,
  'downtempo': 0.38,
  'chillout': 0.35,
  'chill': 0.35,
  'lo-fi': 0.35,
  'lofi': 0.35,

  // Low energy (0.0-0.3)
  'ambient': 0.20,
  'new age': 0.22,
  'meditation': 0.15,
  'classical': 0.40, // Varies widely, but average
  'baroque': 0.35,
  'romantic': 0.42,
  'minimalist': 0.25,
  'drone': 0.18,
  'dark ambient': 0.22,
  'sleep': 0.12,
  'relaxation': 0.15,
  'soundscape': 0.20,
  'soundtrack': 0.45, // Varies widely
  'score': 0.45,
};

// BPM to energy adjustment
// Faster BPM generally means higher energy
function getBpmEnergyAdjustment(bpm: number): number {
  if (bpm <= 60) return -0.15;
  if (bpm <= 80) return -0.08;
  if (bpm <= 100) return -0.03;
  if (bpm <= 120) return 0;
  if (bpm <= 140) return 0.05;
  if (bpm <= 160) return 0.10;
  if (bpm <= 180) return 0.15;
  return 0.20; // Very fast (180+ BPM)
}

// Normalize genre string for matching
function normalizeGenre(genre: string): string {
  return genre
    .toLowerCase()
    .trim()
    .replace(/[\/\-_]/g, ' ') // Replace separators with spaces
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .replace(/[^a-z0-9\s&]/g, ''); // Remove special chars except &
}

// Find best matching genre from our map
function findMatchingGenre(genre: string): { genre: string; energy: number } | null {
  const normalized = normalizeGenre(genre);

  // Direct match
  if (GENRE_ENERGY_MAP[normalized]) {
    return { genre: normalized, energy: GENRE_ENERGY_MAP[normalized] };
  }

  // Check if genre contains any of our known genres
  let bestMatch: { genre: string; energy: number; matchLength: number } | null = null;

  for (const [knownGenre, energy] of Object.entries(GENRE_ENERGY_MAP)) {
    if (normalized.includes(knownGenre) || knownGenre.includes(normalized)) {
      const matchLength = knownGenre.length;
      if (!bestMatch || matchLength > bestMatch.matchLength) {
        bestMatch = { genre: knownGenre, energy, matchLength };
      }
    }
  }

  if (bestMatch) {
    return { genre: bestMatch.genre, energy: bestMatch.energy };
  }

  // Check individual words in multi-genre strings
  const words = normalized.split(' ');
  for (const word of words) {
    if (word.length >= 3 && GENRE_ENERGY_MAP[word]) {
      return { genre: word, energy: GENRE_ENERGY_MAP[word] };
    }
  }

  return null;
}

/**
 * Estimate energy for a song based on available metadata
 *
 * @param options - Song metadata for estimation
 * @returns Estimated energy (0-1) and confidence level
 */
export function estimateEnergy(options: {
  genre?: string;
  bpm?: number;
  title?: string;
  artist?: string;
}): { energy: number; confidence: number; method: string } {
  const { genre, bpm, title, artist } = options;
  let energy = 0.5; // Default to medium energy
  let confidence = 0.3; // Low confidence for default
  let method = 'default';

  // Step 1: Try to estimate from genre (most reliable)
  if (genre) {
    const genreMatch = findMatchingGenre(genre);
    if (genreMatch) {
      energy = genreMatch.energy;
      confidence = 0.7;
      method = `genre:${genreMatch.genre}`;
    }
  }

  // Step 2: Adjust based on BPM if available
  if (bpm && bpm > 0) {
    const bpmAdjustment = getBpmEnergyAdjustment(bpm);
    energy = Math.max(0, Math.min(1, energy + bpmAdjustment));

    // BPM increases confidence if we have genre
    if (method.startsWith('genre:')) {
      confidence = Math.min(0.85, confidence + 0.1);
      method += `,bpm:${bpm}`;
    } else {
      // BPM-only estimation
      confidence = 0.5;
      method = `bpm:${bpm}`;

      // BPM-based energy estimation when no genre
      if (bpm <= 70) energy = 0.35;
      else if (bpm <= 90) energy = 0.45;
      else if (bpm <= 110) energy = 0.55;
      else if (bpm <= 130) energy = 0.65;
      else if (bpm <= 150) energy = 0.75;
      else if (bpm <= 170) energy = 0.85;
      else energy = 0.90;
    }
  }

  // Step 3: Heuristics from title/artist (last resort)
  if (confidence < 0.5 && (title || artist)) {
    const text = `${title || ''} ${artist || ''}`.toLowerCase();

    // Energy boosting keywords
    const highEnergyKeywords = [
      'remix', 'dance', 'party', 'club', 'bass', 'drop', 'hard',
      'fast', 'energy', 'fire', 'loud', 'intense', 'rage', 'wild',
    ];

    // Energy lowering keywords
    const lowEnergyKeywords = [
      'acoustic', 'unplugged', 'ballad', 'slow', 'soft', 'quiet',
      'piano', 'stripped', 'ambient', 'relax', 'sleep', 'calm',
      'peaceful', 'gentle', 'tender', 'lullaby',
    ];

    let keywordAdjustment = 0;
    let keywordCount = 0;

    for (const keyword of highEnergyKeywords) {
      if (text.includes(keyword)) {
        keywordAdjustment += 0.08;
        keywordCount++;
      }
    }

    for (const keyword of lowEnergyKeywords) {
      if (text.includes(keyword)) {
        keywordAdjustment -= 0.08;
        keywordCount++;
      }
    }

    if (keywordCount > 0) {
      energy = Math.max(0, Math.min(1, energy + keywordAdjustment));
      confidence = Math.min(0.6, confidence + (keywordCount * 0.05));
      method += `,keywords:${keywordCount}`;
    }
  }

  return {
    energy: Math.round(energy * 100) / 100, // Round to 2 decimal places
    confidence: Math.round(confidence * 100) / 100,
    method,
  };
}

/**
 * Estimate energy for multiple songs efficiently
 *
 * @param songs - Array of song metadata
 * @returns Map of song ID to energy estimation
 */
export function estimateEnergyBatch(
  songs: Array<{
    id: string;
    genre?: string;
    bpm?: number;
    title?: string;
    artist?: string;
  }>
): Map<string, { energy: number; confidence: number; method: string }> {
  const results = new Map<string, { energy: number; confidence: number; method: string }>();

  for (const song of songs) {
    const estimation = estimateEnergy({
      genre: song.genre,
      bpm: song.bpm,
      title: song.title,
      artist: song.artist,
    });

    results.set(song.id, estimation);
  }

  return results;
}

/**
 * Get all supported genres and their energy levels
 * Useful for debugging and UI display
 */
export function getSupportedGenres(): Array<{ genre: string; energy: number }> {
  return Object.entries(GENRE_ENERGY_MAP)
    .map(([genre, energy]) => ({ genre, energy }))
    .sort((a, b) => b.energy - a.energy);
}

/**
 * Calculate energy compatibility between two songs
 * Returns how well two songs flow together energy-wise
 *
 * @param energy1 - First song's energy (0-1)
 * @param energy2 - Second song's energy (0-1)
 * @param direction - Preferred energy direction ('rising', 'falling', 'stable')
 * @returns Compatibility score (0-1)
 */
export function calculateEnergyCompatibility(
  energy1: number,
  energy2: number,
  direction: 'rising' | 'falling' | 'stable' | 'any' = 'any'
): { score: number; relationship: string } {
  const diff = energy2 - energy1;
  const absDiff = Math.abs(diff);

  // Base compatibility on energy difference
  // Small differences are always compatible
  if (absDiff <= 0.1) {
    return { score: 0.95, relationship: 'Same energy level' };
  }

  // Check direction preference
  if (direction === 'rising' && diff > 0) {
    // Rising energy is desired
    if (diff <= 0.2) return { score: 0.90, relationship: 'Gentle energy rise' };
    if (diff <= 0.35) return { score: 0.80, relationship: 'Moderate energy rise' };
    return { score: 0.65, relationship: 'Large energy jump up' };
  }

  if (direction === 'falling' && diff < 0) {
    // Falling energy is desired
    if (absDiff <= 0.2) return { score: 0.90, relationship: 'Gentle energy drop' };
    if (absDiff <= 0.35) return { score: 0.80, relationship: 'Moderate energy drop' };
    return { score: 0.65, relationship: 'Large energy drop' };
  }

  if (direction === 'stable') {
    // Want to maintain energy
    if (absDiff <= 0.15) return { score: 0.85, relationship: 'Energy maintained' };
    if (absDiff <= 0.25) return { score: 0.65, relationship: 'Slight energy change' };
    return { score: 0.40, relationship: 'Energy level mismatch' };
  }

  // Direction is 'any' - moderate changes are fine
  if (absDiff <= 0.2) return { score: 0.85, relationship: 'Similar energy' };
  if (absDiff <= 0.35) return { score: 0.70, relationship: 'Moderate energy shift' };
  if (absDiff <= 0.5) return { score: 0.50, relationship: 'Significant energy shift' };

  return { score: 0.30, relationship: 'Energy mismatch' };
}

/**
 * Suggest target energy for the next song in a DJ set
 *
 * @param currentEnergy - Current song's energy
 * @param setPosition - Position in the set (0-1, where 0.5 is peak time)
 * @param style - DJ style preference
 * @returns Suggested energy range for next song
 */
export function suggestNextEnergy(
  currentEnergy: number,
  setPosition: number = 0.5,
  style: 'buildup' | 'peak' | 'cooldown' | 'dynamic' = 'dynamic'
): { min: number; max: number; target: number } {
  let targetDelta = 0;

  switch (style) {
    case 'buildup':
      // Gradually increase energy
      targetDelta = 0.05 + (setPosition * 0.1);
      break;

    case 'peak':
      // Maintain high energy
      targetDelta = Math.random() * 0.1 - 0.05; // Small variations
      break;

    case 'cooldown':
      // Gradually decrease energy
      targetDelta = -0.05 - ((1 - setPosition) * 0.1);
      break;

    case 'dynamic':
      // Follow a wave pattern based on set position
      // Early set: build up, mid set: peak, late set: cool down
      if (setPosition < 0.3) {
        targetDelta = 0.05 + (setPosition * 0.15);
      } else if (setPosition < 0.7) {
        targetDelta = Math.random() * 0.15 - 0.05; // Peak variations
      } else {
        targetDelta = -0.05 - ((setPosition - 0.7) * 0.15);
      }
      break;
  }

  const target = Math.max(0, Math.min(1, currentEnergy + targetDelta));
  const min = Math.max(0, target - 0.15);
  const max = Math.min(1, target + 0.15);

  return { min, max, target };
}
