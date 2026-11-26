import { useEffect, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAudioStore } from '@/lib/stores/audio';
import type { Song } from '@/lib/types/song';

/**
 * Tempo and downbeat for UI animation, never from the audio itself: tapping the stream (an analyser,
 * the visualizer) is what has broken iOS playback before. Best source is the Lab's grid for the song
 * (/api/dj/grids: tempo + bar0, the first downbeat); else the BPM tag (tempo only, no phase).
 */
type Grid = { bpm: number; bar0: number; barLen: number };

function useGrid(id: string | undefined) {
  return useQuery({
    queryKey: ['song-grid', id],
    enabled: !!id,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Grid | null> => {
      const res = await fetch(`/api/dj/grids?id=${encodeURIComponent(id!)}`, { credentials: 'include' });
      if (!res.ok) return null;
      const a = (await res.json()).data?.analysis as Grid | undefined;
      return a && a.bpm > 0 && a.barLen > 0 ? { bpm: a.bpm, bar0: a.bar0, barLen: a.barLen } : null;
    },
  });
}

function useTagBpm(song: Song | null, skip: boolean) {
  const { data } = useQuery({
    queryKey: ['song-bpm-tag', song?.id],
    enabled: !!song && !song.bpm && !skip,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`/api/navidrome/rest/getSong?id=${encodeURIComponent(song!.id)}`, { credentials: 'include' });
      if (!res.ok) return null;
      const bpm = Number((await res.json())['subsonic-response']?.song?.bpm);
      return bpm > 0 ? bpm : null;
    },
  });
  return song?.bpm || data || 0;
}

/** Fold a tempo into 60–180 so a pulse reads as the beat. */
const fold = (bpm: number) => {
  let b = bpm;
  while (b > 180) b /= 2;
  while (b < 60) b *= 2;
  return b;
};

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Restarts on each fresh position (song change, play, seek, and every 20 s against drift), read the
 * moment the player reports it so it's not a stale timeupdate.
 */
function useSyncPoint(active: boolean, songId: string | undefined) {
  const [sync, setSync] = useState<{ n: number; t: number; at: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    let last: { t: number; at: number } | null = null;
    let lastSync = -Infinity;
    return useAudioStore.subscribe((st) => {
      const t = st.currentTime;
      const at = performance.now();
      if (last && t === last.t) return;
      const jumped = !last || Math.abs(t - (last.t + (at - last.at) / 1000)) > 0.4;
      last = { t, at };
      if (jumped || at - lastSync > 20_000) {
        lastSync = at;
        setSync((s) => ({ n: (s?.n ?? 0) + 1, t, at }));
      }
    });
  }, [active, songId]);
  return active ? sync : null;
}

export interface Beat {
  bpm: number;
  /** on the song's real downbeat (Lab grid), not just its tempo */
  onGrid: boolean;
  /** remount key for the animated elements: a new phase each sync */
  key: string;
  /** seconds per beat / per bar at the folded tempo */
  beat: number;
  bar: number;
  /** animation timing for a loop of `beats` beats, phased to the downbeat when known */
  loop: (beats: number) => CSSProperties;
}

export function useBeat(song: Song | null, isPlaying: boolean): Beat | null {
  const { data: grid } = useGrid(song?.id);
  const tag = useTagBpm(song, !!grid);
  const sync = useSyncPoint(!!grid && isPlaying, song?.id);
  const raw = grid?.bpm || tag;
  if (!song || !(raw > 0)) return null;
  const bpm = fold(raw);
  const beat = 60 / bpm;
  // the grid's bar is at the native tempo; folding keeps 4 beats per bar at the new count
  const bar = beat * 4;
  const now = sync ? sync.t + (performance.now() - sync.at) / 1000 : null;
  return {
    bpm,
    onGrid: !!grid,
    key: `${song.id}:${sync?.n ?? 0}`,
    beat,
    bar,
    loop: (beats) => {
      const dur = beat * beats;
      const style: CSSProperties = { animationDuration: `${dur}s` };
      if (grid && now != null) style.animationDelay = `${-mod(now - grid.bar0, dur)}s`;
      return style;
    },
  };
}
