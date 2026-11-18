import { describe, expect, it } from 'vitest';
import { findLibraryArtistByName, normalizeArtistName } from '../artist-name-match';

describe('normalizeArtistName', () => {
  it('ignores case, spacing, punctuation and accents', () => {
    expect(normalizeArtistName('Twenty One Pilots')).toBe(normalizeArtistName('twenty one pilots'));
    expect(normalizeArtistName('twenty øne pilots')).toBe(normalizeArtistName('Twenty One Pilots'));
    expect(normalizeArtistName('Beyoncé')).toBe('beyonce');
    expect(normalizeArtistName('JAY-Z')).toBe(normalizeArtistName('Jay Z'));
    expect(normalizeArtistName('Simon & Garfunkel')).toBe(normalizeArtistName('Simon and Garfunkel'));
    expect(normalizeArtistName('The Weeknd')).toBe(normalizeArtistName('Weeknd'));
  });

  it('keeps non-Latin names', () => {
    expect(normalizeArtistName('民謡クルセイダーズ')).toBe('民謡クルセイダーズ');
  });
});

describe('findLibraryArtistByName', () => {
  const lib = [
    { id: 'stub', name: 'Twenty One Pilots', albumCount: 0, songCount: 0 },
    { id: 'top', name: 'twenty one pilots', albumCount: 6, songCount: 80 },
    { id: 'other', name: '21 Savage', albumCount: 3, songCount: 40 },
  ];

  it('finds the resolved MusicBrainz name in the library (21 pilots → Twenty One Pilots)', () => {
    expect(findLibraryArtistByName(lib, 'Twenty One Pilots')?.id).toBe('top');
  });

  it('skips empty stubs and returns null when absent', () => {
    expect(findLibraryArtistByName(lib.slice(0, 1), 'Twenty One Pilots')).toBeNull();
    expect(findLibraryArtistByName(lib, 'Paramore')).toBeNull();
    expect(findLibraryArtistByName(lib, '')).toBeNull();
  });
});
