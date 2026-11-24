import { describe, it, expect } from 'vitest';
import { primaryArtist } from '../primary-artist';

describe('primaryArtist (#424)', () => {
  it.each([
    ['Tyler, The Creator', 'Tyler, The Creator'],
    ['Earth, Wind & Fire', 'Earth, Wind & Fire'],
    ['Crosby, Stills, Nash & Young', 'Crosby, Stills, Nash & Young'],
    ['earth, wind and fire', 'earth, wind and fire'],
    ['Peter, Björn and John', 'Peter, Björn and John'],
    ['Tyler, The Creator, Kali Uchis', 'Tyler, The Creator'],
    ['Tyler, The Creator;Kali Uchis', 'Tyler, The Creator'],
    ['Crosby, Stills & Nash, Neil Young', 'Crosby, Stills & Nash'],
  ])('keeps the comma name in %j', (input, want) => {
    expect(primaryArtist(input)).toBe(want);
  });

  it.each([
    ['Drake, 21 Savage', 'Drake'],
    ['Lil Baby;Gunna', 'Lil Baby'],
    ['Lil Baby; Gunna, Drake', 'Lil Baby'],
    ['  Solo Artist  ', 'Solo Artist'],
    ['Simon & Garfunkel', 'Simon & Garfunkel'],
    ['', ''],
  ])('splits collaborations in %j', (input, want) => {
    expect(primaryArtist(input)).toBe(want);
  });

  it('handles null/undefined', () => {
    expect(primaryArtist(undefined)).toBe('');
    expect(primaryArtist(null)).toBe('');
  });
});
