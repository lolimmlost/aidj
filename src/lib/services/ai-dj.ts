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
  fullPlaylist?: Song[];
  currentSongIndex?: number;
}

// Extended recommendation type with genreScore
interface RecommendationWithScore {
  song: string;
  explanation: string;
  genreScore?: number;
}

export interface AIDJQueueMetadata {
  aiQueued: boolean;
  queuedAt: number;
  queuedBy: 'ai-dj';
}

// Track artist recommendation frequency across sessions
interface ArtistRecommendationTracker {
  artist: string;
  lastRecommended: number;
  countToday: number;
  countThisSession: number;
  cooldownUntil: number; // New field for artist cooldown
}

// In-memory tracker for artist recommendations
const artistRecommendationTracker = new Map<string, ArtistRecommendationTracker>();

/**
 * Check if artist has been recommended too frequently
 * @param artist - Artist name to check
 * @returns true if artist should be avoided for variety
 */
function shouldAvoidArtist(artist: string): boolean {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000); // 24 hours ago
  const eightHoursAgo = now - (8 * 60 * 60 * 1000); // Increased from 4 to 8 hours for cooldown
  const tracker = artistRecommendationTracker.get(artist);
  
  if (!tracker) {
    // First time seeing this artist
    artistRecommendationTracker.set(artist, {
      artist,
      lastRecommended: now,
      countToday: 1,
      countThisSession: 1,
      cooldownUntil: now + eightHoursAgo, // Set initial cooldown for 8 hours
    });
    return false;
  }
  
  // Check if artist is in cooldown period
  if (now < tracker.cooldownUntil) {
    console.log(`🎵 Artist "${artist}" is in cooldown until ${new Date(tracker.cooldownUntil).toLocaleTimeString()}`);
    return true;
  }
  
  // Update tracking
  const isNewDay = now > tracker.lastRecommended + oneDayAgo;
  const countToday = isNewDay ? 1 : tracker.countToday + 1;
  const countSession = tracker.countThisSession + 1;
  
  artistRecommendationTracker.set(artist, {
    artist,
    lastRecommended: now,
    countToday,
    countThisSession: countSession,
    cooldownUntil: now + eightHoursAgo, // Reset cooldown for 8 hours
  });
  
  // Much stricter avoidance rules:
  // - Recommended 1+ times today (reduced from 2)
  // - Recommended 1+ times in current session (same)
  // - Last recommended within last 8 hours (increased from 4)
  
  return countToday >= 1 || countSession >= 1;
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
  
  // Extract genres/keywords from recent songs if available
  // Note: Song type doesn't have genre property, so we'll use artist diversity instead
  const genres = [...new Set(recentSongs.map(s => s.artist).filter(Boolean))];
  const genreSummary = genres.slice(0, 3).join(', ');
  
  // Calculate energy/mood diversity
  const uniqueArtists = artists.length;
  const diversityScore = uniqueArtists / recentSongs.length;
  
  let context = `Recently played: ${artistSummary}`;
  if (genreSummary) {
    context += ` (genres: ${genreSummary})`;
  }
  context += `. Artist diversity: ${(diversityScore * 100).toFixed(0)}%`;
  
  return context;
}

/**
 * Build extended context from full playback history for better variety
 * @param fullPlaylist - Complete playlist history
 * @param currentSongIndex - Current position
 * @param excludeSongIds - Songs to exclude
 * @returns Extended context string
 */
function buildExtendedContext(fullPlaylist: Song[], currentSongIndex: number, excludeSongIds: string[] = []): string {
  if (fullPlaylist.length === 0) {
    return '';
  }
  
  // Analyze broader listening patterns
  const allPlayedSongs = fullPlaylist.slice(0, currentSongIndex + 1);
  const upcomingSongs = fullPlaylist.slice(currentSongIndex + 1);
  
  // Get most frequent artists in session
  const artistCounts = new Map<string, number>();
  allPlayedSongs.forEach(song => {
    const artist = song.artist || 'Unknown';
    artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
  });
  
  const topArtists = Array.from(artistCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([artist]) => artist);
  
  // Check for artist repetition
  const currentArtist = fullPlaylist[currentSongIndex]?.artist;
  const sameArtistCount = allPlayedSongs.filter(s => s.artist === currentArtist).length;
  
  // Build context string
  let context = '';
  
  if (topArtists.length > 0) {
    context += `Session favorites: ${topArtists.join(', ')}. `;
  }
  
  if (currentArtist && sameArtistCount > 1) {
    context += `${currentArtist} played ${sameArtistCount} times this session. `;
  }
  
  if (upcomingSongs.length > 0) {
    const upcomingArtists = [...new Set(upcomingSongs.slice(0, 5).map(s => s.artist).filter(Boolean))];
    if (upcomingArtists.length > 0) {
      context += `Upcoming: ${upcomingArtists.slice(0, 3).join(', ')}. `;
    }
  }
  
  if (excludeSongIds.length > 0) {
    context += `Need to avoid ${excludeSongIds.length} recently suggested songs. `;
  }
  
  return context;
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
    // Build AI prompt with current context
    const currentContext = extractSongContext(context.currentSong);
    const recentContext = buildRecentQueueContext(context.recentQueue);
    
    // Add extended context if available
    const extendedContext = context.fullPlaylist && context.currentSongIndex !== undefined
      ? buildExtendedContext(context.fullPlaylist, context.currentSongIndex, excludeSongIds)
      : '';

    // Add excluded songs and artists to the prompt for AI awareness
    const excludeText = excludeSongIds.length > 0
      ? `IMPORTANT: Do NOT recommend these songs that were recently suggested: ${excludeSongIds.join(', ')}.`
      : '';
    
    const excludeArtistsText = excludeArtists.length > 0
      ? `CRITICAL: Do NOT recommend any songs by these artists (they were recently played): ${excludeArtists.join(', ')}.`
      : '';

    const prompt = [
      currentContext,
      recentContext,
      extendedContext,
      excludeText,
      excludeArtistsText,
      `Recommend ${batchSize} similar songs from my library that match this vibe and flow naturally after the current song.`,
      'Focus on maintaining the current mood and energy level while ensuring variety.',
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
        excludeArtists,
      });
    } finally {
      clearTimeout(timeoutId);
    }

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
        rankedRecommendations = recommendations.recommendations.map(rec => ({
          song: rec.song,
          explanation: rec.explanation || '',
          genreScore: 0.5 // Default score when filtering fails
        }));
      }
    }

    // Convert recommendation names to actual Song objects
    const recommendedSongs: Song[] = [];
    const allSongs = await getSongsGlobal(0, 1500); // Increased sample size for better variety
    
    console.log(`🎵 Excluded artists:`, excludeArtists);
    console.log(`🎵 Original recommendations count:`, rankedRecommendations.length);
    
    // Get list of artists to avoid for diversity
    const artistsToAvoid = new Set<string>();
    for (const [artist, tracker] of artistRecommendationTracker.entries()) {
      if (shouldAvoidArtist(artist)) {
        artistsToAvoid.add(artist.toLowerCase());
        console.log(`🚫 Artist "${artist}" in cooldown (last: ${new Date(tracker.lastRecommended).toLocaleTimeString()}, today: ${tracker.countToday}, session: ${tracker.countThisSession})`);
      }
    }
    
    // Add specific exclusions for problematic artists
    const problemArtists = ['earl sweatshirt', 'ghb'];
    problemArtists.forEach(artist => {
      if (!excludeArtists.includes(artist)) {
        excludeArtists.push(artist);
        console.log(`🚫 Added problem artist to exclusion list: "${artist}"`);
      }
    });
    
    // Filter out excluded songs and artists from the recommendations
    const filteredRecommendations = rankedRecommendations.filter(rec => {
      const recLower = rec.song.toLowerCase();
      
      // Extract artist from recommendation if in "Artist - Title" format
      const recArtist = recLower.split(' - ')[0]?.trim();
      
      // Skip if artist is in cooldown/avoid list
      // Skip if artist is in explicit exclude list
      if (recArtist && excludeArtists.some(excluded => recArtist.includes(excluded.toLowerCase()))) {
        console.log(`🚫 Skipping recommendation "${rec.song}" - artist "${recArtist}" is explicitly excluded`);
        return false;
      }
      if (recArtist && artistsToAvoid.has(recArtist)) {
        console.log(`🚫 Skipping recommendation "${rec.song}" - artist "${recArtist}" is in cooldown`);
        return false;
      }
      
      // Additional check for problematic artists that might be spelled differently
      if (recArtist && problemArtists.some(problem => recArtist.includes(problem))) {
        console.log(`🚫 Skipping recommendation "${rec.song}" - artist "${recArtist}" matches problem artist pattern`);
        return false;
      }
      
      // Check if this recommendation matches any excluded song
      return !excludeSongIds.some(excludeId => {
        const song = allSongs.find(s => s.id === excludeId);
        if (!song) return false;
        
        const songTitle = (song.title || song.name || '').toLowerCase();
        const songArtist = (song.artist || '').toLowerCase();
        
        // Check if recommendation matches excluded song by title/artist
        return recLower.includes(songTitle) ||
               recLower.includes(songArtist) ||
               songTitle.includes(recLower) ||
               songArtist.includes(recLower);
      });
    });
    
    for (const rec of filteredRecommendations.slice(0, batchSize)) {
      try {
        // Enhanced song matching with multiple strategies and better fallbacks
        let matchedSong: Song | undefined;
        const recLower = rec.song.toLowerCase();
        
        // Strategy 1: Exact name match
        matchedSong = allSongs.find(s => {
          const songName = (s.name || s.title || '').toLowerCase();
          return songName === recLower;
        });
        
        // Strategy 2: Partial name match (contains)
        if (!matchedSong) {
          matchedSong = allSongs.find(s => {
            const songName = (s.name || s.title || '').toLowerCase();
            return songName.includes(recLower) || recLower.includes(songName);
          });
        }
        
        // Strategy 3: Try to parse "Artist - Title" format and match by artist
        if (!matchedSong && rec.song.includes(' - ')) {
          const [artistPart, titlePart] = rec.song.split(' - ');
          const artist = artistPart.trim().toLowerCase();
          const title = titlePart.trim().toLowerCase();
          
          matchedSong = allSongs.find(s => {
            const songArtist = (s.artist || '').toLowerCase();
            const songName = (s.name || s.title || '').toLowerCase();
            return songArtist.includes(artist) && songName.includes(title);
          });
        }
        
        // Strategy 4: Fuzzy match by word similarity
        if (!matchedSong) {
          const recWords = recLower.split(/\s+/);
          const bestMatch = allSongs.find(s => {
            const songName = (s.name || s.title || '').toLowerCase();
            const songWords = songName.split(/\s+/);
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
        
        // Strategy 5: Artist-based fallback with better matching
        if (!matchedSong) {
          const recWords = recLower.split(/\s+/);
          const artistCandidates = allSongs.filter(s => {
            const songArtist = (s.artist || '').toLowerCase();
            // Check if any word from recommendation matches artist name
            return recWords.some(word =>
              word.length > 2 && songArtist.includes(word)
            );
          });
          
          // Prefer songs with title similarity if available
          if (artistCandidates.length > 1) {
            const titleCandidates = artistCandidates.filter(s => {
              const songName = (s.name || s.title || '').toLowerCase();
              const songWords = songName.split(/\s+/);
              return recWords.some(word =>
                word.length > 2 && songWords.some(songWord =>
                  songWord.includes(word) || word.includes(songWord)
                )
              );
            });
            
            if (titleCandidates.length > 0) {
              matchedSong = titleCandidates[0];
            } else {
              matchedSong = artistCandidates[0];
            }
          } else if (artistCandidates.length === 1) {
            matchedSong = artistCandidates[0];
          }
          
          if (matchedSong) {
            console.log(`🎵 AI DJ: Using enhanced artist match for "${rec.song}" -> "${matchedSong.name || matchedSong.title}" by ${matchedSong.artist}`);
          }
        }
        
        // Strategy 6: Diverse fallback - pick from underrepresented artists
        if (!matchedSong) {
          // Get artist distribution in current recommendations
          const currentArtists = recommendedSongs.map(s => s.artist).filter((a): a is string => !!a);
          const artistCounts = new Map<string, number>();
          currentArtists.forEach(artist => {
            artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
          });
          
          // Find songs from artists with minimal representation
          const diverseCandidates = allSongs.filter(s => {
            const artist = s.artist;
            if (!artist) return false;
            
            const count = artistCounts.get(artist) || 0;
            // Prefer artists with 0 or 1 recommendations so far
            return count <= 1;
          });
          
          if (diverseCandidates.length > 0) {
            // Randomly select from diverse candidates
            matchedSong = diverseCandidates[Math.floor(Math.random() * diverseCandidates.length)];
            console.log(`🎵 AI DJ: Using diverse fallback for "${rec.song}" -> "${matchedSong.name || matchedSong.title}" by ${matchedSong.artist}`);
          }
        }

        if (matchedSong) {
          // Check if this song is already in the recommended songs to avoid duplicates
          const isDuplicate = recommendedSongs.some(existing =>
            existing.id === matchedSong.id ||
            (existing.name || existing.title) === (matchedSong.name || matchedSong.title)
          );
          
          if (!isDuplicate) {
            // Update artist tracking when we successfully match and recommend a song
            const artist = matchedSong.artist;
            if (artist) {
              // Force update the artist tracker to mark this artist as recently recommended
              shouldAvoidArtist(artist); // This will update the cooldown
            }
            
            recommendedSongs.push(matchedSong);
            console.log(`✅ AI DJ: Matched "${rec.song}" to "${matchedSong.name || matchedSong.title}" by ${matchedSong.artist}`);
          } else {
            console.log(`⚠️ AI DJ: Skipping duplicate song "${matchedSong.name || matchedSong.title}"`);
          }
        } else {
          console.warn(`⚠️ AI DJ: Could not find song "${rec.song}" in library`);
        }
      } catch (error) {
        console.warn(`⚠️ AI DJ: Error matching song "${rec.song}":`, error);
      }
    }

    // If we don't have enough matches, try to get more diverse songs from library as fallback
    if (recommendedSongs.length < batchSize) {
      const neededSongs = batchSize - recommendedSongs.length;
      console.warn(`⚠️ AI DJ: Need ${neededSongs} more songs, using smart fallback from library`);
      try {
        // Get more songs for better variety
        const fallbackSongs = await getSongsGlobal(0, Math.min(batchSize * 5, 100)); // Increased sample size
        
        if (fallbackSongs.length > 0) {
          // Filter out songs already recommended and get diverse artists
          const existingIds = new Set(recommendedSongs.map(s => s.id));
          const existingArtists = new Set(recommendedSongs.map(s => s.artist?.toLowerCase()).filter(Boolean));
          
          // Smart fallback with relevance scoring
          const currentArtist = context.currentSong.artist?.toLowerCase() || '';
          const currentTitle = (context.currentSong.title || context.currentSong.name || '').toLowerCase();
          
          // Score fallback songs based on relevance to current song
          const scoredFallback = fallbackSongs
            .filter(song => !existingIds.has(song.id))
            .filter(song => !existingArtists.has(song.artist?.toLowerCase()))
            .map(song => {
              let score = Math.random(); // Base randomness
              
              // Boost score for artists with similar style (but not same artist)
              const songArtist = song.artist?.toLowerCase() || '';
              if (songArtist !== currentArtist) {
                // Simple heuristic: if artist names share words, might be similar style
                const currentWords = currentArtist.split(/\s+/);
                const songWords = songArtist.split(/\s+/);
                const commonWords = currentWords.filter(word =>
                  word.length > 2 && songWords.some(songWord =>
                    songWord.includes(word) || word.includes(songWord)
                  )
                );
                if (commonWords.length > 0) {
                  score += 0.2; // Boost for similar style
                }
              }
              
              // Boost score for songs with similar title keywords
              const titleWords = (song.title || song.name || '').toLowerCase().split(/\s+/);
              const currentTitleWords = currentTitle.split(/\s+/);
              const titleMatches = currentTitleWords.filter(word =>
                word.length > 2 && titleWords.some(titleWord =>
                  titleWord.includes(word) || word.includes(titleWord)
                )
              );
              if (titleMatches.length > 0) {
                score += 0.1; // Small boost for title similarity
              }
              
              return { song, score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, neededSongs)
            .map(item => item.song);
          
          recommendedSongs.push(...scoredFallback);
          console.log(`🎵 AI DJ: Added ${scoredFallback.length} smart fallback songs from library (relevance-scored)`);
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
// Export artist tracking stats for use in Ollama service
export function getArtistRecommendationStats() {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  
  const recentArtists: string[] = [];
  const overRecommendedArtists: string[] = [];
  const cooledDownArtists: string[] = [];
  
  for (const [artist, tracker] of artistRecommendationTracker.entries()) {
    if (now - tracker.lastRecommended < oneDayAgo) {
      // Still within last day
      if (tracker.countToday > 0) {
        recentArtists.push(artist);
      }
    } else {
      // Older than a day, check if over-recommended
      if (tracker.countToday >= 2 || tracker.countThisSession >= 1) {
        overRecommendedArtists.push(artist);
      }
    }
    
    // Check cooldown status
    if (now >= tracker.cooldownUntil) {
      cooledDownArtists.push(artist);
    }
  }
  
  return {
    recentArtists,
    overRecommendedArtists,
    cooledDownArtists,
  };
}

export function prepareAIDJQueueMetadata(recommendations: Song[]): AIDJQueueMetadata[] {
  const now = Date.now();
  return recommendations.map(() => ({
    aiQueued: true,
    queuedAt: now,
    queuedBy: 'ai-dj' as const,
  }));
}
