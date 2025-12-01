// Response parsing utilities for Ollama API
import { ServiceError } from '../../utils';

export interface RecommendationResponse {
  recommendations: { song: string; explanation: string }[];
}

export interface PlaylistSuggestion {
  song: string; // "Artist - Title"
  explanation: string;
  isDiscovery?: boolean; // Story 7.1: true if this is a discovery suggestion
}

export interface PlaylistResponse {
  playlist: PlaylistSuggestion[];
}

export function parseRecommendationsResponse(responseText: string): RecommendationResponse {
  // Clean up response: remove markdown code blocks if present
  let cleanedResponse = responseText.trim();
  if (cleanedResponse.startsWith('```json')) {
    cleanedResponse = cleanedResponse.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '');
    console.log('🧹 Removed markdown code blocks from response');
  } else if (cleanedResponse.startsWith('```')) {
    cleanedResponse = cleanedResponse.replace(/^```\s*/i, '').replace(/\s*```\s*$/, '');
    console.log('🧹 Removed markdown code blocks from response');
  }

  // Fix truncated JSON by ensuring it's complete
  if (cleanedResponse.includes('"recommendations"') && !cleanedResponse.trim().endsWith('}')) {
    // Try to fix incomplete JSON
    const openBraces = (cleanedResponse.match(/{/g) || []).length;
    const closeBraces = (cleanedResponse.match(/}/g) || []).length;
    const openBrackets = (cleanedResponse.match(/\[/g) || []).length;
    const closeBrackets = (cleanedResponse.match(/]/g) || []).length;

    if (openBraces > closeBraces || openBrackets > closeBrackets) {
      console.log('🔧 Attempting to fix incomplete JSON...');
      if (openBrackets > closeBrackets) cleanedResponse += ']';
      if (openBraces > closeBraces) cleanedResponse += '}';
      console.log('🔧 Added missing brackets/braces');
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanedResponse) as { recommendations: { song: string; explanation: string }[] };
    console.log('✅ Successfully parsed recommendations:', parsed.recommendations?.length || 0);
  } catch (parseError) {
    console.error('❌ JSON parse error:', parseError);
    console.error('❌ Cleaned response text:', cleanedResponse);

    // Fallback: extract songs from partial/broken JSON or conversational text
    let matches: Array<{song: string; explanation: string}> = [];

    // Try to extract from JSON-like format: "song": "Artist - Title"
    const jsonSongPattern = /"song"\s*:\s*"([^"]+)"/gi;
    const jsonMatches = [...cleanedResponse.matchAll(jsonSongPattern)];
    if (jsonMatches.length > 0) {
      matches = jsonMatches.slice(0, 5).map(match => ({
        song: match[1],
        explanation: 'Recommended based on your preferences'
      }));
      console.log('🔧 Extracted songs from partial JSON:', matches.length);
    } else {
      // Fallback to conversational text patterns
      const patterns = [
        /(?:Artist[\s-]*:?\s*([^-\n]+?)\s*[-–]\s*(?:Title|Song)[\s-]*:?\s*([^\n(]+))/gi,
        /\d+\.\s*(?:Artist[\s-]*)?(?:Title[\s-]*)?:?\s*([^-\n]+?)\s*[-–]\s*([^\n(]+)/gi,
      ];

      for (const pattern of patterns) {
        const found = [...cleanedResponse.matchAll(pattern)];
        if (found.length > 0) {
          matches = found.slice(0, 5).map(match => {
            const artist = match[1].trim();
            const title = match[2].trim().split(/\s*\(/)[0].trim();
            return {
              song: `${artist} - ${title}`,
              explanation: 'Recommended based on your preferences'
            };
          });
          console.log('🔧 Fallback pattern matched:', matches.length, 'songs');
          break;
        }
      }
    }

    if (matches.length === 0) {
      console.error('❌ No songs could be parsed from response');
    }

    return { recommendations: matches };
  }

  if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
    throw new ServiceError('OLLAMA_PARSE_ERROR', 'Invalid recommendations format');
  }

  return {
    recommendations: parsed.recommendations.map(r => ({ song: r.song, explanation: r.explanation })),
  };
}

export function parsePlaylistResponse(responseText: string): PlaylistResponse {
  // Clean up response: remove markdown code blocks if present
  let cleanedResponse = responseText.trim();
  if (cleanedResponse.startsWith('```json')) {
    cleanedResponse = cleanedResponse.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '');
    console.log('🧹 Removed markdown code blocks from playlist response');
  } else if (cleanedResponse.startsWith('```')) {
    cleanedResponse = cleanedResponse.replace(/^```\s*/i, '').replace(/\s*```\s*$/, '');
    console.log('🧹 Removed markdown code blocks from playlist response');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanedResponse) as { playlist: PlaylistSuggestion[] };
    console.log('✅ Successfully parsed playlist:', parsed.playlist?.length || 0, 'songs');
  } catch (parseError) {
    console.error('JSON parse error:', parseError, 'Response:', cleanedResponse.substring(0, 500));
    // Fallback: extract from text
    const fallback = cleanedResponse.match(/song["']?\s*:\s*["']([^"']+)["']/gi) || [];
    const recs = fallback.slice(0, 5).map((match: string) => {
      const song = match.replace(/song["']?\s*:\s*["']/, '').replace(/["']$/, '');
      return { song, explanation: 'Fits the requested style based on your library', isDiscovery: false };
    });
    console.log('🔧 Fallback extracted:', recs.length, 'songs from partial response');
    return { playlist: recs };
  }

  if (!parsed.playlist || !Array.isArray(parsed.playlist)) {
    throw new ServiceError('OLLAMA_PARSE_ERROR', 'Invalid playlist format');
  }

  return {
    playlist: parsed.playlist.slice(0, 5), // MVP: Ensure max 5
  };
}