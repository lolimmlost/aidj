import { describe, expect, it } from 'vitest';
import { compactName, digitsToWords, searchVariants, wordsToDigits } from '../search-variants';

describe('wordsToDigits / digitsToWords', () => {
  it('converts number words to digits', () => {
    expect(wordsToDigits('two pac')).toBe('2 pac');
    expect(wordsToDigits('twenty one pilots')).toBe('21 pilots');
    expect(wordsToDigits('twenty-one pilots')).toBe('21 pilots');
    expect(wordsToDigits('blink one eighty two')).toBe('blink 1 82'); // 0–99 only, no "hundred"
  });

  it('converts digits to words', () => {
    expect(digitsToWords('21 pilots')).toBe('twenty one pilots');
    expect(digitsToWords('2pac')).toBe('two pac');
    expect(digitsToWords('blink-182')).toBe('blink-182'); // > 99 left alone
    expect(digitsToWords('007')).toBe('007'); // leading zero left alone
  });
});

describe('searchVariants', () => {
  it('finds the library spellings for the reported cases', () => {
    expect(searchVariants('two pac')).toEqual(expect.arrayContaining(['2pac']));
    expect(searchVariants('2 pac')).toEqual(expect.arrayContaining(['2pac']));
    expect(searchVariants('21 pilots')).toEqual(expect.arrayContaining(['twenty one pilots']));
    expect(searchVariants('twenty one pilots')).toEqual(expect.arrayContaining(['21 pilots']));
  });

  it('adds nothing for ordinary queries', () => {
    expect(searchVariants('daft punk')).toEqual([]);
    expect(searchVariants('')).toEqual([]);
  });

  it('never repeats the query and caps the fan-out', () => {
    for (const q of ['2pac', '21 savage', 'the 1975', 'one direction']) {
      const v = searchVariants(q);
      expect(v).not.toContain(q);
      expect(v.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('compactName', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(compactName('2 Pac')).toBe(compactName('2Pac'));
    expect(compactName('Twenty-One Pilots')).toBe('twentyonepilots');
  });
});
