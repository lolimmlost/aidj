// AI DJ Service Module Index
// Exports all AI DJ related functionality

// Core functionality
export {
  generateContextualRecommendations,
  checkCooldown,
  prepareAIDJQueueMetadata,
  checkQueueThreshold,
  type AIDJQueueMetadata
} from './core';

// Artist tracking
export {
  shouldAvoidArtist,
  getArtistsToAvoid,
  getArtistRecommendationStats,
  type ArtistRecommendationTracker
} from './artist-tracker';

// Context building
export {
  extractSongContext,
  buildRecentQueueContext,
  buildExtendedContext,
  generatePromptVariations,
  type AIContext
} from './context-builder';

// Recommendation matching
export {
  matchRecommendationsToLibrary,
  type RecommendationWithScore
} from './recommendation-matcher';