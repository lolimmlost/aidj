/**
 * Genre Hierarchy System
 *
 * Phase 2.1 of the AIDJ Queue Improvement Plan.
 * Provides genre similarity scoring and subgenre understanding.
 *
 * Key features:
 * - Hierarchical genre taxonomy (parent/child relationships)
 * - Similarity scoring between genres (0.0-1.0)
 * - Normalization of genre strings
 * - Related genre lookups
 */

// ============================================================================
// Genre Taxonomy Data
// ============================================================================

/**
 * Genre hierarchy with parent-child relationships and similarity scores.
 * Each genre has:
 * - parent: The broader genre category (if any)
 * - children: Subgenres
 * - similar: Related genres with similarity scores (0.0-1.0)
 */
export interface GenreNode {
  parent?: string;
  children: string[];
  similar: Record<string, number>; // genre -> similarity score (0.0-1.0)
}

/**
 * Core genre taxonomy
 * This covers the most common genres and their relationships
 */
const GENRE_HIERARCHY: Record<string, GenreNode> = {
  // ==================== ELECTRONIC ====================
  'electronic': {
    children: ['house', 'techno', 'edm', 'ambient', 'trance', 'drum and bass', 'dubstep', 'lo-fi house', 'synthwave', 'electro', 'idm', 'breakbeat', 'downtempo', 'chillwave'],
    similar: {
      'dance': 0.8,
      'pop': 0.4,
      'indie dance': 0.7,
      'experimental': 0.5,
    }
  },
  'house': {
    parent: 'electronic',
    children: ['deep house', 'tech house', 'lo-fi house', 'acid house', 'progressive house', 'electro house', 'future house', 'tropical house'],
    similar: {
      'techno': 0.7,
      'disco': 0.6,
      'dance': 0.8,
      'edm': 0.6,
    }
  },
  'lo-fi house': {
    parent: 'house',
    children: [],
    similar: {
      'deep house': 0.8,
      'chillwave': 0.7,
      'indie dance': 0.6,
      'downtempo': 0.5,
    }
  },
  'techno': {
    parent: 'electronic',
    children: ['minimal techno', 'detroit techno', 'industrial techno', 'melodic techno', 'acid techno'],
    similar: {
      'house': 0.7,
      'industrial': 0.5,
      'ambient': 0.3,
    }
  },
  'ambient': {
    parent: 'electronic',
    children: ['dark ambient', 'space ambient', 'drone', 'ambient house'],
    similar: {
      'downtempo': 0.7,
      'new age': 0.5,
      'chillout': 0.6,
      'experimental': 0.5,
    }
  },
  'synthwave': {
    parent: 'electronic',
    children: ['retrowave', 'darksynth', 'outrun'],
    similar: {
      'electro': 0.6,
      'new wave': 0.5,
      'synth-pop': 0.7,
    }
  },

  // ==================== HIP-HOP / RAP ====================
  'hip-hop': {
    children: ['trap', 'boom bap', 'melodic rap', 'drill', 'cloud rap', 'conscious hip-hop', 'gangsta rap', 'southern hip-hop', 'west coast hip-hop', 'east coast hip-hop', 'emo rap'],
    similar: {
      'r&b': 0.6,
      'rap': 1.0, // Alias
      'soul': 0.4,
      'pop': 0.3,
    }
  },
  'rap': {
    children: [],
    similar: {
      'hip-hop': 1.0, // Alias
    }
  },
  'trap': {
    parent: 'hip-hop',
    children: ['melodic trap', 'hard trap', 'phonk'],
    similar: {
      'drill': 0.7,
      'cloud rap': 0.6,
      'melodic rap': 0.7,
      'southern hip-hop': 0.5,
    }
  },
  'boom bap': {
    parent: 'hip-hop',
    children: [],
    similar: {
      'east coast hip-hop': 0.8,
      'conscious hip-hop': 0.6,
      'jazz rap': 0.5,
      'trap': 0.2, // Very different vibe
    }
  },
  'melodic rap': {
    parent: 'hip-hop',
    children: [],
    similar: {
      'emo rap': 0.8,
      'trap': 0.7,
      'cloud rap': 0.6,
      'r&b': 0.5,
    }
  },
  'drill': {
    parent: 'hip-hop',
    children: ['uk drill', 'chicago drill', 'brooklyn drill'],
    similar: {
      'trap': 0.7,
      'gangsta rap': 0.5,
    }
  },
  'emo rap': {
    parent: 'hip-hop',
    children: [],
    similar: {
      'melodic rap': 0.8,
      'cloud rap': 0.6,
      'alternative hip-hop': 0.5,
      'emo': 0.3,
    }
  },

  // ==================== ROCK ====================
  'rock': {
    children: ['indie rock', 'alternative rock', 'hard rock', 'punk rock', 'progressive rock', 'classic rock', 'psychedelic rock', 'post-rock', 'grunge', 'garage rock', 'blues rock', 'folk rock'],
    similar: {
      'metal': 0.5,
      'punk': 0.6,
      'alternative': 0.8,
    }
  },
  'indie rock': {
    parent: 'rock',
    children: ['indie pop', 'lo-fi indie', 'art rock'],
    similar: {
      'alternative rock': 0.8,
      'indie pop': 0.7,
      'alternative': 0.7,
      'post-punk': 0.5,
    }
  },
  'alternative rock': {
    parent: 'rock',
    children: [],
    similar: {
      'indie rock': 0.8,
      'grunge': 0.6,
      'post-punk': 0.5,
    }
  },
  'punk': {
    parent: 'rock',
    children: ['punk rock', 'pop punk', 'hardcore punk', 'post-punk', 'skate punk'],
    similar: {
      'hardcore': 0.6,
      'grunge': 0.4,
      'rock': 0.5,
    }
  },
  'metal': {
    children: ['heavy metal', 'death metal', 'black metal', 'thrash metal', 'power metal', 'progressive metal', 'nu metal', 'doom metal', 'metalcore'],
    similar: {
      'rock': 0.5,
      'hard rock': 0.7,
      'hardcore': 0.4,
    }
  },

  // ==================== POP ====================
  'pop': {
    children: ['synth-pop', 'electropop', 'indie pop', 'art pop', 'dance pop', 'k-pop', 'j-pop', 'teen pop', 'baroque pop'],
    similar: {
      'dance': 0.6,
      'r&b': 0.5,
      'rock': 0.3,
    }
  },
  'indie pop': {
    parent: 'pop',
    children: [],
    similar: {
      'indie rock': 0.7,
      'synth-pop': 0.5,
      'dream pop': 0.6,
    }
  },
  'synth-pop': {
    parent: 'pop',
    children: [],
    similar: {
      'new wave': 0.7,
      'electropop': 0.8,
      'synthwave': 0.6,
    }
  },

  // ==================== R&B / SOUL ====================
  'r&b': {
    children: ['neo-soul', 'contemporary r&b', 'alternative r&b', 'quiet storm'],
    similar: {
      'soul': 0.8,
      'hip-hop': 0.6,
      'pop': 0.5,
      'funk': 0.6,
    }
  },
  'soul': {
    children: ['neo-soul', 'southern soul', 'motown'],
    similar: {
      'r&b': 0.8,
      'funk': 0.7,
      'gospel': 0.5,
      'blues': 0.5,
    }
  },
  'funk': {
    children: ['p-funk', 'electro-funk', 'funk rock'],
    similar: {
      'soul': 0.7,
      'disco': 0.6,
      'r&b': 0.5,
    }
  },

  // ==================== JAZZ ====================
  'jazz': {
    children: ['bebop', 'cool jazz', 'free jazz', 'fusion', 'smooth jazz', 'acid jazz', 'jazz rap', 'nu jazz'],
    similar: {
      'blues': 0.5,
      'soul': 0.4,
      'experimental': 0.4,
    }
  },

  // ==================== FOLK / ACOUSTIC ====================
  'folk': {
    children: ['indie folk', 'folk rock', 'contemporary folk', 'acoustic', 'americana'],
    similar: {
      'country': 0.5,
      'acoustic': 0.7,
      'singer-songwriter': 0.6,
    }
  },
  'acoustic': {
    parent: 'folk',
    children: [],
    similar: {
      'folk': 0.7,
      'singer-songwriter': 0.6,
      'unplugged': 0.8,
    }
  },

  // ==================== COUNTRY ====================
  'country': {
    children: ['alt-country', 'country rock', 'outlaw country', 'nashville sound', 'bro-country'],
    similar: {
      'folk': 0.5,
      'americana': 0.7,
      'bluegrass': 0.6,
    }
  },

  // ==================== REGGAE / DANCEHALL ====================
  'reggae': {
    children: ['dub', 'dancehall', 'roots reggae', 'reggaeton'],
    similar: {
      'ska': 0.6,
      'dub': 0.8,
      'dancehall': 0.7,
    }
  },
  'dancehall': {
    parent: 'reggae',
    children: [],
    similar: {
      'reggaeton': 0.7,
      'afrobeats': 0.5,
      'hip-hop': 0.4,
    }
  },

  // ==================== WORLD / GLOBAL ====================
  'world': {
    children: ['afrobeats', 'latin', 'african', 'asian', 'middle eastern', 'celtic', 'flamenco'],
    similar: {
      'folk': 0.4,
      'jazz': 0.3,
    }
  },
  'afrobeats': {
    parent: 'world',
    children: [],
    similar: {
      'dancehall': 0.5,
      'r&b': 0.4,
      'hip-hop': 0.4,
    }
  },
  'latin': {
    parent: 'world',
    children: ['reggaeton', 'salsa', 'bachata', 'cumbia', 'latin pop'],
    similar: {
      'pop': 0.4,
      'dance': 0.5,
    }
  },

  // ==================== CLASSICAL / ORCHESTRAL ====================
  'classical': {
    children: ['baroque', 'romantic', 'contemporary classical', 'minimalist', 'orchestral'],
    similar: {
      'soundtrack': 0.5,
      'ambient': 0.3,
      'new age': 0.3,
    }
  },

  // ==================== OTHER ====================
  'soundtrack': {
    children: ['film score', 'video game', 'anime'],
    similar: {
      'classical': 0.5,
      'orchestral': 0.7,
      'ambient': 0.4,
    }
  },
  'experimental': {
    children: ['noise', 'avant-garde', 'glitch', 'field recordings'],
    similar: {
      'ambient': 0.5,
      'electronic': 0.5,
      'industrial': 0.4,
    }
  },
};

// ============================================================================
// Genre Normalization
// ============================================================================

/**
 * Common genre aliases and normalizations
 * Maps various spellings/names to canonical genre names
 */
const GENRE_ALIASES: Record<string, string> = {
  // Hip-hop variations
  'hiphop': 'hip-hop',
  'hip hop': 'hip-hop',
  'hip_hop': 'hip-hop',
  'rap': 'hip-hop',
  'rapper': 'hip-hop',

  // Electronic variations
  'edm': 'electronic',
  'electronica': 'electronic',
  'dance music': 'dance',
  'lofi house': 'lo-fi house',
  'lo fi house': 'lo-fi house',
  'lo-fi': 'lo-fi house', // Contextual, could also mean lo-fi hip-hop
  'lofi': 'lo-fi house',

  // R&B variations
  'rnb': 'r&b',
  'r and b': 'r&b',
  'rhythm and blues': 'r&b',

  // Rock variations
  'alt rock': 'alternative rock',
  'alt-rock': 'alternative rock',
  'indie': 'indie rock',

  // Other normalizations
  'post punk': 'post-punk',
  'synth pop': 'synth-pop',
  'new-wave': 'new wave',
  'drum n bass': 'drum and bass',
  'dnb': 'drum and bass',
  'd&b': 'drum and bass',
  'drum & bass': 'drum and bass',
};

/**
 * Normalize a genre string to its canonical form
 */
export function normalizeGenre(genre: string): string {
  const lower = genre.toLowerCase().trim();

  // Check aliases first
  if (GENRE_ALIASES[lower]) {
    return GENRE_ALIASES[lower];
  }

  // Remove common prefixes/suffixes that don't change meaning
  const cleaned = lower
    .replace(/^(the\s+)/i, '')
    .replace(/\s+music$/i, '')
    .replace(/\s+rock$/i, ' rock') // Keep "rock" but normalize spacing
    .trim();

  return GENRE_ALIASES[cleaned] || cleaned;
}

// ============================================================================
// Similarity Calculation
// ============================================================================

/**
 * Calculate similarity score between two genres (0.0-1.0)
 *
 * @param genre1 - First genre
 * @param genre2 - Second genre
 * @returns Similarity score from 0.0 (unrelated) to 1.0 (same/alias)
 */
export function getGenreSimilarity(genre1: string, genre2: string): number {
  const g1 = normalizeGenre(genre1);
  const g2 = normalizeGenre(genre2);

  // Exact match (including after normalization)
  if (g1 === g2) {
    return 1.0;
  }

  // Check if they're in the hierarchy
  const node1 = GENRE_HIERARCHY[g1];
  const node2 = GENRE_HIERARCHY[g2];

  // Direct similarity defined in hierarchy
  if (node1?.similar[g2] !== undefined) {
    return node1.similar[g2];
  }
  if (node2?.similar[g1] !== undefined) {
    return node2.similar[g1];
  }

  // Parent-child relationship
  if (node1?.parent === g2 || node2?.parent === g1) {
    return 0.8; // High similarity for parent/child
  }
  if (node1?.children.includes(g2) || node2?.children.includes(g1)) {
    return 0.8;
  }

  // Same parent (siblings)
  if (node1?.parent && node1.parent === node2?.parent) {
    return 0.6; // Sibling genres
  }

  // Grandparent relationship (parent's parent)
  if (node1?.parent) {
    const parent1 = GENRE_HIERARCHY[node1.parent];
    if (parent1?.parent === g2 || parent1?.children.includes(g2)) {
      return 0.5;
    }
  }
  if (node2?.parent) {
    const parent2 = GENRE_HIERARCHY[node2.parent];
    if (parent2?.parent === g1 || parent2?.children.includes(g1)) {
      return 0.5;
    }
  }

  // String similarity as fallback
  // Check if one contains the other (e.g., "rock" in "indie rock")
  if (g1.includes(g2) || g2.includes(g1)) {
    return 0.4;
  }

  // No known relationship
  return 0.0;
}

/**
 * Calculate average similarity between a genre and a list of genres
 * Uses the best match, not average, to avoid dilution
 */
export function getBestGenreMatch(
  targetGenre: string,
  genreList: string[]
): { bestMatch: string; score: number } {
  if (genreList.length === 0) {
    return { bestMatch: '', score: 0 };
  }

  let bestMatch = genreList[0];
  let bestScore = 0;

  for (const genre of genreList) {
    const score = getGenreSimilarity(targetGenre, genre);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = genre;
    }
  }

  return { bestMatch, score: bestScore };
}

/**
 * Get all related genres for a given genre (sorted by similarity)
 */
export function getRelatedGenres(
  genre: string,
  maxResults: number = 10
): Array<{ genre: string; score: number }> {
  const normalized = normalizeGenre(genre);
  const node = GENRE_HIERARCHY[normalized];

  const related: Array<{ genre: string; score: number }> = [];

  if (node) {
    // Add children (0.8 similarity)
    for (const child of node.children) {
      related.push({ genre: child, score: 0.8 });
    }

    // Add parent (0.8 similarity)
    if (node.parent) {
      related.push({ genre: node.parent, score: 0.8 });

      // Add siblings (0.6 similarity)
      const parentNode = GENRE_HIERARCHY[node.parent];
      if (parentNode) {
        for (const sibling of parentNode.children) {
          if (sibling !== normalized) {
            related.push({ genre: sibling, score: 0.6 });
          }
        }
      }
    }

    // Add explicitly similar genres
    for (const [similarGenre, score] of Object.entries(node.similar)) {
      related.push({ genre: similarGenre, score });
    }
  }

  // Sort by score (descending) and deduplicate
  const seen = new Set<string>();
  return related
    .filter(r => {
      if (seen.has(r.genre)) return false;
      seen.add(r.genre);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/**
 * Check if a genre exists in the hierarchy (or is a known alias)
 */
export function isKnownGenre(genre: string): boolean {
  const normalized = normalizeGenre(genre);
  return GENRE_HIERARCHY[normalized] !== undefined;
}

/**
 * Get the parent genre chain (e.g., "lo-fi house" -> ["house", "electronic"])
 */
export function getParentChain(genre: string): string[] {
  const normalized = normalizeGenre(genre);
  const chain: string[] = [];

  let current = GENRE_HIERARCHY[normalized];
  while (current?.parent) {
    chain.push(current.parent);
    current = GENRE_HIERARCHY[current.parent];
  }

  return chain;
}

// ============================================================================
// Exports
// ============================================================================

export {
  GENRE_HIERARCHY,
  GENRE_ALIASES,
};
