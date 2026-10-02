import { useEffect, useSyncExternalStore } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useAudioStore } from '@/lib/stores/audio';
import { buildDocumentTitle } from '@/lib/utils/document-title';

// Name a detail page reports for itself (playlist / artist / album), keyed by
// the path it was set on so a stale name never leaks onto the next page.
type PageTitle = { path: string; title: string } | null;
let pageTitle: PageTitle = null;
const listeners = new Set<() => void>();

function setPageTitle(next: PageTitle) {
  pageTitle = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Let a detail page put its real name in the tab ("Road Trip · AIDJ" instead
 * of "Playlist · AIDJ"). Pass undefined while the data loads; the route label
 * is used until then.
 */
export function usePageTitle(title: string | null | undefined) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (!title) return;
    const entry = { path: pathname, title };
    setPageTitle(entry);
    return () => {
      if (pageTitle === entry) setPageTitle(null);
    };
  }, [title, pathname]);
}

/**
 * Keeps `document.title` in sync with the current route and, while audio is
 * playing, the current track (#287). Runs client-side only; SSR keeps the
 * root `head()` title.
 */
export function useDocumentTitle() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nowPlaying = useAudioStore((s) =>
    s.isPlaying && s.currentSongIndex >= 0 ? s.playlist[s.currentSongIndex] ?? null : null,
  );
  const page = useSyncExternalStore(subscribe, () => pageTitle, () => null);
  const pageName = page && page.path === pathname ? page.title : null;

  useEffect(() => {
    document.title = buildDocumentTitle(pathname, nowPlaying, pageName);
  }, [pathname, nowPlaying, pageName]);
}
