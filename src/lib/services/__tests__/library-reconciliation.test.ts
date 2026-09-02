/**
 * Tests for library reconciliation's cached-metadata parsing.
 *
 * Context: a dead Navidrome id (file moved by Lidarr after a Picard retag) no
 * longer resolves via `getSong`, so the cached "Artist - Title" string on the
 * referencing row is the ONLY thing left to search the library with. If that
 * parse yields nothing, the id is reported `notFound` and never remapped.
 *
 * A real prod run on 2026-09-02 reported `deadIds: 7, notFound: 7, remapped: 0`
 * with every entry `{ artist: "Unknown", title: "Unknown", source: "playlist_songs" }`
 * — the playlist query wasn't selecting `song_artist_title` at all.
 */
import { describe, it, expect } from 'vitest';
import { splitArtistTitle } from '../library-reconciliation';

describe('splitArtistTitle', () => {
  it('splits a normal cached "Artist - Title"', () => {
    expect(splitArtistTitle('Conrad. - told you so')).toEqual({
      artist: 'Conrad.',
      title: 'told you so',
    });
  });

  it('undoubles a MeTube rip cached as "Artist - Artist - Title"', () => {
    // The raw YouTube title already leads with the artist, so the cached string
    // repeats it. A naive split leaves "Blair Muir - Divine …" as the title,
    // which will not match the retagged library copy titled just "Divine".
    expect(splitArtistTitle('Blair Muir - Blair Muir - Divine (Official Lyric Video)')).toEqual({
      artist: 'Blair Muir',
      title: 'Divine (Official Lyric Video)',
    });
  });

  it('strips channel-style suffixes after a pipe', () => {
    expect(splitArtistTitle('CREAM SODA - CREAM SODA – VIBY | Official Audio').title).not.toContain(
      'Official Audio'
    );
  });

  // The guard in reconcileLibrary is `if (!meta.artist && !meta.title)`. Returning
  // the literal "Unknown" (as the feedback branch used to) passes that truthiness
  // check and sends the library searching for a song by an artist named Unknown.
  it.each([null, undefined, '', '   '])(
    'returns EMPTY strings, never "Unknown", for unusable input: %p',
    (input) => {
      expect(splitArtistTitle(input)).toEqual({ artist: '', title: '' });
    }
  );

  it('keeps a bare title searchable when there is no separator', () => {
    // Better to search on title alone than to skip the id entirely.
    expect(splitArtistTitle('Hank the Dragon')).toEqual({
      artist: '',
      title: 'Hank the Dragon',
    });
  });

  it('does not split on a hyphen that is part of a name', () => {
    // Only " - " (spaced) separates; "Jay-Z" must survive intact.
    expect(splitArtistTitle('Jay-Z - Takeover')).toEqual({
      artist: 'Jay-Z',
      title: 'Takeover',
    });
  });

  it('keeps the remainder intact when the title itself contains " - "', () => {
    expect(splitArtistTitle('Artist - Song - Live at Wembley')).toEqual({
      artist: 'Artist',
      title: 'Song - Live at Wembley',
    });
  });
});
