import { useQuery } from '@tanstack/react-query';
import { getCurrentLineIndex, getLyrics, parseLRC, type LyricLine } from '@/lib/services/lyrics';
import { useAudioStore } from '@/lib/stores/audio';
import { getCustomLyrics } from './LyricsMode';
import type { NowPlayingSong } from './types';

/**
 * Glass full player, art mode: the line being sung and the next one, between the record and the title.
 * Synced lyrics only (your saved custom ones first); nothing at all otherwise, so songs without them
 * keep the layout as it was. Tap to open Lyrics mode.
 */
export function LyricsPeek({ song, duration, onOpen }: { song: NowPlayingSong; duration?: number; onOpen: () => void }) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- the id is the song; artist/title/duration only help the lookup
  const { data: lines } = useQuery({
    queryKey: ['lyrics-peek', song.id],
    staleTime: Infinity,
    queryFn: async (): Promise<LyricLine[] | null> => {
      const custom = getCustomLyrics(song.id);
      if (custom && /\[\d{2}:\d{2}/.test(custom)) return parseLRC(custom);
      if (custom) return null;
      const res = await getLyrics(song.artist || 'Unknown Artist', song.name || song.title || 'Unknown', {
        songId: song.id,
        album: song.album,
        duration,
      });
      return res.syncedLyrics?.length ? res.syncedLyrics : null;
    },
  });
  const currentTime = useAudioStore((s) => s.currentTime);
  if (!lines) return null;
  const i = getCurrentLineIndex(lines, currentTime);
  // before the first line: show it coming up
  const now = i >= 0 ? lines[i]?.text : '';
  const next = lines[i + 1]?.text ?? '';
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open lyrics"
      className="block w-full min-w-0 text-left [-webkit-tap-highlight-color:transparent] active:opacity-70"
    >
      <span key={`${i}:${now}`} className="np-lyric-in block truncate text-[17px] font-semibold leading-6 text-white">
        {now || '♪'}
      </span>
      <span className="block truncate text-[15px] leading-6 text-white/45">{next || ' '}</span>
    </button>
  );
}
