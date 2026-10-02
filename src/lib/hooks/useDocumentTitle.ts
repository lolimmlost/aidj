import { useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useAudioStore } from '@/lib/stores/audio';
import { buildDocumentTitle } from '@/lib/utils/document-title';

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

  useEffect(() => {
    document.title = buildDocumentTitle(pathname, nowPlaying);
  }, [pathname, nowPlaying]);
}
