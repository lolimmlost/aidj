/**
 * Canonical reader and writer for the denormalized `"Artist - Title"` string stored
 * in `playlist_songs.song_artist_title` and `recommendation_feedback.song_artist_title`
 * (and the recommendation `song` field derived from the same shape).
 *
 * Before this module (#219) three copies disagreed and one silently truncated: the
 * analytics readers took `parts[1]`, dropping everything after a second `" - "`, so
 * "Song - Live at Wembley" became "Song". MeTube rips are cached *doubled* —
 * "Blair Muir - Blair Muir - Divine (Official Lyric Video)" — because the raw video
 * title already leads with the artist, so a naive reader charted the artist name in
 * the title slot on every MeTube-sourced track.
 *
 * `parseArtistTitle` is the single reader; `formatArtistTitle` is the single writer
 * and refuses to write the doubled shape in the first place. `parse(format(a, t))`
 * round-trips for any ordinary pair, including a title that itself contains `" - "`.
 */

/** Only `" - "` (spaced) separates artist from title, so "Jay-Z" survives intact. */
const SEP = ' - ';

/**
 * MeTube downloads often cache the raw YouTube video title, which leads with the
 * artist and carries channel-style suffixes:
 * "Real Artist - Real Title [Official Audio] | Channel". Strip the decoration and
 * lift the leading artist back out of the title.
 *
 * Exported because `library-reconciliation` applies the same shape to `getSong`
 * metadata whose `artist` is a channel name.
 */
export function parseRealArtistTitle(
  artist: string,
  title: string,
): { artist: string; title: string } {
  const clean = title
    .replace(/\s*\[Official (?:Audio|Video|Music Video)\]/gi, '')
    .replace(/\s*\(Official (?:Audio|Video)\)/gi, '')
    .replace(/\s*\(Lyrics?\)/gi, '')
    .replace(/\s*\|.*$/g, '')
    .trim();
  const parts = clean.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(SEP).trim() };
  }
  return { artist, title: clean };
}

/**
 * Split a cached `"Artist - Title"` string into a searchable artist/title pair.
 *
 * Returns EMPTY strings (never the literal `"Unknown"`) when nothing is usable:
 * downstream guards test truthiness, and `"Unknown"` would send the library
 * searching for a song by an artist named Unknown instead of skipping the id.
 */
export function parseArtistTitle(
  cached: string | null | undefined,
): { artist: string; title: string } {
  const raw = (cached || '').trim();
  if (!raw) return { artist: '', title: '' };

  const parts = raw.split(SEP);
  // No separator: keep the whole thing searchable as a bare title.
  if (parts.length < 2) return { artist: '', title: raw };

  const artist = parts[0].trim();
  const title = parts.slice(1).join(SEP).trim();

  // Only undouble when the title genuinely REPEATS the artist. `parseRealArtistTitle`
  // re-splits the title and promotes its first segment to artist, which is right for
  // "Blair Muir - Blair Muir - Divine" but destructive for an ordinary title that
  // merely contains " - ": "Artist - Song - Live at Wembley" would come back as
  // artist "Song", losing the real artist and the search with it.
  if (artist && title.toLowerCase().startsWith(artist.toLowerCase())) {
    return parseRealArtistTitle(artist, title);
  }
  return { artist, title };
}

/**
 * The single writer of the cached `"Artist - Title"` string. Refuses to double: if
 * the title already leads with the artist (the MeTube shape), the artist is not
 * prepended again. Empty artist yields the bare title; empty title yields the bare
 * artist.
 */
export function formatArtistTitle(
  artist: string | null | undefined,
  title: string | null | undefined,
): string {
  const a = (artist || '').trim();
  const t = (title || '').trim();
  if (!a) return t;
  if (!t) return a;

  const al = a.toLowerCase();
  const tl = t.toLowerCase();
  if (tl === al || tl.startsWith(al + SEP)) return t;

  return `${a}${SEP}${t}`;
}
