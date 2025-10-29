// Context Builder for AI DJ
// Builds context from current song and queue history for AI recommendations

import type { Song } from '@/components/ui/audio-player';

export interface AIContext {
  currentSong: Song;
  recentQueue: Song[];
  fullPlaylist?: Song[];
  currentSongIndex?: number;
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
export function extractSongContext(song: Song): string {
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
export function buildRecentQueueContext(recentQueue: Song[], limit: number = 5): string {
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
export function buildExtendedContext(fullPlaylist: Song[], currentSongIndex: number, excludeSongIds: string[] = []): string {
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
 * Generate contextual prompts based on song characteristics
 * @param currentSong - Currently playing song
 * @returns Array of prompt variations
 */
export function generatePromptVariations(currentSong: Song): string[] {
  const artist = currentSong.artist || 'Unknown Artist';
  const title = currentSong.title || currentSong.name || 'Unknown Title';
  
  // Analyze current song's characteristics
  const isUpbeat = /\b(up|energetic|dance|party|fast|club|remix)\b/i.test(title) ||
                  /\b(up|energetic|dance|party|fast|club|remix)\b/i.test(artist);
  
  const isChill = /\b(chill|relax|slow|acoustic|unplugged|ambient)\b/i.test(title) ||
                 /\b(chill|relax|slow|acoustic|unplugged|ambient)\b/i.test(artist);
  
  const isRock = /\b(rock|guitar|band|metal|punk|indie)\b/i.test(title) ||
               /\b(rock|guitar|band|metal|punk|indie)\b/i.test(artist);
  
  const isElectronic = /\b(electronic|edm|techno|house|dubstep|synth)\b/i.test(title) ||
                     /\b(electronic|edm|techno|house|dubstep|synth)\b/i.test(artist);
  
  const isHipHop = /\b(hip hop|rap|trap|drill|freestyle)\b/i.test(title) ||
                 /\b(hip hop|rap|trap|drill|freestyle)\b/i.test(artist);
  
  // Select appropriate prompt set based on song characteristics
  if (isUpbeat) {
    return [
      `Find high-energy songs similar to "${title}" by ${artist} that maintain upbeat vibe and flow naturally in a party or workout setting`,
      `Recommend energetic tracks that match the intensity of "${title}" and keep momentum going`,
      `Suggest dance-worthy songs with similar energy levels to "${title}" by ${artist}`,
      `Find upbeat tracks that complement the current high-energy mood of "${title}"`,
      `Recommend songs with driving beats and positive energy similar to "${title}"`,
      `Find tracks that maintain the party atmosphere started by "${title}"`
    ];
  } else if (isChill) {
    return [
      `Find relaxing songs similar to "${title}" by ${artist} that maintain chill vibe and flow naturally in a laid-back setting`,
      `Recommend mellow tracks that match the contemplative mood of "${title}"`,
      `Suggest ambient songs with similar energy levels to "${title}" by ${artist}`,
      `Find calming tracks that complement the current relaxed mood of "${title}"`,
      `Recommend songs with gentle rhythms and soothing tones similar to "${title}"`,
      `Find tracks that maintain the peaceful atmosphere started by "${title}"`
    ];
  } else if (isRock) {
    return [
      `Find rock songs similar to "${title}" by ${artist} that maintain guitar-driven energy and flow naturally in a rock setting`,
      `Recommend tracks with similar rock instrumentation to "${title}" by ${artist}`,
      `Suggest songs with comparable rock energy and style to "${title}"`,
      `Find tracks that complement the current rock mood of "${title}"`,
      `Recommend songs with similar guitar riffs and rock attitude to "${title}"`,
      `Find tracks that maintain the rock atmosphere started by "${title}"`
    ];
  } else if (isElectronic) {
    return [
      `Find electronic songs similar to "${title}" by ${artist} that maintain synthesized energy and flow naturally in an electronic setting`,
      `Recommend tracks with similar electronic production to "${title}" by ${artist}`,
      `Suggest songs with comparable electronic beats and synths to "${title}"`,
      `Find tracks that complement the current electronic mood of "${title}"`,
      `Recommend songs with similar electronic texture and energy to "${title}"`,
      `Find tracks that maintain the electronic atmosphere started by "${title}"`
    ];
  } else if (isHipHop) {
    return [
      `Find hip hop songs similar to "${title}" by ${artist} that maintain rhythmic flow and lyrical style`,
      `Recommend tracks with similar hip hop production to "${title}" by ${artist}`,
      `Suggest songs with comparable hip hop beats and flow to "${title}"`,
      `Find tracks that complement the current hip hop mood of "${title}"`,
      `Recommend songs with similar hip hop rhythm and style to "${title}"`,
      `Find tracks that maintain the hip hop atmosphere started by "${title}"`
    ];
  } else {
    // Generic prompts for other genres
    return [
      `Find songs similar to "${title}" by ${artist} that match this vibe and flow naturally after the current song`,
      `Recommend tracks by artists with similar musical style to ${artist}`,
      `Suggest songs that would appeal to someone who likes "${title}" by ${artist}`,
      `Find tracks that complement the current mood of "${title}" by ${artist}`,
      `Recommend songs with similar emotional tone and energy to "${title}"`,
      `Find tracks that maintain the musical atmosphere started by "${title}"`
    ];
  }
}