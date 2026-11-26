import { normalizeArtistName } from './artist-name-match';

/**
 * Artists whose own name contains a comma. Splitting "Tyler, The Creator" on
 * the comma would search, verify and add "Tyler" (#424). Compared after
 * normalizeArtistName, so case, accents, "&"/"and" and a leading "The" don't matter.
 */
const COMMA_NAMES = [
  'Tyler, The Creator',
  'Earth, Wind & Fire',
  'Crosby, Stills, Nash & Young',
  'Crosby, Stills & Nash',
  'Emerson, Lake & Palmer',
  'Blood, Sweat & Tears',
  'Peter, Bjorn and John',
  'Up, Bustle and Out',
  'Now, Now',
  'Black, White & Rio',
  'Me, Myself and I',
  'Ladies, Gentlemen',
];

const COMMA_NAME_KEYS = new Set(COMMA_NAMES.map(normalizeArtistName));
const MAX_SEGMENTS = Math.max(...COMMA_NAMES.map((n) => n.split(',').length));

/**
 * The first credited artist of a multi-artist string.
 *
 * `;` always separates artists (Navidrome and Spotify CSV exports join with it).
 * `,` separates too ("Drake, 21 Savage") unless the leading comma segments
 * spell a known comma name, which is kept whole.
 */
export function primaryArtist(artist: string | null | undefined): string {
  const first = (artist ?? '').split(';')[0];
  const segments = first.split(',');
  for (let k = Math.min(MAX_SEGMENTS, segments.length); k >= 2; k--) {
    const candidate = segments.slice(0, k).join(',');
    if (COMMA_NAME_KEYS.has(normalizeArtistName(candidate))) return candidate.trim();
  }
  return segments[0].trim();
}
