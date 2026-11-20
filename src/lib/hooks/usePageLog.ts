import { useEffect } from 'react';
import { useAudioStore } from '@/lib/stores/audio';
import { labLog, pageId, startPageLog } from '@/lib/dj-lab/log';
import { watchPageCopies, type CopyInfo } from '@/lib/utils/page-copies';

/** What this copy of the app is doing, for the other copies' logs (#446). */
export function describeThisCopy(): CopyInfo {
  const s = useAudioStore.getState();
  const song = s.currentSongIndex >= 0 ? s.playlist[s.currentSongIndex] : undefined;
  return {
    path: location.pathname,
    visibility: document.visibilityState,
    // the store can say paused while an element still sounds (#443): report both
    playing: s.isPlaying,
    sounding: Array.from(document.querySelectorAll('audio')).some((a) => !a.paused),
    song: song ? `${song.artist ?? '?'} – ${song.title || song.name}` : undefined,
    pos: song ? Math.round(s.currentTime) : undefined,
  };
}

/**
 * Page logging on every page (#446): how this page started and what it goes through
 * (`startPageLog`), and which other copies of the app are open next to it (#443).
 */
export function usePageLog() {
  useEffect(() => {
    startPageLog();
    return watchPageCopies({ id: pageId(), describe: describeThisCopy, log: labLog });
  }, []);
}
