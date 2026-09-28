/**
 * Recently heard song ids for shuffle ordering (client).
 *
 * Server history (last 14 days, every device) merged with this device's own
 * recent plays. Shuffle has to be instant, so it reads whatever was fetched
 * last (`peekRecentlyPlayedIds`); the server list is prefetched when the
 * player mounts and refreshed in the background after each use.
 */

const REFRESH_AFTER_MS = 60_000;

let serverIds: string[] = [];
let fetchedAt = 0;
let inFlight: Promise<void> | null = null;

/** Recently heard ids as known right now. Also kicks a refresh when stale. */
export function peekRecentlyPlayedIds(localIds: readonly string[] = []): Set<string> {
  void refreshRecentlyPlayedIds();
  return new Set([...serverIds, ...localIds]);
}

export function refreshRecentlyPlayedIds(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (inFlight) return inFlight;
  if (Date.now() - fetchedAt < REFRESH_AFTER_MS) return Promise.resolve();
  inFlight = (async () => {
    try {
      const res = await fetch('/api/listening-history/recent-ids', { credentials: 'include' });
      if (!res.ok) return;
      const { songIds } = (await res.json()) as { songIds?: string[] };
      serverIds = songIds ?? [];
      fetchedAt = Date.now();
    } catch {
      // Keep the last list; local plays still count.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
