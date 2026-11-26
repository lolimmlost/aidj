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
/** Any song shape with an id (and its BPM tag when the list carried it). */
export type BeatSong = Pick<Song, 'id'> & { bpm?: number };

function useGrid(id: string | undefined) {
  return useQuery({
    queryKey: ['song-grid', id],
    enabled: !!id,
    // a grid can appear any time (the Lab analyses and uploads), so "none yet" is only trusted briefly
    staleTime: (q) => (q.state.data ? 10 * 60_000 : 30_000),
    refetchInterval: (q) => (q.state.data ? false : 30_000),
    queryFn: async (): Promise<Grid | null> => {
      const res = await fetch(`/api/dj/grids?id=${encodeURIComponent(id!)}`, { credentials: 'include' });
      if (!res.ok) return null;
      const a = (await res.json()).data?.analysis as Grid | undefined;
      return a && a.bpm > 0 && a.barLen > 0 ? { bpm: a.bpm, bar0: a.bar0, barLen: a.barLen } : null;
    },
  });
}

function useTagBpm(song: BeatSong | null, skip: boolean) {
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
 * A fresh position on each song change, play, seek, and every 20 s against drift, read the
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
  /** seconds per beat / per bar at the folded tempo */
  beat: number;
  bar: number;
  /** animation duration for a loop of `beats` beats */
  loop: (beats: number) => CSSProperties;
  /**
   * Put on the element that holds the animations. Each `[data-beat]` animation inside it is phased to
   * the downbeat in place (Web Animations currentTime) on every sync: nothing remounts, so the record
   * keeps turning and the cover never reloads.
   */
  ref: (el: HTMLElement | null) => void;
}

/** Below this the correction would read as a twitch, not a fix. */
const SNAP_MS = 40;

function phase(el: HTMLElement, songTime: number, bar0: number) {
  if (typeof el.getAnimations !== 'function') return;
  for (const a of el.getAnimations({ subtree: true })) {
    const effect = a.effect as KeyframeEffect | null;
    if (!(effect?.target instanceof Element) || !effect.target.hasAttribute('data-beat')) continue;
    const dur = Number(effect.getComputedTiming().duration);
    if (!(dur > 0)) continue;
    const want = mod((songTime - bar0) * 1000, dur);
    const off = Math.abs(want - mod(Number(a.currentTime ?? 0), dur));
    if (Math.min(off, dur - off) > SNAP_MS) a.currentTime = want;
  }
}

export function useBeat(song: BeatSong | null, isPlaying: boolean): Beat | null {
  const { data: grid } = useGrid(song?.id);
  const tag = useTagBpm(song, !!grid);
  const sync = useSyncPoint(!!grid && isPlaying, song?.id);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const raw = grid?.bpm || tag;
  const bpm = raw > 0 ? fold(raw) : 0;

  // Phase once per sync point, after the frame that applied the durations. Never from render: render
  // runs on every timeupdate, and re-deriving a delay there shoved the phase forward each time.
  useEffect(() => {
    if (!el || !grid || !sync || !bpm) return;
    const id = requestAnimationFrame(() => phase(el, sync.t + (performance.now() - sync.at) / 1000, grid.bar0));
    return () => cancelAnimationFrame(id);
  }, [el, grid, sync, bpm]);

  if (!song || !bpm) return null;
  const beat = 60 / bpm;
  // the grid's bar is at the native tempo; folding keeps 4 beats per bar at the new count
  const bar = beat * 4;
  return {
    bpm,
    onGrid: !!grid,
    beat,
    bar,
    loop: (beats) => ({ animationDuration: `${beat * beats}s` }),
    ref: setEl,
  };
}
