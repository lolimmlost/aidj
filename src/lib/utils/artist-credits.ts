/**
 * Artist credits as Last.fm and file tags write them: "NERO × Taiki Nulight",
 * "John Summit & Guz feat. Stevie Appleton", "Angrybaby • Samuel Charles Agate".
 * A whole credit like that matches nothing in a library that files the songs
 * under each artist, so similarity lookups try the parts too.
 */

const SEPARATOR = /\s*(?:\s[x×]\s|×|•|·|,|;|\/|&|\+|\bfeat\.?(?=\s)|\bft\.?(?=\s)|\bfeaturing\b|\bwith\b|\bvs\.?(?=\s))\s*/i;

/** The credit itself first, then each artist in it, without repeats (case-insensitive). */
export function creditedArtists(credit: string): string[] {
  const whole = (credit || '').trim();
  if (!whole) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [whole, ...whole.split(SEPARATOR)]) {
    const n = (name || '').trim();
    const key = n.toLowerCase();
    if (n.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/** Whether a song's artist tag credits `artist` (equal, leads the credit, or one of its parts). */
export function creditsArtist(songArtist: string | undefined, artist: string): boolean {
  const target = artist.trim().toLowerCase();
  const tag = (songArtist || '').trim().toLowerCase();
  if (!target || !tag) return false;
  if (tag === target || tag.startsWith(`${target} `) || tag.startsWith(`${target},`)) return true;
  return creditedArtists(tag).some((part) => part.toLowerCase() === target);
}

/**
 * Last.fm's similar artists, flattened to single artists to look up: each collab's parts follow
 * it, keeping its match score. The seed artist and excluded artists (lower-case) drop out.
 */
export function expandSimilarArtists<T extends { name: string; match?: number | string }>(
  similar: T[],
  seedArtist: string,
  exclude: Set<string> = new Set(),
): { name: string; match: number; from: string }[] {
  const seedParts = new Set(creditedArtists(seedArtist).map((a) => a.toLowerCase()));
  const seen = new Set<string>();
  const out: { name: string; match: number; from: string }[] = [];
  for (const s of similar) {
    const match = Number(s.match) || 0.5;
    for (const name of creditedArtists(s.name)) {
      const key = name.toLowerCase();
      if (seen.has(key) || seedParts.has(key) || exclude.has(key)) continue;
      seen.add(key);
      out.push({ name, match, from: s.name });
    }
  }
  return out;
}
