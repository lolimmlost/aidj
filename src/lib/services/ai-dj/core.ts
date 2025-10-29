// AI DJ Service Core
// Main orchestration logic for AI DJ recommendations

import type { Song } from '@/components/ui/audio-player';
import { generateRecommendations } from '../ollama';
import { rankRecommendations } from '../genre-matcher';
import { getOrCreateLibraryProfile } from '../library-profile';
import { ServiceError } from '../../utils';
import { 
  checkQueueThreshold,
  extractSongContext,
  buildRecentQueueContext,
  buildExtendedContext,
  generatePromptVariations,
  type AIContext
} from './context-builder';
import { matchRecommendationsToLibrary, type RecommendationWithScore } from './recommendation-matcher';
import { getArtistRecommendationStats } from './artist-tracker';

// AI DJ configuration
const AI_DJ_COOLDOWN_MS = 30000; // 30 seconds minimum between queue operations
const AI_DJ_RECOMMENDATION_TIMEOUT_MS = 10000; // 10 seconds timeout for fetching recommendations

export interface AIDJQueueMetadata {
  aiQueued: boolean;
  queuedAt: number;
  queuedBy: 'ai-dj';
}

/**
 * Generate contextual AI DJ recommendations based on current playback
 * @param context - Current song and recent queue context
 * @param batchSize - Number of songs to recommend (1-10)
 * @param userId - User ID for personalization
 * @param useFeedbackForPersonalization - Whether to use feedback data
 * @returns Array of recommended songs with genre scoring
 */
export async function generateContextualRecommendations(
  context: AIContext,
  batchSize: number,
  userId?: string,
  useFeedbackForPersonalization: boolean = true,
  excludeSongIds: string[] = [],
  excludeArtists: string[] = []
): Promise<Song[]> {
  try {
    let attempts = 0;
    const maxAttempts = 3;
    let lastError: Error | null = null;
    let lastData: unknown = null;

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`🎯 AI DJ recommendation attempt ${attempts}/${maxAttempts}`);

      // Build AI prompt with current context
      const currentContext = extractSongContext(context.currentSong);
      const recentContext = buildRecentQueueContext(context.recentQueue);
      
      // Add extended context if available
      const extendedContext = context.fullPlaylist && context.currentSongIndex !== undefined
        ? buildExtendedContext(context.fullPlaylist, context.currentSongIndex, excludeSongIds)
        : '';

      // Add excluded songs and artists to prompt for AI awareness
      const excludeText = excludeSongIds.length > 0
        ? `IMPORTANT: Do NOT recommend these songs that were recently suggested: ${excludeSongIds.join(', ')}.`
        : '';
      
      const excludeArtistsText = excludeArtists.length > 0
        ? `CRITICAL: Do NOT recommend any songs by these artists (they were recently played): ${excludeArtists.join(', ')}.`
        : '';

      // Get varied prompts and select one with time-based randomization
      const promptVariations = generatePromptVariations(context.currentSong);
      const timeSeed = Date.now() % 1000;
      const randomIndex = (Math.random() * 1000 + timeSeed) % promptVariations.length;
      const selectedPrompt = promptVariations[Math.floor(randomIndex)];

      const prompt = [
        currentContext,
        recentContext,
        extendedContext,
        excludeText,
        excludeArtistsText,
        selectedPrompt,
        `Focus on maintaining the current mood and energy level while ensuring variety.`,
      ].filter(Boolean).join('. ');

      console.log(`🎵 AI DJ generating recommendations with prompt ${attempts}:`, prompt);

      // Generate recommendations with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_DJ_RECOMMENDATION_TIMEOUT_MS);

      let recommendations;
      try {
        recommendations = await generateRecommendations({
          prompt,
          userId,
          useFeedbackForPersonalization,
          excludeArtists,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Validate recommendations by checking if songs exist in library
      if (recommendations && recommendations.recommendations && recommendations.recommendations.length > 0) {
        // Try to validate recommendations by checking if they exist in library
        let foundInLibrary = 0;
        const validatedRecommendations = [];
        
        for (const rec of recommendations.recommendations) {
          try {
            // Simple validation - check if we can find the song in the library
            // This is a basic check, full validation happens in the dashboard
            const parts = rec.song.split(' - ');
            
            if (parts.length >= 2) {
              const artistPart = parts[0].trim().toLowerCase();
              const titlePart = parts.slice(1).join(' - ').trim().toLowerCase();
              
              // If we have both artist and title, consider it potentially valid
              if (artistPart && titlePart) {
                foundInLibrary++;
                validatedRecommendations.push(rec);
              }
            } else {
              // Single name recommendations are less likely to be valid but still count
              validatedRecommendations.push(rec);
            }
          } catch (error) {
            console.log(`⚠️ Validation error for ${rec.song}:`, error);
            validatedRecommendations.push(rec);
          }
        }

        // If at least 2 recommendations seem valid, accept these recommendations
        if (foundInLibrary >= 2 || validatedRecommendations.length >= 3) {
          console.log(`✅ AI DJ: Accepting recommendations with ${foundInLibrary} potential library matches`);
          recommendations.recommendations = validatedRecommendations;
          lastData = recommendations;
          break; // Exit the retry loop
        }

        // If too few matches, try again with a different prompt
        console.log(`🔄 Only ${foundInLibrary} songs potentially in the library, regenerating...`);
        lastData = recommendations;
        
        // Small delay before retry
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        lastError = new Error('No recommendations returned from AI');
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // If all attempts failed, use the last result or throw an error
    if (lastData) {
      console.log(`⚠️ AI DJ: Using best available recommendations after ${attempts} attempts`);
      const recommendations = lastData as { recommendations: RecommendationWithScore[] };
      
      if (!recommendations || recommendations.recommendations.length === 0) {
        console.warn('⚠️ AI DJ: No recommendations returned from Ollama');
        throw new ServiceError('AI_DJ_NO_RECOMMENDATIONS', 'AI DJ could not generate recommendations');
      }

      // Apply genre filtering and ranking (Story 3.7 integration)
      let rankedRecommendations: RecommendationWithScore[] = recommendations.recommendations;
      if (userId) {
        try {
          const libraryProfile = await getOrCreateLibraryProfile(userId);
          rankedRecommendations = await rankRecommendations(
            libraryProfile,
            recommendations.recommendations
          );

          // Filter out low-scoring recommendations (< 0.4 similarity)
          // Add genreScore to recommendations if not present
          const scoredRecommendations = rankedRecommendations.map(rec => ({
            ...rec,
            genreScore: (rec as RecommendationWithScore).genreScore || 0.5
          }));
          
          rankedRecommendations = scoredRecommendations.filter(
            rec => rec.genreScore !== undefined && rec.genreScore >= 0.4
          );

          console.log(`✅ AI DJ: Genre filtering - ${rankedRecommendations.length}/${recommendations.recommendations.length} recommendations passed (avg score: ${(rankedRecommendations.reduce((sum, r) => sum + (r.genreScore || 0), 0) / rankedRecommendations.length).toFixed(2)})`);
        } catch (error) {
          console.warn('⚠️ AI DJ: Genre filtering failed, using raw recommendations', error);
          // Fallback to basic recommendations without filtering
          // Convert raw recommendations to expected format
          rankedRecommendations = recommendations.recommendations.map((rec: RecommendationWithScore) => ({
            song: rec.song,
            explanation: rec.explanation || '',
            genreScore: 0.5 // Default score when filtering fails
          }));
        }
      }

      // Match recommendations to library songs
      const recommendedSongs = await matchRecommendationsToLibrary(
        rankedRecommendations,
        batchSize,
        context,
        excludeSongIds,
        excludeArtists
      );

      if (recommendedSongs.length === 0) {
        throw new ServiceError('AI_DJ_NO_MATCHES', 'AI DJ could not match recommendations to library songs and no fallback songs available');
      }

      console.log(`🎵 AI DJ: Successfully generated ${recommendedSongs.length} contextual recommendations`);
      return recommendedSongs;
    } else {
      throw lastError || new Error('Failed to generate AI DJ recommendations after multiple attempts');
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServiceError('AI_DJ_TIMEOUT', 'AI DJ recommendation request timed out');
    }

    throw new ServiceError(
      'AI_DJ_GENERATION_ERROR',
      `Failed to generate AI DJ recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if enough time has passed since last AI DJ queue operation
 * @param lastQueueTime - Timestamp of last queue operation
 * @param cooldownMs - Cooldown period in milliseconds
 * @returns true if cooldown has passed
 */
export function checkCooldown(lastQueueTime: number, cooldownMs: number = AI_DJ_COOLDOWN_MS): boolean {
  return Date.now() - lastQueueTime >= cooldownMs;
}

/**
 * Queue AI DJ recommendations to the audio store
 * This function should be called by the audio store to add songs
 * @param recommendations - Songs to add to queue
 * @returns Metadata for queued songs
 */
export function prepareAIDJQueueMetadata(recommendations: Song[]): AIDJQueueMetadata[] {
  const now = Date.now();
  return recommendations.map(() => ({
    aiQueued: true,
    queuedAt: now,
    queuedBy: 'ai-dj' as const,
  }));
}

// Re-export functions from other modules for backward compatibility
export { checkQueueThreshold, getArtistRecommendationStats };