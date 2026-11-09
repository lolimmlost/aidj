/**
 * Recent searches for the library search page (client, per user).
 *
 * Each signed-in user gets their own list in localStorage, so accounts that
 * share a browser don't see each other's searches. An entry is either a typed
 * query or a result the user opened (a song, an artist or an album). Newest
 * first, no duplicates, capped at MAX_RECENT.
 */
import type { Song } from '@/lib/types/song';

export const MAX_RECENT = 10;

/** The pre-#286 key, shared by every account on the browser. */
export const LEGACY_RECENT_KEY = 'aidj.search.recent';

export type RecentEntry =
  | { kind: 'query'; term: string }
  | { kind: 'song'; song: Song }
  | { kind: 'artist'; id: string; name: string }
  | { kind: 'album'; id: string; name: string; artist: string; artistId?: string };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function recentSearchKey(userId: string): string {
  return `${LEGACY_RECENT_KEY}.${userId}`;
}

/** Two entries are the same if they point at the same query or item. */
function sameEntry(a: RecentEntry, b: RecentEntry): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'query':
      return a.term.toLowerCase() === (b as typeof a).term.toLowerCase();
    case 'song':
      return a.song.id === (b as typeof a).song.id;
    default:
      return a.id === (b as typeof a).id;
  }
}

function isEntry(value: unknown): value is RecentEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case 'query':
      return typeof v.term === 'string';
    case 'song':
      return !!v.song && typeof (v.song as Song).id === 'string';
    case 'artist':
    case 'album':
      return typeof v.id === 'string' && typeof v.name === 'string';
    default:
      return false;
  }
}

/** Put `entry` first, drop any older copy of it, and keep the newest MAX_RECENT. */
export function addRecent(list: readonly RecentEntry[], entry: RecentEntry): RecentEntry[] {
  return [entry, ...list.filter((e) => !sameEntry(e, entry))].slice(0, MAX_RECENT);
}

/**
 * Read this user's list. Also removes the old shared key without copying it:
 * on a shared browser, moving it into one account would show that account
 * someone else's searches.
 */
export function loadRecent(storage: StorageLike, userId: string): RecentEntry[] {
  try {
    storage.removeItem(LEGACY_RECENT_KEY);
    const raw = storage.getItem(recentSearchKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function saveRecent(storage: StorageLike, userId: string, list: readonly RecentEntry[]): void {
  try {
    storage.setItem(recentSearchKey(userId), JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    // Storage full or blocked: the in-memory list still works for this visit.
  }
}
