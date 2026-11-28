import { describe, expect, it } from 'vitest';
import { creditedArtists, creditsArtist, expandSimilarArtists } from '../artist-credits';

describe('creditedArtists', () => {
  it('splits the collab styles Last.fm returns, whole credit first', () => {
    expect(creditedArtists('NERO × Taiki Nulight')).toEqual(['NERO × Taiki Nulight', 'NERO', 'Taiki Nulight']);
    expect(creditedArtists('John Summit & Guz feat. Stevie Appleton')).toEqual([
      'John Summit & Guz feat. Stevie Appleton', 'John Summit', 'Guz', 'Stevie Appleton',
    ]);
    expect(creditedArtists('Angrybaby • Samuel Charles Agate')).toEqual(['Angrybaby • Samuel Charles Agate', 'Angrybaby', 'Samuel Charles Agate']);
    expect(creditedArtists('Chris Lake x Abel Balder')).toEqual(['Chris Lake x Abel Balder', 'Chris Lake', 'Abel Balder']);
  });

  it('leaves single names alone, including ones with an x or a dot in them', () => {
    expect(creditedArtists('Malcolm X')).toEqual(['Malcolm X']);
    expect(creditedArtists('BUNT.')).toEqual(['BUNT.']);
    expect(creditedArtists('Xavier Wulf')).toEqual(['Xavier Wulf']);
    expect(creditedArtists('')).toEqual([]);
  });
});

describe('creditsArtist', () => {
  it('matches the artist on its own, leading a credit, or inside one', () => {
    expect(creditsArtist('Tchami', 'tchami')).toBe(true);
    expect(creditsArtist('Calvin Harris feat. Ellie Goulding', 'Calvin Harris')).toBe(true);
    expect(creditsArtist('NERO, Taiki Nulight', 'Taiki Nulight')).toBe(true);
    expect(creditsArtist('Tchamisaurus', 'Tchami')).toBe(false);
    expect(creditsArtist(undefined, 'Tchami')).toBe(false);
  });
});

describe('expandSimilarArtists', () => {
  it('flattens collabs, keeps the score, drops the seed artist and excluded ones', () => {
    const out = expandSimilarArtists(
      [
        { name: 'NERO × Taiki Nulight', match: '1' },
        { name: 'BL3SS × Tchami', match: 0.33 },
        { name: 'it’s murph & Emi Grace', match: 0.23 },
        { name: 'Taiki Nulight', match: 0.2 },
      ],
      'it’s murph',
      new Set(['bl3ss']),
    );
    expect(out.map((a) => a.name)).toEqual(['NERO × Taiki Nulight', 'NERO', 'Taiki Nulight', 'BL3SS × Tchami', 'Tchami', 'it’s murph & Emi Grace', 'Emi Grace']);
    expect(out.find((a) => a.name === 'Tchami')).toMatchObject({ match: 0.33, from: 'BL3SS × Tchami' });
  });
});
