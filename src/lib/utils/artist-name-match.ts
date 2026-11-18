/**
 * Loose artist-name comparison for "is this MusicBrainz artist already in the
 * library?" checks.
 *
 * The search page falls back to Aurral/MusicBrainz when the library search
 * finds nothing. MusicBrainz resolves aliases the library search can't —
 * "21 pilots" → "Twenty One Pilots" — so the fallback has to check the
 * resolved name against the library before offering a download.
 */

// Letters NFKD doesn't decompose into ASCII (ø, æ, ß …).
const FOLD: Record<string, string> = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', đ: 'd', ł: 'l', þ: 'th' };

export function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Latin accents only
    .normalize('NFC') // re-attach other marks (e.g. kana voicing ダ)
    .replace(/[øæœßđłþ]/g, (c) => FOLD[c] ?? c)
    .replace(/&/g, ' and ')
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
}

/**
 * The library artist whose name matches `resolvedName` (MusicBrainz's name),
 * preferring the one with the most music. Artists with no albums/songs are
 * ignored — they're empty Navidrome stubs.
 */
export function findLibraryArtistByName<
  T extends { name: string; albumCount?: number; songCount?: number },
>(artists: readonly T[], resolvedName: string): T | null {
  const want = normalizeArtistName(resolvedName);
  if (!want) return null;
  let best: T | null = null;
  let bestScore = -1;
  for (const a of artists) {
    const score = (a.albumCount ?? 0) * 100 + (a.songCount ?? 0);
    if (score <= 0) continue;
    if (normalizeArtistName(a.name) !== want) continue;
    if (score > bestScore) {
      best = a;
      bestScore = score;
    }
  }
  return best;
}
