import type { LibraryProfile } from "@/lib/db/schema";

const GENRE_WEIGHT = 0.8; // Increased from 0.7 to prioritize genre matching
const KEYWORD_WEIGHT = 0.2; // Decreased from 0.3 to balance

/**
 * Recommendation with genre similarity score
 */
export interface ScoredRecommendation {
  song: string;
  explanation: string;
  genreScore: number;
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy keyword matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Calculate fuzzy match score between two strings (0.0-1.0)
 * Uses Levenshtein distance with contains logic fallback
 */
function fuzzyMatch(str1: string, str2: string): number {
  const lower1 = str1.toLowerCase();
  const lower2 = str2.toLowerCase();

  // Exact match
  if (lower1 === lower2) {
    return 1.0;
  }

  // Contains match
  if (lower1.includes(lower2) || lower2.includes(lower1)) {
    return 0.7;
  }

  // Fuzzy match using Levenshtein distance
  const maxLen = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(lower1, lower2);
  const similarity = 1 - distance / maxLen;

  // Only return positive score if similarity is reasonably high
  return similarity > 0.6 ? similarity * 0.5 : 0.0;
}

/**
 * Extract genres from recommendation text
 * Looks for common genre keywords in the song/explanation
 */
function extractRecommendationGenres(song: string, explanation: string): string[] {
  const text = `${song} ${explanation}`.toLowerCase();
  const genres: string[] = [];

  // Common genre keywords to look for
  const genreKeywords = [
    'rock', 'pop', 'jazz', 'classical', 'electronic', 'hip-hop', 'hip hop', 'rap',
    'country', 'blues', 'metal', 'punk', 'indie', 'alternative', 'folk', 'soul',
    'r&b', 'reggae', 'techno', 'house', 'ambient', 'experimental', 'psychedelic',
    'funk', 'disco', 'grunge', 'emo', 'ska', 'gospel', 'latin', 'world',
  ];

  for (const genre of genreKeywords) {
    if (text.includes(genre)) {
      genres.push(genre);
    }
  }

  return genres;
}

/**
 * Calculate genre similarity score between library and recommendation
 * Returns score from 0.0 (no match) to 1.0 (perfect match)
 *
 * Algorithm: Find the best matching genre from the recommendation and return its weighted score.
 * This represents "how well does this recommendation match the user's library".
 */
function calculateGenreScore(
  libraryGenres: Record<string, number>,
  recommendationGenres: string[]
): number {
  if (Object.keys(libraryGenres).length === 0 || recommendationGenres.length === 0) {
    return 0.0;
  }

  let bestOverallScore = 0;

  // For each recommendation genre, find the best match in the library
  for (const recGenre of recommendationGenres) {
    for (const [libGenre, weight] of Object.entries(libraryGenres)) {
      const lower1 = recGenre.toLowerCase();
      const lower2 = libGenre.toLowerCase();

      let matchStrength = 0;

      // Exact match
      if (lower1 === lower2) {
        matchStrength = 1.0;
      }
      // Partial match (one contains the other)
      else if (lower1.includes(lower2) || lower2.includes(lower1)) {
        matchStrength = 0.5;
      }

      // Calculate weighted score for this match
      const matchScore = weight * matchStrength;
      bestOverallScore = Math.max(bestOverallScore, matchScore);
    }
  }

  return bestOverallScore;
}

/**
 * Calculate keyword similarity score between library and recommendation
 * Returns score from 0.0 (no match) to 1.0 (perfect match)
 */
function calculateKeywordScore(
  libraryKeywords: string[],
  recommendationText: string
): number {
  if (libraryKeywords.length === 0) {
    return 0.0;
  }

  const text = recommendationText.toLowerCase();
  let matchCount = 0;

  for (const keyword of libraryKeywords) {
    // Check for exact or fuzzy match
    const score = fuzzyMatch(text, keyword);
    if (score > 0.5 || text.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }

  return matchCount / libraryKeywords.length;
}

/**
 * Calculate overall similarity score for a recommendation
 * Combines genre score (70%) and keyword score (30%)
 */
export function calculateGenreSimilarity(
  libraryProfile: LibraryProfile,
  recommendation: { song: string; explanation: string }
): number {
  // Extract genres from recommendation
  const recommendationGenres = extractRecommendationGenres(
    recommendation.song,
    recommendation.explanation
  );

  // Calculate genre score
  const genreScore = calculateGenreScore(
    libraryProfile.genreDistribution,
    recommendationGenres
  );

  // Calculate keyword score
  const recommendationText = `${recommendation.song} ${recommendation.explanation}`;
  const keywordScore = calculateKeywordScore(
    libraryProfile.topKeywords,
    recommendationText
  );

  // Combine scores with weights
  const finalScore = genreScore * GENRE_WEIGHT + keywordScore * KEYWORD_WEIGHT;

  console.log(`📊 Genre similarity score for "${recommendation.song}":`, {
    genreScore: genreScore.toFixed(2),
    keywordScore: keywordScore.toFixed(2),
    finalScore: finalScore.toFixed(2),
    recommendationGenres,
  });

  return finalScore;
}

/**
 * Rank recommendations by genre similarity score
 * Filters out recommendations below threshold and sorts by score (highest first)
 */
export function rankRecommendations(
  libraryProfile: LibraryProfile,
  recommendations: Array<{ song: string; explanation: string }>,
  threshold: number = 0.5 // Increased from 0.3 to 0.5 for stricter filtering
): ScoredRecommendation[] {
  const scored: ScoredRecommendation[] = recommendations.map(rec => ({
    song: rec.song,
    explanation: rec.explanation,
    genreScore: calculateGenreSimilarity(libraryProfile, rec),
  }));

  // Filter by threshold and sort by score (descending)
  const filtered = scored
    .filter(rec => rec.genreScore >= threshold)
    .sort((a, b) => b.genreScore - a.genreScore);
  
  // If we have too few high-scoring recommendations, relax threshold slightly
  if (filtered.length < 3) {
    const relaxedThreshold = 0.4;
    const relaxed = scored
      .filter(rec => rec.genreScore >= relaxedThreshold)
      .sort((a, b) => b.genreScore - a.genreScore);
    
    console.log(`📊 Relaxed genre threshold from ${threshold} to ${relaxedThreshold} - got ${relaxed.length} recommendations`);
    return relaxed.slice(0, 5); // Limit to top 5 even when relaxed
  }
  
  console.log(`📊 Genre filtering: ${filtered.length}/${recommendations.length} recommendations passed threshold ${threshold}`);
  return filtered.slice(0, 5); // Limit to top 5 recommendations
}
