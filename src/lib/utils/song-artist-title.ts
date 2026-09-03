/**
 * Canonical reader and writer for the denormalized `"Artist - Title"` string
 * stored on `recommendation_feedback.song_artist_title` and
 * `playlist_songs.song_artist_title`.
 *
 * Before this module the string was written by bare interpolation at 15 call
 * sites and parsed by 13 independent helpers that disagreed with each other.
 * Five of those readers used `parts[1]`, which silently truncates any title
 * containing `" - "`: "Song - Live at Wembley" was charted, rendered and
 * exported as "Song".
 *
 * Lives in `utils/` rather than alongside the reconciliation service that grew
 * it: that service imports `db` and Navidrome, and several callers here are
 * client components.
 */

/**
 * Placeholder artists written by our own code when a song has no artist
 * (`${song.artist || 'Unknown'} - ...`). They are not real artists, and letting
 * one through as a value is what made reconciliation search the library for a
 * song by an artist named Unknown.
 */
const UNKNOWN_SENTINELS = new Set(['unknown', 'unknown artist']);

function isUnknownSentinel(value: string): boolean {
  return UNKNOWN_SENTINELS.has(value.trim().toLowerCase());
}

/**
 * MeTube downloads often have "Channel Name" as the artist and
 * "Real Artist - Real Title [Official Audio]" as the title.
 */
export function parseRealArtistTitle(
  artist: string,
  title: string
): { artist: string; title: string } {
  const clean = title
    .replace(/\s*\[Official (?:Audio|Video|Music Video)\]/gi, '')
    .replace(/\s*\(Official (?:Audio|Video)\)/gi, '')
    .replace(/\s*\(Lyrics?\)/gi, '')
    .replace(/\s*\|.*$/g, '')
    .trim();
  const parts = clean.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist, title: clean };
}

/**
 * The single writer. Build the cached string here instead of interpolating, so
 * the doubled and `"Unknown - "` shapes never enter the database again.
 *
 * Refuses to double: MeTube video titles already lead with the artist, so
 * `format("Blair Muir", "Blair Muir - Divine")` returns the title alone rather
 * than "Blair Muir - Blair Muir - Divine".
 *
 * The check is deliberately `"${artist} - "` and not a bare `startsWith(artist)`:
 * a title that merely begins with the artist's name without the separator
 * ("Muse", "Muse Live in Rome") is not doubled, and dropping the artist there
 * would lose it on the way back out.
 */
export function formatArtistTitle(
  artist: string | null | undefined,
  title: string | null | undefined
): string {
  const cleanTitle = (title || '').trim();
  const rawArtist = (artist || '').trim();
  const cleanArtist = isUnknownSentinel(rawArtist) ? '' : rawArtist;

  if (!cleanArtist) return cleanTitle;
  if (!cleanTitle) return cleanArtist;
  if (cleanTitle.toLowerCase().startsWith(`${cleanArtist.toLowerCase()} - `)) {
    return cleanTitle;
  }
  return `${cleanArtist} - ${cleanTitle}`;
}

/**
 * The single reader. Split a cached `"Artist - Title"` into a usable pair.
 *
 * For a dead Navidrome id (file moved by Lidarr after a Picard retag) this
 * cached string is the ONLY metadata left: the id no longer resolves via
 * `getSong`, so there is nothing else to search the library with.
 *
 * Returns EMPTY strings (never the literal `"Unknown"`) when nothing is usable.
 * Reconciliation's guard is a truthiness test, so `"Unknown"` passes it and
 * sends the library searching for a song by an artist named Unknown. Callers
 * that need a display string apply their own `|| 'Unknown Artist'` — that
 * fallback must not live in here.
 */
export function parseArtistTitle(cached: string | null | undefined): {
  artist: string;
  title: string;
} {
  const raw = (cached || '').trim();
  if (!raw) return { artist: '', title: '' };
  const parts = raw.split(' - ');
  if (parts.length < 2) return { artist: '', title: raw };

  const artist = parts[0].trim();
  const title = parts.slice(1).join(' - ').trim();

  // Rows written before `formatArtistTitle` existed still carry the sentinel.
  if (isUnknownSentinel(artist)) {
    // "Unknown - Unknown" is unambiguously a write-time placeholder for a song
    // with neither field, never a real track. A lone "Unknown" in the title
    // position is left alone — that could be a real title.
    return { artist: '', title: isUnknownSentinel(title) ? '' : title };
  }

  // Only undouble when the title genuinely REPEATS the artist.
  // `parseRealArtistTitle` re-splits the title and promotes its first segment to
  // artist, which is right for "Blair Muir - Blair Muir - Divine" but destructive
  // for an ordinary title that merely contains " - ": "Artist - Song - Live at
  // Wembley" would come back as artist "Song", losing the real artist and the
  // search with it.
  if (artist && title.toLowerCase().startsWith(artist.toLowerCase())) {
    return parseRealArtistTitle(artist, title);
  }
  return { artist, title };
}
