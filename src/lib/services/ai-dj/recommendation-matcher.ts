// Recommendation Matcher for AI DJ
// Matches AI recommendations to library songs with multiple strategies

import type { Song } from '@/components/ui/audio-player';
import { getSongsGlobal } from '../navidrome';
import { shouldAvoidArtist } from './artist-tracker';
import { isArtistBlocked } from '../artist-blocklist';
import type { AIContext } from './context-builder';

// Extended recommendation type with genreScore
export interface RecommendationWithScore {
  song: string;
  explanation: string;
  genreScore?: number;
}

/**
 * Match AI recommendations to actual songs in the library
 * @param recommendations - AI recommendations with scores
 * @param batchSize - Number of songs to match
 * @param context - Current playback context
 * @param excludeSongIds - Song IDs to exclude
 * @param excludeArtists - Artists to exclude (from session or explicit request)
 * @param userBlocklist - Optional user blocklist for personalized filtering
 * @returns Array of matched Song objects
 */
export async function matchRecommendationsToLibrary(
  recommendations: RecommendationWithScore[],
  batchSize: number,
  context: AIContext,
  excludeSongIds: string[] = [],
  excludeArtists: string[] = [],
  userBlocklist?: Set<string>
): Promise<Song[]> {
  const recommendedSongs: Song[] = [];
  const allSongs = await getSongsGlobal(0, 2000); // Further increased sample size for maximum variety

  console.log(`🎵 Excluded artists:`, excludeArtists);
  console.log(`🎵 Original recommendations count:`, recommendations.length);

  // Get list of artists to avoid for diversity (from cooldown tracker)
  const artistsToAvoid = new Set<string>();
  for (const artist of Array.from(allSongs.map(s => s.artist).filter((a): a is string => Boolean(a)))) {
    if (shouldAvoidArtist(artist)) {
      artistsToAvoid.add(artist.toLowerCase());
    }
  }

  // Add blocklisted artists to the exclude list
  if (userBlocklist && userBlocklist.size > 0) {
    for (const blockedArtist of userBlocklist) {
      if (!excludeArtists.includes(blockedArtist)) {
        excludeArtists.push(blockedArtist);
      }
    }
    console.log(`🚫 Added ${userBlocklist.size} user-blocklisted artists to exclusion list`);
  }
  
  // Filter out excluded songs and artists from the recommendations
  const filteredRecommendations = recommendations.filter(rec => {
    const recLower = rec.song.toLowerCase();

    // Extract artist from recommendation if in "Artist - Title" format
    const recArtist = recLower.split(' - ')[0]?.trim();

    // Skip if artist is in explicit exclude list (includes user blocklist)
    if (recArtist && excludeArtists.some(excluded => recArtist.includes(excluded.toLowerCase()))) {
      console.log(`🚫 Skipping recommendation "${rec.song}" - artist "${recArtist}" is explicitly excluded`);
      return false;
    }

    // Skip if artist is in cooldown/avoid list
    if (recArtist && artistsToAvoid.has(recArtist)) {
      console.log(`🚫 Skipping recommendation "${rec.song}" - artist "${recArtist}" is in cooldown`);
      return false;
    }

    // Check against system-level blocklist patterns
    if (recArtist && isArtistBlocked(recArtist, userBlocklist)) {
      console.log(`🚫 Skipping recommendation "${rec.song}" - artist "${recArtist}" is blocklisted`);
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

  // If we don't have enough matches, try to get more diverse songs from the library as fallback
  if (recommendedSongs.length < batchSize) {
    const neededSongs = batchSize - recommendedSongs.length;
    console.warn(`⚠️ AI DJ: Need ${neededSongs} more songs, using smart fallback from library`);
    try {
      // Get more songs for better variety - significantly increased pool
      const fallbackSongs = await getSongsGlobal(0, Math.max(batchSize * 20, 200)); // Much larger sample for variety
      
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

  return recommendedSongs;
}