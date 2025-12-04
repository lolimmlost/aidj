import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  translateMoodToQuery,
  toEvaluatorFormat,
  parseQueryResponse,
  isValidQuery,
  isValidCondition,
  conditionToEvaluatorFormat,
  keywordFallback,
} from '../mood-translator';
import * as llmFactory from '../llm/factory';
import type { LLMProvider } from '../llm/types';

// Mock the LLM factory
vi.mock('../llm/factory');

describe('Mood Translator Service', () => {
  let mockProvider: {
    generate: ReturnType<typeof vi.fn>;
    getDefaultModel: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetAllMocks();

    mockProvider = {
      generate: vi.fn(),
      getDefaultModel: vi.fn().mockReturnValue('test-model'),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // translateMoodToQuery Tests
  // ============================================================================

  describe('translateMoodToQuery', () => {
    it('should translate mood using LLM when available', async () => {
      vi.spyOn(llmFactory, 'getLLMProvider').mockReturnValue(mockProvider as unknown as LLMProvider);

      mockProvider.generate.mockResolvedValue({
        content: '{"all":[{"field":"genre","operator":"contains","value":"ambient"}],"limit":25,"sort":"random"}',
      });

      const result = await translateMoodToQuery('chill evening vibes');

      expect(mockProvider.generate).toHaveBeenCalled();
      expect(result.all).toBeDefined();
      expect(result.limit).toBe(25);
      expect(result.sort).toBe('random');
    });

    it('should use keyword fallback when LLM provider is not available', async () => {
      vi.spyOn(llmFactory, 'getLLMProvider').mockImplementation(() => {
        throw new Error('Provider not configured');
      });

      const result = await translateMoodToQuery('chill evening vibes');

      // Should use keyword fallback for "chill"
      expect(result.any).toBeDefined();
      expect(result.any?.some(c => c.field === 'genre' && c.value === 'ambient')).toBe(true);
    });

    it('should use keyword fallback when LLM call fails', async () => {
      vi.spyOn(llmFactory, 'getLLMProvider').mockReturnValue(mockProvider as unknown as LLMProvider);
      mockProvider.generate.mockRejectedValue(new Error('API timeout'));

      const result = await translateMoodToQuery('party music');

      // Should use keyword fallback for "party"
      expect(result.any).toBeDefined();
      expect(result.any?.some(c => c.field === 'genre' && c.value === 'dance')).toBe(true);
    });

    it('should handle LLM response with extra text around JSON', async () => {
      vi.spyOn(llmFactory, 'getLLMProvider').mockReturnValue(mockProvider as unknown as LLMProvider);

      mockProvider.generate.mockResolvedValue({
        content: 'Here is the query:\n{"all":[{"field":"genre","operator":"contains","value":"rock"}],"limit":30}\nThis should work!',
      });

      const result = await translateMoodToQuery('rock music');

      expect(result.all).toBeDefined();
      expect(result.all?.[0].value).toBe('rock');
    });
  });

  // ============================================================================
  // toEvaluatorFormat Tests
  // ============================================================================

  describe('toEvaluatorFormat', () => {
    it('should convert SmartPlaylistQuery to evaluator format', () => {
      const query = {
        all: [{ field: 'genre' as const, operator: 'contains' as const, value: 'rock' }],
        any: [{ field: 'year' as const, operator: 'between' as const, value: [1990, 1999] as [number, number] }],
        limit: 25,
        sort: 'random' as const,
      };

      const result = toEvaluatorFormat(query);

      expect(result.all).toEqual([{ contains: { genre: 'rock' } }]);
      expect(result.any).toEqual([{ inTheRange: { year: [1990, 1999] } }]);
      expect(result.limit).toBe(25);
      expect(result.sort).toBe('random');
    });

    it('should handle empty query', () => {
      const query = {};

      const result = toEvaluatorFormat(query);

      expect(result.all).toBeUndefined();
      expect(result.any).toBeUndefined();
    });

    it('should map operator names correctly', () => {
      const query = {
        all: [
          { field: 'rating' as const, operator: 'gt' as const, value: 4 },
          { field: 'playCount' as const, operator: 'lt' as const, value: 10 },
          { field: 'title' as const, operator: 'startsWith' as const, value: 'The' },
        ],
      };

      const result = toEvaluatorFormat(query);

      expect(result.all).toEqual([
        { gt: { rating: 4 } },
        { lt: { playCount: 10 } },
        { startsWith: { title: 'The' } },
      ]);
    });
  });

  // ============================================================================
  // parseQueryResponse Tests
  // ============================================================================

  describe('parseQueryResponse', () => {
    it('should parse valid JSON response', () => {
      const content = '{"all":[{"field":"genre","operator":"contains","value":"jazz"}],"limit":20}';

      const result = parseQueryResponse(content);

      expect(result.all).toBeDefined();
      expect(result.limit).toBe(20);
      expect(result.sort).toBe('random'); // Default applied
    });

    it('should extract JSON from text with surrounding content', () => {
      const content = 'Here is the query: {"all":[{"field":"genre","operator":"is","value":"electronic"}]} Hope this helps!';

      const result = parseQueryResponse(content);

      expect(result.all?.[0].value).toBe('electronic');
    });

    it('should throw error for content without JSON', () => {
      const content = 'I cannot generate a query for this request.';

      expect(() => parseQueryResponse(content)).toThrow('No JSON found in response');
    });

    it('should throw error for invalid JSON structure', () => {
      const content = '{"invalid": "structure"}';

      expect(() => parseQueryResponse(content)).toThrow('Invalid query structure');
    });

    it('should apply default limit and sort', () => {
      const content = '{"all":[{"field":"rating","operator":"gt","value":3}]}';

      const result = parseQueryResponse(content);

      expect(result.limit).toBe(25);
      expect(result.sort).toBe('random');
    });
  });

  // ============================================================================
  // isValidQuery Tests
  // ============================================================================

  describe('isValidQuery', () => {
    it('should return true for valid query with all conditions', () => {
      const query = {
        all: [{ field: 'genre', operator: 'contains', value: 'rock' }],
      };

      expect(isValidQuery(query)).toBe(true);
    });

    it('should return true for valid query with any conditions', () => {
      const query = {
        any: [{ field: 'genre', operator: 'contains', value: 'rock' }],
      };

      expect(isValidQuery(query)).toBe(true);
    });

    it('should return true for valid query with both all and any', () => {
      const query = {
        all: [{ field: 'rating', operator: 'gt', value: 3 }],
        any: [{ field: 'genre', operator: 'contains', value: 'rock' }],
      };

      expect(isValidQuery(query)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidQuery(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidQuery('string')).toBe(false);
      expect(isValidQuery(123)).toBe(false);
    });

    it('should return false for query without all or any', () => {
      const query = { limit: 25, sort: 'random' };

      expect(isValidQuery(query)).toBe(false);
    });

    it('should return false for query with invalid conditions', () => {
      const query = {
        all: [{ invalid: 'condition' }],
      };

      expect(isValidQuery(query)).toBe(false);
    });
  });

  // ============================================================================
  // isValidCondition Tests
  // ============================================================================

  describe('isValidCondition', () => {
    it('should return true for valid condition', () => {
      const condition = { field: 'genre', operator: 'contains', value: 'rock' };

      expect(isValidCondition(condition)).toBe(true);
    });

    it('should return true for all valid fields', () => {
      const fields = ['genre', 'year', 'rating', 'bpm', 'artist', 'album', 'title', 'playCount', 'loved'];

      fields.forEach(field => {
        const condition = { field, operator: 'is', value: 'test' };
        expect(isValidCondition(condition)).toBe(true);
      });
    });

    it('should return true for all valid operators', () => {
      const operators = ['contains', 'is', 'isNot', 'gt', 'lt', 'between', 'startsWith', 'endsWith'];

      operators.forEach(operator => {
        const condition = { field: 'genre', operator, value: 'test' };
        expect(isValidCondition(condition)).toBe(true);
      });
    });

    it('should return false for missing field', () => {
      const condition = { operator: 'contains', value: 'rock' };

      expect(isValidCondition(condition)).toBe(false);
    });

    it('should return false for missing operator', () => {
      const condition = { field: 'genre', value: 'rock' };

      expect(isValidCondition(condition)).toBe(false);
    });

    it('should return false for missing value', () => {
      const condition = { field: 'genre', operator: 'contains' };

      expect(isValidCondition(condition)).toBe(false);
    });

    it('should return false for invalid field', () => {
      const condition = { field: 'invalid', operator: 'contains', value: 'rock' };

      expect(isValidCondition(condition)).toBe(false);
    });

    it('should return false for invalid operator', () => {
      const condition = { field: 'genre', operator: 'invalid', value: 'rock' };

      expect(isValidCondition(condition)).toBe(false);
    });
  });

  // ============================================================================
  // conditionToEvaluatorFormat Tests
  // ============================================================================

  describe('conditionToEvaluatorFormat', () => {
    it('should convert contains condition', () => {
      const condition = { field: 'genre' as const, operator: 'contains' as const, value: 'rock' };

      const result = conditionToEvaluatorFormat(condition);

      expect(result).toEqual({ contains: { genre: 'rock' } });
    });

    it('should convert between to inTheRange', () => {
      const condition = { field: 'year' as const, operator: 'between' as const, value: [1990, 1999] as [number, number] };

      const result = conditionToEvaluatorFormat(condition);

      expect(result).toEqual({ inTheRange: { year: [1990, 1999] } });
    });

    it('should convert gt condition', () => {
      const condition = { field: 'rating' as const, operator: 'gt' as const, value: 4 };

      const result = conditionToEvaluatorFormat(condition);

      expect(result).toEqual({ gt: { rating: 4 } });
    });
  });

  // ============================================================================
  // keywordFallback Tests
  // ============================================================================

  describe('keywordFallback', () => {
    it('should return chill query for chill keywords', () => {
      const moods = ['chill', 'relax', 'calm', 'mellow'];

      moods.forEach(mood => {
        const result = keywordFallback(mood);
        expect(result.any).toBeDefined();
        expect(result.any?.some(c => c.value === 'ambient')).toBe(true);
      });
    });

    it('should return party query for party keywords', () => {
      const moods = ['party', 'dance', 'club'];

      moods.forEach(mood => {
        const result = keywordFallback(mood);
        expect(result.any).toBeDefined();
        expect(result.any?.some(c => c.value === 'dance' || c.value === 'electronic')).toBe(true);
      });
    });

    it('should return workout query for workout keywords', () => {
      const moods = ['workout', 'gym', 'exercise', 'energy'];

      moods.forEach(mood => {
        const result = keywordFallback(mood);
        expect(result.any).toBeDefined();
        expect(result.any?.some(c => c.value === 'rock' || c.value === 'electronic')).toBe(true);
      });
    });

    it('should return focus query for focus keywords', () => {
      const moods = ['focus', 'study', 'work', 'concentrate'];

      moods.forEach(mood => {
        const result = keywordFallback(mood);
        expect(result.any).toBeDefined();
        expect(result.any?.some(c => c.value === 'classical' || c.value === 'ambient')).toBe(true);
      });
    });

    it('should return decade query for decade keywords', () => {
      expect(keywordFallback('80s').all?.[0].value).toEqual([1980, 1989]);
      expect(keywordFallback('90s').all?.[0].value).toEqual([1990, 1999]);
      expect(keywordFallback('2000s').all?.[0].value).toEqual([2000, 2009]);
    });

    it('should return favorites query for favorite keywords', () => {
      const moods = ['favorite', 'best', 'loved'];

      moods.forEach(mood => {
        const result = keywordFallback(mood);
        expect(result.all).toBeDefined();
        expect(result.all?.[0].operator).toBe('gt');
        expect(result.all?.[0].field).toBe('rating');
      });
    });

    it('should return unplayed query for never played keywords', () => {
      const moods = ['never played', 'unplayed', 'discover'];

      moods.forEach(mood => {
        const result = keywordFallback(mood);
        expect(result.all).toBeDefined();
        expect(result.all?.[0].field).toBe('playCount');
        expect(result.all?.[0].value).toBe(0);
      });
    });

    it('should return default highly rated query for unknown mood', () => {
      const result = keywordFallback('something completely random');

      expect(result.all).toBeDefined();
      expect(result.all?.[0].field).toBe('rating');
      expect(result.all?.[0].operator).toBe('gt');
      expect(result.all?.[0].value).toBe(3);
    });

    it('should be case-insensitive', () => {
      const result1 = keywordFallback('CHILL');
      const result2 = keywordFallback('chill');
      const result3 = keywordFallback('ChIlL');

      expect(result1.any?.length).toBe(result2.any?.length);
      expect(result2.any?.length).toBe(result3.any?.length);
    });

    it('should set appropriate limits and sort', () => {
      const result = keywordFallback('party');

      expect(result.limit).toBeGreaterThan(0);
      expect(result.sort).toBe('random');
    });
  });
});
