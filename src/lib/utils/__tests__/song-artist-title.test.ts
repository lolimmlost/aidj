import { describe, it, expect } from 'vitest';
import { parseArtistTitle, formatArtistTitle } from '../song-artist-title';

describe('parseArtistTitle', () => {
  it('splits a normal cached "Artist - Title"', () => {
    expect(parseArtistTitle('Conrad. - told you so')).toEqual({
      artist: 'Conrad.',
      title: 'told you so',
    });
  });

  it('undoubles a MeTube rip cached as "Artist - Artist - Title"', () => {
    // The raw YouTube title already leads with the artist, so the cached string
    // repeats it. A naive split leaves "Blair Muir - Divine …" as the title,
    // which will not match the retagged library copy titled just "Divine".
    expect(parseArtistTitle('Blair Muir - Blair Muir - Divine (Official Lyric Video)')).toEqual({
      artist: 'Blair Muir',
      title: 'Divine (Official Lyric Video)',
    });
  });

  it('strips channel-style suffixes after a pipe', () => {
    expect(parseArtistTitle('CREAM SODA - CREAM SODA – VIBY | Official Audio').title).not.toContain(
      'Official Audio',
    );
  });

  // The reconciliation guard is `if (!meta.artist && !meta.title)`. Returning the
  // literal "Unknown" passes that truthiness check and sends the library searching
  // for a song by an artist named Unknown.
  it.each([null, undefined, '', '   '])(
    'returns EMPTY strings, never "Unknown", for unusable input: %p',
    (input) => {
      expect(parseArtistTitle(input)).toEqual({ artist: '', title: '' });
    },
  );

  it('keeps a bare title searchable when there is no separator', () => {
    // Better to search on title alone than to skip the id entirely.
    expect(parseArtistTitle('Hank the Dragon')).toEqual({
      artist: '',
      title: 'Hank the Dragon',
    });
  });

  it('does not split on a hyphen that is part of a name', () => {
    // Only " - " (spaced) separates; "Jay-Z" must survive intact.
    expect(parseArtistTitle('Jay-Z - Takeover')).toEqual({
      artist: 'Jay-Z',
      title: 'Takeover',
    });
  });

  it('keeps the remainder intact when the title itself contains " - "', () => {
    expect(parseArtistTitle('Artist - Song - Live at Wembley')).toEqual({
      artist: 'Artist',
      title: 'Song - Live at Wembley',
    });
  });
});

describe('formatArtistTitle', () => {
  it('joins artist and title with " - "', () => {
    expect(formatArtistTitle('Conrad.', 'told you so')).toBe('Conrad. - told you so');
  });

  it('refuses to double when the title already leads with the artist', () => {
    // The MeTube shape: raw video title already carries the artist prefix.
    expect(formatArtistTitle('Blair Muir', 'Blair Muir - Divine (Official Lyric Video)')).toBe(
      'Blair Muir - Divine (Official Lyric Video)',
    );
  });

  it('falls back to the bare title when artist is missing', () => {
    expect(formatArtistTitle('', 'Instrumental')).toBe('Instrumental');
    expect(formatArtistTitle(null, 'Instrumental')).toBe('Instrumental');
  });

  it('falls back to the bare artist when title is missing', () => {
    expect(formatArtistTitle('Aphex Twin', '')).toBe('Aphex Twin');
  });
});

describe('round-trip parse(format(a, t))', () => {
  it.each([
    ['Conrad.', 'told you so'],
    ['Jay-Z', 'Takeover'],
    ['Artist', 'Song - Live at Wembley'], // title contains " - "
  ])('round-trips (%s, %s)', (artist, title) => {
    expect(parseArtistTitle(formatArtistTitle(artist, title))).toEqual({ artist, title });
  });

  it('recovers the real components from a would-be-doubled write', () => {
    // format refuses to double, so parse of the result yields the real pair.
    const cached = formatArtistTitle('Blair Muir', 'Blair Muir - Divine');
    expect(cached).toBe('Blair Muir - Divine');
    expect(parseArtistTitle(cached)).toEqual({ artist: 'Blair Muir', title: 'Divine' });
  });
});
