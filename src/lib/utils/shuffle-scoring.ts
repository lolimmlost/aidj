import type { Song } from '@/lib/types/song';

/**
 * Shuffle that *feels* random.
 *
 * A uniform (Fisher–Yates) shuffle clumps: with a few big artists in a
 * playlist, three songs by one of them inside ten tracks is normal. Listeners
 * hear that as "not random". This follows the approach Spotify adopted in 2014
 * (after Martin Fiedler's "balanced shuffle"):
 *
 *  1. Group songs by artist. Each artist's k songs are placed at evenly spaced
 *     positions across the list — one every n/k — starting from a random
 *     offset, with a little jitter so the pattern doesn't show. Biggest
 *     artists are placed first and smaller ones fill the gaps.
 *  2. Inside an artist the same spreading is applied per album, so two songs
 *     from one album don't come up as that artist's consecutive picks.
 *  3. Songs heard recently go in a second tier after every other song, so a
 *     fresh shuffle doesn't open with the tracks you've just been hearing.
 *  4. A final pass splits any same-artist neighbours that remain.
 *
 * Every song appears exactly once; only the order is shaped.
 */

export interface ShuffleOptions {
  /** Song ids heard recently: shuffled on their own and placed after the rest. */
  recentlyPlayedIds?: ReadonlySet<string>;
  /** Random source in [0, 1) — injectable for tests. */
  random?: () => number;
}

/** Each position is nudged by up to ±JITTER/2 of its artist's spacing. */
const JITTER = 0.2;

export function shuffleSongs(songs: Song[], options: ShuffleOptions = {}): Song[] {
  const random = options.random ?? Math.random;
  const recent = options.recentlyPlayedIds;
  if (!recent || recent.size === 0) return separateNeighbours(spread(songs, random));

  const fresh: Song[] = [];
  const heard: Song[] = [];
  for (const song of songs) (recent.has(song.id) ? heard : fresh).push(song);

  const freshOrder = separateNeighbours(spread(fresh, random));
  if (heard.length === 0) return freshOrder;
  // Repair the heard tier with the last fresh song as its left neighbour so
  // the seam doesn't create an adjacency, without pulling heard songs forward.
  const seam = freshOrder.slice(-1);
  const heardOrder = separateNeighbours([...seam, ...spread(heard, random)]).slice(seam.length);
  return [...freshOrder, ...heardOrder];
}

/**
 * Artist identity for spreading. Collaborations group with their lead artist
 * ("Kai Wachi & LEVEL UP" with "Kai Wachi"); songs with no artist are each
 * their own group.
 */
export function artistKey(song: Song): string {
  const lead = (song.artist ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+(?:feat\.?|ft\.?|featuring|with|x|&|and|vs\.?)\s+|[,;/]/)[0]
    .replace(/^the\s+/, '')
    .trim();
  return lead || `\u0000${song.id}`;
}

function albumKey(song: Song): string {
  return song.albumId || song.album || `\u0000${song.id}`;
}

function spread(songs: Song[], random: () => number): Song[] {
  // Artists are spread over actual list positions; within an artist, albums
  // are spread the same way so one album's tracks don't come up back to back.
  const byArtist = groupBy(songs, artistKey);
  const groups = [...byArtist.values()].map((group) =>
    spreadGroups(group, albumKey, random, (album) => fisherYates(album, random)),
  );
  return assignSlots(groups, songs.length, random);
}

/**
 * Give each group (largest first) the free list positions nearest to evenly
 * spaced targets — start at a random offset, one every n/k positions, each
 * jittered a little. Big artists get near-perfect spacing; smaller ones fill
 * in around them. (Spreading every artist independently over [0, 1), as in
 * Spotify's write-up, lets neighbouring artists' randomness squeeze a big
 * artist into bursts.)
 */
function assignSlots(groups: Song[][], n: number, random: () => number): Song[] {
  const slots: Array<Song | undefined> = new Array(n);
  const free = new FreeSlots(n);
  // Largest first; ties in random order so equal-sized artists vary.
  const order = groups
    .map((group) => ({ group, tiebreak: random() }))
    .sort((a, b) => b.group.length - a.group.length || a.tiebreak - b.tiebreak);

  for (const { group } of order) {
    const gap = n / group.length;
    const start = random() * gap;
    group.forEach((song, i) => {
      const target = start + i * gap + (random() - 0.5) * gap * JITTER;
      const slot = free.takeNearest(Math.min(n - 1, Math.max(0, Math.round(target))));
      slots[slot] = song;
    });
  }
  return slots as Song[];
}

/** Free positions 0..n-1 with nearest-free lookup (union–find in both directions). */
class FreeSlots {
  private readonly right: Int32Array;
  private readonly left: Int32Array;
  constructor(private readonly n: number) {
    // right[i]: candidate free slot >= i (n = none); left[i + 1]: free slot <= i (0 = none).
    this.right = Int32Array.from({ length: n + 1 }, (_, i) => i);
    this.left = Int32Array.from({ length: n + 1 }, (_, i) => i);
  }
  private findRight(i: number): number {
    while (this.right[i] !== i) {
      this.right[i] = this.right[this.right[i]];
      i = this.right[i];
    }
    return i;
  }
  private findLeft(i: number): number {
    while (this.left[i] !== i) {
      this.left[i] = this.left[this.left[i]];
      i = this.left[i];
    }
    return i;
  }
  takeNearest(target: number): number {
    const after = this.findRight(target); // n when nothing is free to the right
    const beforePlus1 = this.findLeft(target + 1); // 0 when nothing is free to the left
    const before = beforePlus1 - 1;
    let slot: number;
    if (after >= this.n) slot = before;
    else if (before < 0) slot = after;
    else slot = target - before <= after - target ? before : after;
    this.right[slot] = slot + 1;
    this.left[slot + 1] = slot;
    return slot;
  }
}

function groupBy(songs: Song[], key: (song: Song) => string): Map<string, Song[]> {
  const groups = new Map<string, Song[]>();
  for (const song of songs) {
    const k = key(song);
    const group = groups.get(k);
    if (group) group.push(song);
    else groups.set(k, [song]);
  }
  return groups;
}

/**
 * Place each group's (already ordered) members at evenly spaced positions in
 * [0, 1) with a random start, then merge all groups by position.
 */
function spreadGroups(
  songs: Song[],
  key: (song: Song) => string,
  random: () => number,
  orderGroup: (group: Song[]) => Song[],
): Song[] {
  if (songs.length <= 1) return [...songs];
  const groups = groupBy(songs, key);
  if (groups.size === 1) return orderGroup(songs);

  const placed: Array<{ position: number; song: Song }> = [];
  for (const group of groups.values()) {
    const ordered = orderGroup(group);
    const gap = 1 / ordered.length;
    const start = random() * gap;
    ordered.forEach((song, i) => {
      const jitter = (random() - 0.5) * gap * JITTER;
      placed.push({ position: start + i * gap + jitter, song });
    });
  }
  placed.sort((a, b) => a.position - b.position);
  return placed.map((p) => p.song);
}

function fisherYates<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Break remaining same-artist neighbours: for each clash at (i, i+1), swap
 * song i+1 with the nearest later song that fits at i+1 and whose new spot
 * doesn't create a clash either. Unavoidable clashes (one artist is most of
 * the list) are left as they are.
 */
function separateNeighbours(songs: Song[]): Song[] {
  const result = [...songs];
  const keys = result.map(artistKey);
  const clashes = (index: number, k: string, skip: number) =>
    (index - 1 >= 0 && index - 1 !== skip && keys[index - 1] === k) ||
    (index + 1 < keys.length && index + 1 !== skip && keys[index + 1] === k);

  for (let i = 0; i < result.length - 1; i++) {
    if (keys[i] !== keys[i + 1]) continue;
    const moving = keys[i + 1];
    for (let j = i + 2; j < result.length; j++) {
      const incoming = keys[j];
      if (incoming === moving) continue;
      // incoming lands at i+1 (neighbours i and i+2); moving lands at j.
      if (incoming === keys[i] || (i + 2 < keys.length && i + 2 !== j && keys[i + 2] === incoming)) continue;
      if (clashes(j, moving, i + 1)) continue;
      [result[i + 1], result[j]] = [result[j], result[i + 1]];
      [keys[i + 1], keys[j]] = [keys[j], keys[i + 1]];
      break;
    }
  }
  return result;
}

/**
 * Order for the songs still to come when shuffle is turned off: the original
 * order, continuing from where the current song sits in it (songs that came
 * before it follow at the end). Songs that weren't in the original list —
 * added while shuffled, e.g. AI DJ picks — stay right after the song they
 * followed.
 */
export function unshuffleUpcoming(upcoming: Song[], original: Song[], currentId?: string): Song[] {
  const rank = new Map<string, number>();
  original.forEach((song, i) => {
    if (!rank.has(song.id)) rank.set(song.id, i);
  });
  const here = currentId !== undefined ? rank.get(currentId) ?? -1 : -1;
  const n = original.length;

  let last = -1;
  const keyed = upcoming.map((song, i) => {
    const r = rank.get(song.id);
    if (r !== undefined) last = r > here ? r : r + n;
    return { song, key: r === undefined ? last + 0.5 : last, i };
  });
  keyed.sort((a, b) => a.key - b.key || a.i - b.i);
  return keyed.map((k) => k.song);
}
