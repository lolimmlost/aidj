/**
 * Mood Translator Service
 *
 * The ONLY place AI/LLM is used in the recommendation system.
 *
 * Purpose: Translate natural language moods to Navidrome smart playlist queries
 * NOT used for: Picking songs, generating song lists, similarity scoring
 *
 * This is Phase 2 of the recommendation engine refactor.
 * @see docs/architecture/recommendation-engine-refactor.md
 */

import { getLLMProvider } from './llm/factory';
import type { LLMProvider } from './llm/types';

// ============================================================================
// Types
// ============================================================================

export interface SmartPlaylistQuery {
  all?: QueryCondition[];
  any?: QueryCondition[];
  limit?: number;
  sort?: 'random' | 'rating' | 'playCount' | 'recent' | string;
}

export interface QueryCondition {
  field: QueryField;
  operator: QueryOperator;
  value: string | number | [number, number];
}

export type QueryField = 'genre' | 'year' | 'rating' | 'bpm' | 'artist' | 'album' | 'title' | 'playCount' | 'loved';
export type QueryOperator = 'contains' | 'is' | 'isNot' | 'gt' | 'lt' | 'between' | 'startsWith' | 'endsWith';

// Internal format used by smart-playlist-evaluator
export interface EvaluatorQuery {
  all?: Array<Record<string, Record<string, string | number | boolean | [number, number]>>>;
  any?: Array<Record<string, Record<string, string | number | boolean | [number, number]>>>;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// ============================================================================
// Constants
// ============================================================================

const MOOD_TRANSLATION_TIMEOUT_MS = 5000;
const MOOD_TRANSLATION_MAX_TOKENS = 256;
const MOOD_TRANSLATION_TEMPERATURE = 0.3;

const SYSTEM_PROMPT = `You are a music query translator. Your job is to convert natural language mood/style descriptions into structured JSON queries for a music library.

You MUST return ONLY valid JSON, no explanation or markdown.

Available fields:
- genre: Music genre (rock, pop, jazz, electronic, ambient, classical, hip-hop, etc.)
- year: Release year (use "between" for ranges like [1990, 1999])
- rating: User rating 1-5 stars (use gt/lt for thresholds)
- bpm: Beats per minute, typically 60-200
- artist: Artist name
- album: Album name
- playCount: Number of times played (0 = never played)
- loved: Boolean for favorited songs

Available operators:
- contains: Field contains the value (for text fields)
- is: Exact match
- isNot: Not equal to
- gt: Greater than (for numbers)
- lt: Less than (for numbers)
- between: Value is between [min, max] (for year ranges)

Structure:
- Use "all" array for AND conditions (all must match)
- Use "any" array for OR conditions (any can match)
- Include "limit" (default 25) and "sort" (random, rating, playCount, recent)`;

const EXAMPLE_QUERIES = `Examples:
1. "chill evening vibes" → {"all":[{"field":"genre","operator":"contains","value":"ambient"}],"limit":25,"sort":"random"}
2. "90s rock anthems" → {"all":[{"field":"genre","operator":"contains","value":"rock"},{"field":"year","operator":"between","value":[1990,1999]}],"limit":30,"sort":"random"}
3. "upbeat party music" → {"any":[{"field":"genre","operator":"contains","value":"dance"},{"field":"genre","operator":"contains","value":"pop"},{"field":"genre","operator":"contains","value":"electronic"}],"limit":40,"sort":"random"}
4. "my favorite songs" → {"all":[{"field":"rating","operator":"gt","value":4}],"limit":50,"sort":"rating"}
5. "songs I haven't heard" → {"all":[{"field":"playCount","operator":"is","value":0}],"limit":30,"sort":"random"}
6. "workout energy" → {"any":[{"field":"genre","operator":"contains","value":"electronic"},{"field":"genre","operator":"contains","value":"rock"},{"field":"genre","operator":"contains","value":"hip-hop"}],"limit":40,"sort":"random"}`;

// ============================================================================
// Main Translation Function
// ============================================================================

/**
 * Translate a mood description to a smart playlist query using AI
 *
 * @param moodDescription - Natural language description (e.g., "chill evening vibes")
 * @returns Smart playlist query that can be evaluated against the library
 *
 * @example
 * const query = await translateMoodToQuery("chill evening vibes for reading");
 * // Returns: { all: [{field: "genre", operator: "contains", value: "ambient"}], limit: 25, sort: "random" }
 *
 * @example
 * const query = await translateMoodToQuery("high energy workout music");
 * // Returns: { any: [{field: "genre", operator: "contains", value: "electronic"}, ...], limit: 30 }
 */
export async function translateMoodToQuery(moodDescription: string): Promise<SmartPlaylistQuery> {
  console.log(`🎭 [MoodTranslator] Translating: "${moodDescription}"`);

  // Phase 3: Check keyword fallback FIRST for common terms
  // This is faster and produces better variety than AI for simple moods
  const keywordResult = keywordFallback(moodDescription);

  // If keyword fallback found a specific match (not the default "random"), use it
  // The default has empty "all" array, so check if we have actual conditions
  const hasKeywordMatch = (keywordResult.any && keywordResult.any.length > 0) ||
                          (keywordResult.all && keywordResult.all.length > 0 &&
                           keywordResult.all.some(c => c.field !== 'rating'));

  if (hasKeywordMatch) {
    console.log(`✅ [MoodTranslator] Using keyword match for better variety`);
    return keywordResult;
  }

  // For complex/unusual moods, use AI translation
  let provider: LLMProvider;
  try {
    provider = getLLMProvider();
  } catch {
    console.warn('⚠️ [MoodTranslator] LLM provider not available, using keyword fallback');
    return keywordResult;
  }

  const prompt = `${SYSTEM_PROMPT}

${EXAMPLE_QUERIES}

Now translate this mood:
"${moodDescription}"

JSON query:`;

  try {
    const response = await provider.generate(
      {
        model: provider.getDefaultModel(),
        prompt,
        stream: false,
        temperature: MOOD_TRANSLATION_TEMPERATURE,
        maxTokens: MOOD_TRANSLATION_MAX_TOKENS,
      },
      MOOD_TRANSLATION_TIMEOUT_MS
    );

    const query = parseQueryResponse(response.content);
    console.log(`✅ [MoodTranslator] Generated query:`, JSON.stringify(query));
    return query;
  } catch (error) {
    console.warn('⚠️ [MoodTranslator] AI translation failed, using keyword fallback:', error);
    return keywordResult;
  }
}

/**
 * Convert SmartPlaylistQuery to the format expected by smart-playlist-evaluator
 */
export function toEvaluatorFormat(query: SmartPlaylistQuery): EvaluatorQuery {
  const result: EvaluatorQuery = {};

  if (query.all && query.all.length > 0) {
    result.all = query.all.map(conditionToEvaluatorFormat);
  }

  if (query.any && query.any.length > 0) {
    result.any = query.any.map(conditionToEvaluatorFormat);
  }

  if (query.limit) {
    result.limit = query.limit;
  }

  if (query.sort) {
    result.sort = query.sort;
  }

  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse the LLM response and extract JSON query
 */
function parseQueryResponse(content: string): SmartPlaylistQuery {
  // Try to extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate the structure
  if (!isValidQuery(parsed)) {
    throw new Error('Invalid query structure');
  }

  // Apply defaults
  return {
    ...parsed,
    limit: parsed.limit || 25,
    sort: parsed.sort || 'random',
  };
}

/**
 * Validate that the parsed query has the expected structure
 */
function isValidQuery(obj: unknown): obj is SmartPlaylistQuery {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const query = obj as Record<string, unknown>;

  // Must have at least 'all' or 'any' conditions
  const hasAll = Array.isArray(query.all);
  const hasAny = Array.isArray(query.any);

  if (!hasAll && !hasAny) {
    return false;
  }

  // Validate conditions
  if (hasAll && !query.all.every(isValidCondition)) {
    return false;
  }

  if (hasAny && !query.any.every(isValidCondition)) {
    return false;
  }

  return true;
}

/**
 * Validate a single query condition
 */
function isValidCondition(cond: unknown): cond is QueryCondition {
  if (typeof cond !== 'object' || cond === null) {
    return false;
  }

  const c = cond as Record<string, unknown>;

  // Must have field, operator, and value
  if (!c.field || !c.operator || c.value === undefined) {
    return false;
  }

  // Field must be a known type
  const validFields: QueryField[] = ['genre', 'year', 'rating', 'bpm', 'artist', 'album', 'title', 'playCount', 'loved'];
  if (!validFields.includes(c.field as QueryField)) {
    return false;
  }

  // Operator must be a known type
  const validOperators: QueryOperator[] = ['contains', 'is', 'isNot', 'gt', 'lt', 'between', 'startsWith', 'endsWith'];
  if (!validOperators.includes(c.operator as QueryOperator)) {
    return false;
  }

  return true;
}

/**
 * Convert a QueryCondition to the evaluator format
 * e.g., {field: "genre", operator: "contains", value: "rock"}
 *    -> {contains: {genre: "rock"}}
 */
function conditionToEvaluatorFormat(
  condition: QueryCondition
): Record<string, Record<string, string | number | boolean | [number, number]>> {
  const { field, operator, value } = condition;

  // Map operator names to evaluator format
  const operatorMap: Record<QueryOperator, string> = {
    contains: 'contains',
    is: 'is',
    isNot: 'isNot',
    gt: 'gt',
    lt: 'lt',
    between: 'inTheRange',
    startsWith: 'startsWith',
    endsWith: 'endsWith',
  };

  const evalOperator = operatorMap[operator] || operator;

  return {
    [evalOperator]: {
      [field]: value,
    },
  };
}

/**
 * Keyword-based fallback when AI is unavailable
 * This is the same logic from Phase 1 but returning SmartPlaylistQuery format
 */
function keywordFallback(mood: string): SmartPlaylistQuery {
  const moodLower = mood.toLowerCase();

  // Energy-based keywords
  if (moodLower.includes('chill') || moodLower.includes('relax') || moodLower.includes('calm') || moodLower.includes('mellow')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'ambient' },
        { field: 'genre', operator: 'contains', value: 'chill' },
        { field: 'genre', operator: 'contains', value: 'acoustic' },
        { field: 'genre', operator: 'contains', value: 'jazz' },
      ],
      limit: 25,
      sort: 'random',
    };
  }

  if (moodLower.includes('party') || moodLower.includes('dance') || moodLower.includes('club') || moodLower.includes('rave')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'dance' },
        { field: 'genre', operator: 'contains', value: 'electronic' },
        { field: 'genre', operator: 'contains', value: 'edm' },
        { field: 'genre', operator: 'contains', value: 'techno' },
        { field: 'genre', operator: 'contains', value: 'house' },
        { field: 'genre', operator: 'contains', value: 'acid' },
        { field: 'genre', operator: 'contains', value: 'trance' },
        { field: 'genre', operator: 'contains', value: 'hardstyle' },
        { field: 'genre', operator: 'contains', value: 'hardcore' },
        { field: 'genre', operator: 'contains', value: 'drum and bass' },
        { field: 'genre', operator: 'contains', value: 'dnb' },
        { field: 'genre', operator: 'contains', value: 'dubstep' },
        { field: 'genre', operator: 'contains', value: 'riddim' },
        { field: 'genre', operator: 'contains', value: 'breakbeat' },
        { field: 'genre', operator: 'contains', value: 'jungle' },
        { field: 'genre', operator: 'contains', value: 'gabber' },
      ],
      limit: 40,
      sort: 'random',
    };
  }

  if (moodLower.includes('workout') || moodLower.includes('gym') || moodLower.includes('exercise') || moodLower.includes('energy')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'rock' },
        { field: 'genre', operator: 'contains', value: 'metal' },
        { field: 'genre', operator: 'contains', value: 'electronic' },
        { field: 'genre', operator: 'contains', value: 'hip-hop' },
      ],
      limit: 40,
      sort: 'random',
    };
  }

  if (moodLower.includes('focus') || moodLower.includes('study') || moodLower.includes('work') || moodLower.includes('concentrate')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'classical' },
        { field: 'genre', operator: 'contains', value: 'ambient' },
        { field: 'genre', operator: 'contains', value: 'instrumental' },
        { field: 'genre', operator: 'contains', value: 'lo-fi' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  if (moodLower.includes('sad') || moodLower.includes('melancholy') || moodLower.includes('blue')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'indie' },
        { field: 'genre', operator: 'contains', value: 'folk' },
        { field: 'genre', operator: 'contains', value: 'acoustic' },
        { field: 'genre', operator: 'contains', value: 'singer-songwriter' },
      ],
      limit: 25,
      sort: 'random',
    };
  }

  if (moodLower.includes('happy') || moodLower.includes('upbeat') || moodLower.includes('joy') || moodLower.includes('cheerful')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'pop' },
        { field: 'genre', operator: 'contains', value: 'indie' },
        { field: 'genre', operator: 'contains', value: 'funk' },
        { field: 'genre', operator: 'contains', value: 'soul' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Decade-based keywords
  if (moodLower.includes('80s') || moodLower.includes('eighties')) {
    return {
      all: [{ field: 'year', operator: 'between', value: [1980, 1989] }],
      limit: 30,
      sort: 'random',
    };
  }

  if (moodLower.includes('90s') || moodLower.includes('nineties')) {
    return {
      all: [{ field: 'year', operator: 'between', value: [1990, 1999] }],
      limit: 30,
      sort: 'random',
    };
  }

  if (moodLower.includes('2000s') || moodLower.includes('00s')) {
    return {
      all: [{ field: 'year', operator: 'between', value: [2000, 2009] }],
      limit: 30,
      sort: 'random',
    };
  }

  // Favorites/ratings - try loved first, then fall back to playCount
  if (moodLower.includes('favorite') || moodLower.includes('best') || moodLower.includes('loved')) {
    return {
      any: [
        { field: 'loved', operator: 'is', value: true },
        { field: 'playCount', operator: 'gt', value: 5 } // Frequently played = likely favorites
      ],
      limit: 50,
      sort: 'playCount',
    };
  }

  // Never played
  if (moodLower.includes('never played') || moodLower.includes('unplayed') || moodLower.includes('discover')) {
    return {
      all: [{ field: 'playCount', operator: 'is', value: 0 }],
      limit: 30,
      sort: 'random',
    };
  }

  // ============================================================================
  // Genre-specific keywords (expanded)
  // ============================================================================

  // Rock variants
  if (moodLower.includes('rock') && !moodLower.includes('workout')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'rock' },
        { field: 'genre', operator: 'contains', value: 'alternative' },
        { field: 'genre', operator: 'contains', value: 'grunge' },
        { field: 'genre', operator: 'contains', value: 'punk' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Metal variants
  if (moodLower.includes('metal') || moodLower.includes('heavy')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'metal' },
        { field: 'genre', operator: 'contains', value: 'heavy' },
        { field: 'genre', operator: 'contains', value: 'thrash' },
        { field: 'genre', operator: 'contains', value: 'death' },
        { field: 'genre', operator: 'contains', value: 'black metal' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Electronic/EDM variants
  if (moodLower.includes('electronic') || moodLower.includes('edm') || moodLower.includes('techno') || moodLower.includes('house')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'electronic' },
        { field: 'genre', operator: 'contains', value: 'techno' },
        { field: 'genre', operator: 'contains', value: 'house' },
        { field: 'genre', operator: 'contains', value: 'trance' },
        { field: 'genre', operator: 'contains', value: 'edm' },
        { field: 'genre', operator: 'contains', value: 'synth' },
      ],
      limit: 35,
      sort: 'random',
    };
  }

  // Hip-hop/Rap
  if (moodLower.includes('hip hop') || moodLower.includes('hip-hop') || moodLower.includes('rap') || moodLower.includes('hiphop')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'hip-hop' },
        { field: 'genre', operator: 'contains', value: 'hip hop' },
        { field: 'genre', operator: 'contains', value: 'rap' },
        { field: 'genre', operator: 'contains', value: 'r&b' },
        { field: 'genre', operator: 'contains', value: 'trap' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Jazz variants
  if (moodLower.includes('jazz') && !moodLower.includes('chill')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'jazz' },
        { field: 'genre', operator: 'contains', value: 'swing' },
        { field: 'genre', operator: 'contains', value: 'bebop' },
        { field: 'genre', operator: 'contains', value: 'fusion' },
        { field: 'genre', operator: 'contains', value: 'smooth jazz' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Classical
  if (moodLower.includes('classical') || moodLower.includes('orchestra') || moodLower.includes('symphony')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'classical' },
        { field: 'genre', operator: 'contains', value: 'orchestra' },
        { field: 'genre', operator: 'contains', value: 'symphony' },
        { field: 'genre', operator: 'contains', value: 'chamber' },
        { field: 'genre', operator: 'contains', value: 'baroque' },
        { field: 'genre', operator: 'contains', value: 'romantic' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Country/Folk
  if (moodLower.includes('country') || moodLower.includes('folk') || moodLower.includes('bluegrass') || moodLower.includes('americana')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'country' },
        { field: 'genre', operator: 'contains', value: 'folk' },
        { field: 'genre', operator: 'contains', value: 'bluegrass' },
        { field: 'genre', operator: 'contains', value: 'americana' },
        { field: 'genre', operator: 'contains', value: 'western' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Blues
  if (moodLower.includes('blues')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'blues' },
        { field: 'genre', operator: 'contains', value: 'soul' },
        { field: 'genre', operator: 'contains', value: 'rhythm' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // R&B/Soul
  if (moodLower.includes('r&b') || moodLower.includes('rnb') || moodLower.includes('soul') || moodLower.includes('motown')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'r&b' },
        { field: 'genre', operator: 'contains', value: 'soul' },
        { field: 'genre', operator: 'contains', value: 'motown' },
        { field: 'genre', operator: 'contains', value: 'funk' },
        { field: 'genre', operator: 'contains', value: 'neo-soul' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Reggae/Ska
  if (moodLower.includes('reggae') || moodLower.includes('ska') || moodLower.includes('dub')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'reggae' },
        { field: 'genre', operator: 'contains', value: 'ska' },
        { field: 'genre', operator: 'contains', value: 'dub' },
        { field: 'genre', operator: 'contains', value: 'dancehall' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Indie
  if (moodLower.includes('indie') && !moodLower.includes('sad')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'indie' },
        { field: 'genre', operator: 'contains', value: 'alternative' },
        { field: 'genre', operator: 'contains', value: 'lo-fi' },
        { field: 'genre', operator: 'contains', value: 'shoegaze' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Pop
  if (moodLower.includes('pop') && !moodLower.includes('party')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'pop' },
        { field: 'genre', operator: 'contains', value: 'synth-pop' },
        { field: 'genre', operator: 'contains', value: 'dance-pop' },
        { field: 'genre', operator: 'contains', value: 'electropop' },
      ],
      limit: 35,
      sort: 'random',
    };
  }

  // Punk
  if (moodLower.includes('punk')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'punk' },
        { field: 'genre', operator: 'contains', value: 'hardcore' },
        { field: 'genre', operator: 'contains', value: 'post-punk' },
        { field: 'genre', operator: 'contains', value: 'emo' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // ============================================================================
  // Mood/Activity keywords (expanded)
  // ============================================================================

  // Romantic/Love
  if (moodLower.includes('romantic') || moodLower.includes('love') || moodLower.includes('romance') || moodLower.includes('date')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'soul' },
        { field: 'genre', operator: 'contains', value: 'r&b' },
        { field: 'genre', operator: 'contains', value: 'jazz' },
        { field: 'genre', operator: 'contains', value: 'ballad' },
        { field: 'genre', operator: 'contains', value: 'romantic' },
      ],
      limit: 25,
      sort: 'random',
    };
  }

  // Sleep/Night
  if (moodLower.includes('sleep') || moodLower.includes('night') || moodLower.includes('bedtime') || moodLower.includes('lullaby')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'ambient' },
        { field: 'genre', operator: 'contains', value: 'classical' },
        { field: 'genre', operator: 'contains', value: 'new age' },
        { field: 'genre', operator: 'contains', value: 'meditation' },
      ],
      limit: 20,
      sort: 'random',
    };
  }

  // Morning/Wake up
  if (moodLower.includes('morning') || moodLower.includes('wake up') || moodLower.includes('sunrise') || moodLower.includes('breakfast')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'acoustic' },
        { field: 'genre', operator: 'contains', value: 'folk' },
        { field: 'genre', operator: 'contains', value: 'indie' },
        { field: 'genre', operator: 'contains', value: 'pop' },
      ],
      limit: 25,
      sort: 'random',
    };
  }

  // Driving/Road trip
  if (moodLower.includes('driving') || moodLower.includes('road trip') || moodLower.includes('car') || moodLower.includes('highway')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'rock' },
        { field: 'genre', operator: 'contains', value: 'classic rock' },
        { field: 'genre', operator: 'contains', value: 'indie' },
        { field: 'genre', operator: 'contains', value: 'pop' },
        { field: 'genre', operator: 'contains', value: 'country' },
      ],
      limit: 40,
      sort: 'random',
    };
  }

  // Cooking/Dinner
  if (moodLower.includes('cooking') || moodLower.includes('dinner') || moodLower.includes('kitchen') || moodLower.includes('food')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'jazz' },
        { field: 'genre', operator: 'contains', value: 'bossa nova' },
        { field: 'genre', operator: 'contains', value: 'soul' },
        { field: 'genre', operator: 'contains', value: 'lounge' },
      ],
      limit: 25,
      sort: 'random',
    };
  }

  // Angry/Intense
  if (moodLower.includes('angry') || moodLower.includes('intense') || moodLower.includes('aggressive') || moodLower.includes('rage')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'metal' },
        { field: 'genre', operator: 'contains', value: 'hardcore' },
        { field: 'genre', operator: 'contains', value: 'punk' },
        { field: 'genre', operator: 'contains', value: 'industrial' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Summer/Beach
  if (moodLower.includes('summer') || moodLower.includes('beach') || moodLower.includes('tropical') || moodLower.includes('vacation')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'reggae' },
        { field: 'genre', operator: 'contains', value: 'pop' },
        { field: 'genre', operator: 'contains', value: 'tropical' },
        { field: 'genre', operator: 'contains', value: 'latin' },
        { field: 'genre', operator: 'contains', value: 'dance' },
      ],
      limit: 35,
      sort: 'random',
    };
  }

  // Rainy/Cozy
  if (moodLower.includes('rainy') || moodLower.includes('cozy') || moodLower.includes('rain') || moodLower.includes('coffee')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'acoustic' },
        { field: 'genre', operator: 'contains', value: 'folk' },
        { field: 'genre', operator: 'contains', value: 'indie' },
        { field: 'genre', operator: 'contains', value: 'jazz' },
        { field: 'genre', operator: 'contains', value: 'lo-fi' },
      ],
      limit: 25,
      sort: 'random',
    };
  }

  // ============================================================================
  // More decade keywords
  // ============================================================================

  if (moodLower.includes('60s') || moodLower.includes('sixties')) {
    return {
      all: [{ field: 'year', operator: 'between', value: [1960, 1969] }],
      limit: 30,
      sort: 'random',
    };
  }

  if (moodLower.includes('70s') || moodLower.includes('seventies')) {
    return {
      all: [{ field: 'year', operator: 'between', value: [1970, 1979] }],
      limit: 30,
      sort: 'random',
    };
  }

  if (moodLower.includes('2010s') || moodLower.includes('10s') || moodLower.includes('tens')) {
    return {
      all: [{ field: 'year', operator: 'between', value: [2010, 2019] }],
      limit: 30,
      sort: 'random',
    };
  }

  if (moodLower.includes('2020s') || moodLower.includes('20s') || moodLower.includes('recent') || moodLower.includes('new music')) {
    return {
      all: [{ field: 'year', operator: 'between', value: [2020, 2029] }],
      limit: 30,
      sort: 'random',
    };
  }

  // Old/Classic/Vintage
  if (moodLower.includes('classic') || moodLower.includes('vintage') || moodLower.includes('oldies') || moodLower.includes('retro')) {
    return {
      all: [{ field: 'year', operator: 'between', value: [1950, 1989] }],
      limit: 40,
      sort: 'random',
    };
  }

  // ============================================================================
  // World music keywords
  // ============================================================================

  if (moodLower.includes('latin') || moodLower.includes('spanish') || moodLower.includes('salsa') || moodLower.includes('latino')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'latin' },
        { field: 'genre', operator: 'contains', value: 'salsa' },
        { field: 'genre', operator: 'contains', value: 'reggaeton' },
        { field: 'genre', operator: 'contains', value: 'bachata' },
        { field: 'genre', operator: 'contains', value: 'spanish' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  if (moodLower.includes('french') || moodLower.includes('paris') || moodLower.includes('chanson')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'french' },
        { field: 'genre', operator: 'contains', value: 'chanson' },
        { field: 'artist', operator: 'contains', value: 'french' },
      ],
      limit: 25,
      sort: 'random',
    };
  }

  if (moodLower.includes('african') || moodLower.includes('afrobeat') || moodLower.includes('afro')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'african' },
        { field: 'genre', operator: 'contains', value: 'afrobeat' },
        { field: 'genre', operator: 'contains', value: 'world' },
      ],
      limit: 25,
      sort: 'random',
    };
  }

  if (moodLower.includes('japanese') || moodLower.includes('j-pop') || moodLower.includes('anime')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'japanese' },
        { field: 'genre', operator: 'contains', value: 'j-pop' },
        { field: 'genre', operator: 'contains', value: 'anime' },
        { field: 'genre', operator: 'contains', value: 'jpop' },
      ],
      limit: 25,
      sort: 'random',
    };
  }

  if (moodLower.includes('korean') || moodLower.includes('k-pop') || moodLower.includes('kpop')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'korean' },
        { field: 'genre', operator: 'contains', value: 'k-pop' },
        { field: 'genre', operator: 'contains', value: 'kpop' },
      ],
      limit: 25,
      sort: 'random',
    };
  }

  // ============================================================================
  // Instrumental keywords
  // ============================================================================

  if (moodLower.includes('instrumental') || moodLower.includes('no vocals') || moodLower.includes('no singing')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'instrumental' },
        { field: 'genre', operator: 'contains', value: 'classical' },
        { field: 'genre', operator: 'contains', value: 'soundtrack' },
        { field: 'genre', operator: 'contains', value: 'post-rock' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  if (moodLower.includes('piano') || moodLower.includes('keyboard')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'piano' },
        { field: 'genre', operator: 'contains', value: 'classical' },
        { field: 'genre', operator: 'contains', value: 'instrumental' },
      ],
      limit: 25,
      sort: 'random',
    };
  }

  if (moodLower.includes('guitar') || moodLower.includes('acoustic guitar')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'acoustic' },
        { field: 'genre', operator: 'contains', value: 'folk' },
        { field: 'genre', operator: 'contains', value: 'guitar' },
        { field: 'genre', operator: 'contains', value: 'flamenco' },
      ],
      limit: 25,
      sort: 'random',
    };
  }

  // Soundtrack/Score
  if (moodLower.includes('soundtrack') || moodLower.includes('movie') || moodLower.includes('film') || moodLower.includes('score') || moodLower.includes('cinematic')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'soundtrack' },
        { field: 'genre', operator: 'contains', value: 'score' },
        { field: 'genre', operator: 'contains', value: 'film' },
        { field: 'genre', operator: 'contains', value: 'cinematic' },
        { field: 'genre', operator: 'contains', value: 'orchestral' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Video game music
  if (moodLower.includes('video game') || moodLower.includes('gaming') || moodLower.includes('game music') || moodLower.includes('chiptune')) {
    return {
      any: [
        { field: 'genre', operator: 'contains', value: 'game' },
        { field: 'genre', operator: 'contains', value: 'chiptune' },
        { field: 'genre', operator: 'contains', value: 'video game' },
        { field: 'genre', operator: 'contains', value: '8-bit' },
        { field: 'genre', operator: 'contains', value: 'electronic' },
      ],
      limit: 30,
      sort: 'random',
    };
  }

  // Default: random songs from the library (no filters)
  // Previously defaulted to rating > 3, but most libraries don't have rated songs
  console.log('ℹ️ [MoodTranslator] No keyword match, defaulting to random songs');
  return {
    all: [], // No filters - just return random songs
    limit: 25,
    sort: 'random',
  };
}

// ============================================================================
// Exports for Testing
// ============================================================================

export {
  parseQueryResponse,
  isValidQuery,
  isValidCondition,
  conditionToEvaluatorFormat,
  keywordFallback,
  SYSTEM_PROMPT,
  EXAMPLE_QUERIES,
};
