// AI DJ Service for automatic queue management
// Story 3.9: AI DJ Toggle Mode

import type { Song } from '@/components/ui/audio-player';
import { generateRecommendations } from './ollama';
import { rankRecommendations } from './genre-matcher';
import { getOrCreateLibraryProfile } from './library-profile';
import { ServiceError } from '../utils';
import { getSongsGlobal } from './navidrome';

// AI DJ configuration
const AI_DJ_COOLDOWN_MS = 30000; // 30 seconds minimum between queue operations
const AI_DJ_RECOMMENDATION_TIMEOUT_MS = 10000; // 10 seconds timeout for fetching recommendations

export interface AIContext {
  currentSong: Song;
  recentQueue: Song[];
}

export interface AIDJQueueMetadata {
  aiQueued: boolean;
  queuedAt: number;
  queuedBy: 'ai-dj';
}

/**
 * Check if queue needs refill based on remaining songs vs threshold
 * @param currentSongIndex - Current position in playlist
 * @param playlistLength - Total songs in playlist
 * @param threshold - Number of songs remaining that triggers refill (1-5)
 * @returns true if queue needs more songs
 */
export function checkQueueThreshold(
  currentSongIndex: number,
  playlistLength: number,
  threshold: number
): boolean {
  const remainingSongs = playlistLength - currentSongIndex - 1;
  return remainingSongs <= threshold;
}

/**
 * Extract context from current song for AI prompt generation
 * @param song - Currently playing song
 * @returns Context string for AI prompt
 */
function extractSongContext(song: Song): string {
  const artist = song.artist || 'Unknown Artist';
  const title = song.title || song.name || 'Unknown Title';
  const album = song.album || '';

  let context = `Currently playing: "${title}" by ${artist}`;
  if (album) {
    context += ` from album "${album}"`;
  }

  return context;
}

/**
 * Build context from recent queue history
 * @param recentQueue - Last N songs in queue
 * @param limit - Max songs to analyze (default: 5)
 * @returns Context summary string
 */
function buildRecentQueueContext(recentQueue: Song[], limit: number = 5): string {
  if (recentQueue.length === 0) {
    return '';
  }

  const recentSongs = recentQueue.slice(-limit);
  const artists = [...new Set(recentSongs.map(s => s.artist || 'Unknown').filter(Boolean))];
  const artistSummary = artists.slice(0, 3).join(', ');

  return `Recently played: ${artistSummary}`;
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
  useFeedbackForPersonalization: boolean = true
): Promise<Song[]> {
  try {
    // Build AI prompt with current context
    const currentContext = extractSongContext(context.currentSong);
    const recentContext = buildRecentQueueContext(context.recentQueue);

    const prompt = [
      currentContext,
      recentContext,
      `Recommend ${batchSize} similar songs from my library that match this vibe and flow naturally after the current song.`,
      'Focus on maintaining the current mood and energy level.',
    ].filter(Boolean).join('. ');

    console.log('🎵 AI DJ generating recommendations with context:', prompt);

    // Generate recommendations with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_DJ_RECOMMENDATION_TIMEOUT_MS);

    let recommendations;
    try {
      recommendations = await generateRecommendations({
        prompt,
        userId,
        useFeedbackForPersonalization,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!recommendations || recommendations.recommendations.length === 0) {
      console.warn('⚠️ AI DJ: No recommendations returned from Ollama');
      throw new ServiceError('AI_DJ_NO_RECOMMENDATIONS', 'AI DJ could not generate recommendations');
    }

    // Apply genre filtering and ranking (Story 3.7 integration)
    let rankedRecommendations = recommendations.recommendations;
    if (userId) {
      try {
        const libraryProfile = await getOrCreateLibraryProfile(userId);
        rankedRecommendations = await rankRecommendations(
          recommendations.recommendations,
          libraryProfile
        );

        // Filter out low-scoring recommendations (< 0.4 similarity)
        rankedRecommendations = rankedRecommendations.filter(
          rec => rec.genreScore >= 0.4
        );

        console.log(`✅ AI DJ: Genre filtering - ${rankedRecommendations.length}/${recommendations.recommendations.length} recommendations passed (avg score: ${(rankedRecommendations.reduce((sum, r) => sum + r.genreScore, 0) / rankedRecommendations.length).toFixed(2)})`);
      } catch (error) {
        console.warn('⚠️ AI DJ: Genre filtering failed, using raw recommendations', error);
        // Fallback to basic recommendations without filtering
        // Convert raw recommendations to expected format
        rankedRecommendations = recommendations.recommendations.map(rec => ({
          song: rec.song,
          explanation: rec.explanation || '',
          genreScore: 0.5 // Default score when filtering fails
        }));
      }
    }

    // Convert recommendation names to actual Song objects
    const recommendedSongs: Song[] = [];
    const allSongs = await getSongsGlobal(0, 1000); // Get larger sample to find matches
    
    for (const rec of rankedRecommendations.slice(0, batchSize)) {
      try {
        // Improved song matching with multiple strategies
        let matchedSong: Song | undefined;
        
        // Strategy 1: Exact name match
        matchedSong = allSongs.find(s =>
          s.name.toLowerCase() === rec.song.toLowerCase() ||
          (s.title && s.title.toLowerCase() === rec.song.toLowerCase())
        );
        
        // Strategy 2: Partial name match (contains)
        if (!matchedSong) {
          matchedSong = allSongs.find(s =>
            s.name.toLowerCase().includes(rec.song.toLowerCase()) ||
            rec.song.toLowerCase().includes(s.name.toLowerCase()) ||
            (s.title && s.title.toLowerCase().includes(rec.song.toLowerCase())) ||
            rec.song.toLowerCase().includes(s.title?.toLowerCase() || '')
          );
        }
        
        // Strategy 3: Try to parse "Artist - Title" format and match by artist
        if (!matchedSong && rec.song.includes(' - ')) {
          const [artistPart, titlePart] = rec.song.split(' - ');
          const artist = artistPart.trim().toLowerCase();
          const title = titlePart.trim().toLowerCase();
          
          matchedSong = allSongs.find(s =>
            s.artist?.toLowerCase().includes(artist) && (
              s.name.toLowerCase().includes(title) ||
              (s.title && s.title.toLowerCase().includes(title))
            )
          );
        }
        
        // Strategy 4: Fuzzy match by word similarity
        if (!matchedSong) {
          const recWords = rec.song.toLowerCase().split(/\s+/);
          const bestMatch = allSongs.find(s => {
            const songWords = (s.name || s.title || '').toLowerCase().split(/\s+/);
            const commonWords = recWords.filter(word =>
              word.length > 2 && songWords.some(songWord =>
                songWord.includes(word) || word.includes(songWord)
              )
            );
            return commonWords.length >= Math.min(2, recWords.length);
          });
          
          if (bestMatch) {
            matchedSong = bestMatch;
          }
        }
        
        // Strategy 5: Last resort - get any song from the same artist if artist is mentioned
        if (!matchedSong) {
          const recLower = rec.song.toLowerCase();
          const artistMatch = allSongs.find(s =>
            s.artist?.toLowerCase().split(/\s+/).some(artistWord =>
              recLower.includes(artistWord) && artistWord.length > 2
            )
          );
          
          if (artistMatch) {
            matchedSong = artistMatch;
            console.log(`🎵 AI DJ: Using fallback artist match for "${rec.song}" -> "${artistMatch.name}" by ${artistMatch.artist}`);
          }
        }

        if (matchedSong) {
          recommendedSongs.push(matchedSong);
          console.log(`✅ AI DJ: Matched "${rec.song}" to "${matchedSong.name}" by ${matchedSong.artist}`);
        } else {
          console.warn(`⚠️ AI DJ: Could not find song "${rec.song}" in library`);
        }
      } catch (error) {
        console.warn(`⚠️ AI DJ: Error matching song "${rec.song}":`, error);
      }
    }

    // If we still have no matches, try to get any songs from library as fallback
    if (recommendedSongs.length === 0) {
      console.warn('⚠️ AI DJ: No exact matches found, using fallback songs from library');
      try {
        const fallbackSongs = await getSongsGlobal(0, Math.min(batchSize, 10));
        if (fallbackSongs.length > 0) {
          // Shuffle and take requested amount
          const shuffled = fallbackSongs.sort(() => Math.random() - 0.5);
          recommendedSongs.push(...shuffled.slice(0, batchSize));
          console.log(`🎵 AI DJ: Using ${recommendedSongs.length} fallback songs from library`);
        }
      } catch (error) {
        console.error('⚠️ AI DJ: Failed to get fallback songs:', error);
      }
    }

    if (recommendedSongs.length === 0) {
      throw new ServiceError('AI_DJ_NO_MATCHES', 'AI DJ could not match recommendations to library songs and no fallback songs available');
    }

    console.log(`🎵 AI DJ: Successfully generated ${recommendedSongs.length} contextual recommendations`);
    return recommendedSongs;

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
