import { useEffect, useRef, useState } from 'react';
import { addRecent, loadRecent, saveRecent as storeRecent, type RecentEntry } from '@/lib/utils/recent-searches';

/** How long typing has to pause before the query is saved to recent searches. */
export const QUERY_SAVE_DELAY_MS = 1200;

/**
 * The signed-in user's recent searches on the search page: loads them, saves the
 * typed query after a pause, and records clicked results.
 */
export function useRecentSearches(userId: string | undefined, query: string) {
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    setRecent(loadRecent(localStorage, userId));
  }, [userId]);

  // Always change the latest list, never the one a callback captured: the typed-query
  // timer fires 1.2 s after it was set, and a click saved in between must survive it.
  const updateRecent = (change: (list: RecentEntry[]) => RecentEntry[]) =>
    setRecent((prev) => {
      const next = change(prev);
      if (userId) storeRecent(localStorage, userId, next);
      return next;
    });

  const recordRecent = (entry: RecentEntry) => updateRecent((list) => addRecent(list, entry));
  const removeRecent = (entry: RecentEntry) => updateRecent((list) => list.filter((r) => r !== entry));
  const clearRecent = () => updateRecent(() => []);

  // Auto-save recent search after typing pause
  useEffect(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    const term = query.trim();
    if (!term) return;
    commitTimer.current = setTimeout(() => {
      recordRecent({ kind: 'query', term });
    }, QUERY_SAVE_DELAY_MS);
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return { recent, recordRecent, removeRecent, clearRecent };
}
