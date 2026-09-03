/**
 * Tests for the canonical `"Artist - Title"` reader/writer.
 *
 * The parse cases moved here from `library-reconciliation.test.ts`, where they
 * were written against `splitArtistTitle`. Context worth keeping: a dead
 * Navidrome id (file moved by Lidarr after a Picard retag) no longer resolves
 * via `getSong`, so this cached string is the only thing left to search the
 * library with. If the parse yields nothing, the id is reported `notFound` and
 * never remapped. A real prod run on 2026-09-02 reported
 * `deadIds: 7, notFound: 7, remapped: 0` with every entry
 * `{ artist: "Unknown", title: "Unknown", source: "playlist_songs" }`.
 */
import { describe, it, expect } from 'vitest';
import { formatArtistTitle, parseArtistTitle } from '../song-artist-title';

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
      'Official Audio'
    );
  });

  // The guard in reconcileLibrary is `if (!meta.artist && !meta.title)`. Returning
  // the literal "Unknown" (as the feedback branch used to) passes that truthiness
  // check and sends the library searching for a song by an artist named Unknown.
  it.each([null, undefined, '', '   '])(
    'returns EMPTY strings, never "Unknown", for unusable input: %p',
    (input) => {
      expect(parseArtistTitle(input)).toEqual({ artist: '', title: '' });
    }
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

  // The undouble branch is gated on a word boundary, not a bare `startsWith`.
  // Without it, any artist whose name is a prefix of the title's FIRST WORD
  // enters `parseRealArtistTitle`, which promotes the title's first segment to
  // artist — "Muse" becomes "Museum Hours" and the real artist is gone, taking
  // the library search with it. None of these shapes were in prod on
  // 2026-09-02; short artist names make them a matter of time.
  it.each([
    ['Muse - Museum Hours - Live', 'Muse', 'Museum Hours - Live'],
    ['Air - Airbag - Reissue', 'Air', 'Airbag - Reissue'],
    ['Sia - Siamese Dream - Remaster', 'Sia', 'Siamese Dream - Remaster'],
  ])('does not undouble %p, where the artist is only a sub-word prefix', (raw, artist, title) => {
    expect(parseArtistTitle(raw)).toEqual({ artist, title });
  });

  it.each([
    ['Low - Lowlife | Full Set', 'Low', 'Lowlife | Full Set'],
    ['Kid - Kidnapped [Official Audio]', 'Kid', 'Kidnapped [Official Audio]'],
  ])('leaves %p intact rather than stripping a MeTube suffix off a real title', (raw, artist, title) => {
    // The pipe/bracket strips belong to `parseRealArtistTitle`. Reaching them on
    // a sub-word prefix would edit a title that was never a MeTube rip.
    expect(parseArtistTitle(raw)).toEqual({ artist, title });
  });

  // The boundary check must not cost us the collaboration shape, where the
  // repeat is real and the extra credit belongs in the artist. Both of these are
  // verbatim prod rows; a stricter `"${artist} - "` gate would drop them.
  it('promotes the full credit on a collaboration repeat', () => {
    expect(
      parseArtistTitle('Wax Motif - Wax Motif & Taiki Nulight - Skank n Flex ft. Scrufizzer')
    ).toEqual({
      artist: 'Wax Motif & Taiki Nulight',
      title: 'Skank n Flex ft. Scrufizzer',
    });
  });

  it('promotes the full credit and strips the suffix together', () => {
    expect(parseArtistTitle('BL3SS - BL3SS & Tchami - R 2 ME [Official Audio]')).toEqual({
      artist: 'BL3SS & Tchami',
      title: 'R 2 ME',
    });
  });

  // Verbatim prod rows. `Conrad.` also pins the boundary check to the character
  // AFTER the artist rather than to a word character at the artist's own end.
  it.each([
    ['zvle - zvle - 1MY', 'zvle', '1MY'],
    ['kysa - kysa - four', 'kysa', 'four'],
    ['Conrad. - Conrad. - told you so', 'Conrad.', 'told you so'],
  ])('still undoubles the genuine repeat %p', (raw, artist, title) => {
    expect(parseArtistTitle(raw)).toEqual({ artist, title });
  });

  it('takes the promoted artist casing from the title, not the prefix', () => {
    // "Desren - DESREN - …": the artist comes back off the title segment. Every
    // consumer that compares these lowercases both sides, so this is cosmetic —
    // pinned so a future normalization change is a deliberate one.
    expect(parseArtistTitle('Desren - DESREN - WHERE HAVE U GONE?')).toEqual({
      artist: 'DESREN',
      title: 'WHERE HAVE U GONE?',
    });
  });

  // Legacy rows: written by `${song.artist || 'Unknown'} - ...` before
  // formatArtistTitle existed. The sentinel must not survive as a value.
  it.each(['Unknown', 'unknown', 'Unknown Artist'])(
    'treats the legacy %s sentinel as no artist',
    (sentinel) => {
      expect(parseArtistTitle(`${sentinel} - Divine`)).toEqual({
        artist: '',
        title: 'Divine',
      });
    }
  );

  it('treats "Unknown - Unknown" as entirely unusable', () => {
    // A write-time placeholder for a song with neither field, never a real track.
    expect(parseArtistTitle('Unknown - Unknown')).toEqual({ artist: '', title: '' });
  });

  it('keeps a real song titled "Unknown" when the artist is real', () => {
    expect(parseArtistTitle('Nine Inch Nails - Unknown')).toEqual({
      artist: 'Nine Inch Nails',
      title: 'Unknown',
    });
  });
});

describe('formatArtistTitle', () => {
  it('joins with the canonical separator', () => {
    expect(formatArtistTitle('Conrad.', 'told you so')).toBe('Conrad. - told you so');
  });

  it('refuses to double when the title already leads with "Artist - "', () => {
    expect(formatArtistTitle('Blair Muir', 'Blair Muir - Divine')).toBe('Blair Muir - Divine');
  });

  it('still prepends when the title merely starts with the artist name', () => {
    // Not a doubling — dropping the artist here would lose it for good.
    expect(formatArtistTitle('Muse', 'Muse Live in Rome')).toBe('Muse - Muse Live in Rome');
  });

  it.each(['Unknown', 'unknown', 'Unknown Artist'])(
    'never writes the %s sentinel into the string',
    (sentinel) => {
      expect(formatArtistTitle(sentinel, 'Divine')).toBe('Divine');
    }
  );

  it.each([null, undefined, '', '  '])('emits the title alone for artist %p', (artist) => {
    expect(formatArtistTitle(artist, 'Divine')).toBe('Divine');
  });

  it.each([null, undefined, '', '  '])('emits the artist alone for title %p', (title) => {
    expect(formatArtistTitle('Blair Muir', title)).toBe('Blair Muir');
  });

  it('trims both sides', () => {
    expect(formatArtistTitle('  Conrad.  ', '  told you so  ')).toBe('Conrad. - told you so');
  });
});

describe('round trip', () => {
  it.each([
    ['Conrad.', 'told you so'],
    ['Jay-Z', 'Takeover'],
    ['Artist', 'Song - Live at Wembley'],
    ['Muse', 'Muse Live in Rome'],
    ['Blair Muir', 'Divine (Official Lyric Video)'],
    ['', 'Hank the Dragon'],
  ])('parse(format(%p, %p)) returns the original pair', (artist, title) => {
    expect(parseArtistTitle(formatArtistTitle(artist, title))).toEqual({ artist, title });
  });

  it('normalizes rather than preserves an already-doubled title', () => {
    // The one pair that deliberately does NOT round-trip to itself: the doubled
    // shape is the thing being fixed, so it comes back undoubled either way —
    // whether format refuses to prepend or parse undoubles what it finds.
    const doubled = formatArtistTitle('Blair Muir', 'Blair Muir - Divine');
    expect(parseArtistTitle(doubled)).toEqual({ artist: 'Blair Muir', title: 'Divine' });
  });
});
