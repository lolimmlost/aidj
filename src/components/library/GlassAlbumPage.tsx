import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Pause, Play, Radio, Shuffle } from 'lucide-react';
import { getAlbums } from '@/lib/services/navidrome';
import type { Song } from '@/lib/services/navidrome/types';
import { useAudioStore } from '@/lib/stores/audio';
import { useSongFeedback } from '@/lib/hooks/useSongFeedback';
import { useDynamicColors } from '@/hooks/useDynamicColors';
import { cn } from '@/lib/utils';
import {
  Avatar, GlassAlbums, GlassSectionHead, GlassSongRow, fmt, useGlassSongSheet,
} from '@/components/search/GlassSearch';

/**
 * Glass UI (phones) album page — canvas AR / AV ("A", picked over the record
 * sleeve on 2026-11-25). The cover starts full width and shrinks as you
 * scroll, down to COVER_MIN, with the title riding just under it; then it
 * scrolls away and a compact bar (title + play) takes over.
 */

/** the cover shrinks to this (px), then scrolls away */
const COVER_MIN = 160;

interface Props {
  albumId: string;
  artistId: string;
  name: string;
  artistName: string;
  year?: number;
  genres: string[];
  songs: Song[];
  coverUrl: string;
  artistImage?: string;
}

const minutes = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`;
};

export function GlassAlbumPage({ albumId, artistId, name, artistName, year, genres, songs, coverUrl, artistImage }: Props) {
  const playSong = useAudioStore((s) => s.playSong);
  const playShuffled = useAudioStore((s) => s.playShuffled);
  const startRadio = useAudioStore((s) => s.startRadio);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const storePlaylist = useAudioStore((s) => s.playlist);
  const currentSongIndex = useAudioStore((s) => s.currentSongIndex);
  const current = useMemo(() => storePlaylist[currentSongIndex], [storePlaylist, currentSongIndex]);
  const thisAlbumPlaying = isPlaying && current?.albumId === albumId;

  const { data: feedback } = useSongFeedback(useMemo(() => songs.map((s) => s.id), [songs]));
  const sheet = useGlassSongSheet(feedback?.liked);
  const { colors } = useDynamicColors(coverUrl);
  const wash = colors?.primary ? `color-mix(in oklch, ${colors.primary} 65%, transparent)` : 'color-mix(in oklch, var(--primary) 35%, transparent)';

  const { data: artistAlbums = [] } = useQuery({
    queryKey: ['albums', artistId],
    queryFn: () => getAlbums(artistId, 0, 50),
    staleTime: 5 * 60 * 1000,
  });
  const moreBy = artistAlbums
    .filter((a) => a.id !== albumId)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    .slice(0, 8)
    .map((a) => ({ id: a.id, name: a.name, artist: artistName, artistId: a.artistId || artistId, sub: a.year ? String(a.year) : artistName }));

  const total = songs.reduce((n, s) => n + (s.duration || 0), 0);
  const meta = ['Album', year || null, genres[0] ?? null, `${songs.length} song${songs.length === 1 ? '' : 's'}, ${minutes(total)}`].filter(Boolean).join(' · ');

  const play = (s?: Song) => songs.length && playSong((s ?? songs[0]).id, songs);
  const shuffle = () => songs.length && playShuffled(songs);
  const radio = () => void startRadio({ kind: 'album', albumId });

  // Shrinking cover: the reserve box is full width and square; the cover inside
  // it is sticky under the top bar, so as you scroll it shrinks by exactly the
  // distance scrolled (the title stays right under it) until COVER_MIN, when
  // the sticky runs out and it scrolls away. Driven by refs, not re-renders.
  const reserveRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLImageElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const reserve = reserveRef.current;
    const sticky = stickyRef.current;
    const cover = coverRef.current;
    if (!reserve || !sticky || !cover) return;
    const scroller: HTMLElement | Window = (reserve.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null) ?? window;
    let frame = 0;
    const update = () => {
      frame = 0;
      const full = reserve.clientWidth;
      const top = parseFloat(getComputedStyle(sticky).top) || 0;
      const scrolled = Math.max(0, top - reserve.getBoundingClientRect().top);
      const size = Math.max(COVER_MIN, full - scrolled);
      cover.style.width = `${size}px`;
      cover.style.height = `${size}px`;
      // fade a little as it shrinks; squarer corners when big
      const t = (full - size) / Math.max(1, full - COVER_MIN);
      cover.style.opacity = String(1 - t * 0.35);
      cover.style.borderRadius = `${Math.round(t * 8)}px`;
      const play = playRef.current;
      const bar = barRef.current;
      if (play && bar) setDocked(play.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const playIcon = thisAlbumPlaying ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />;
  // the big / docked button pauses this album while it plays (marked as a user pause, so recovery won't resume it)
  const onPlayButton = () => {
    if (thisAlbumPlaying) {
      useAudioStore.getState().markUserPause();
      useAudioStore.getState().setIsPlaying(false);
    } else play();
  };

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-24 h-[620px]" style={{ background: `linear-gradient(180deg, ${wash} 0%, transparent 100%)` }} />

      {/* "‹ Artist" is part of the page (no top bar on glass phones) */}
      <Link
        to="/library/artists/$id"
        params={{ id: artistId }}
        className="relative -ml-1.5 -mt-1 mb-1 flex h-11 w-fit max-w-full items-center gap-0.5 pr-2 text-[15px] font-semibold text-foreground/80 [-webkit-tap-highlight-color:transparent]"
      >
        <ChevronLeft className="size-[18px] shrink-0" strokeWidth={2.4} />
        <span className="truncate">{artistName}</span>
      </Link>

      {/* Scrolled: a pill (height 0 in flow) slides in once the big play scrolls under it: ‹, title, play */}
      <div
        ref={barRef}
        aria-hidden={!docked}
        className={cn(
          'glass-surface sticky top-[calc(env(safe-area-inset-top)+var(--top-bar))] z-30 -mx-1 -mb-[52px] flex h-[52px] items-center gap-2 rounded-full px-1 shadow-[0_12px_30px_rgb(0_0_0/0.45)] transition-[opacity,transform] duration-200',
          docked ? 'opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
        )}
      >
        <Link
          to="/library/artists/$id"
          params={{ id: artistId }}
          tabIndex={docked ? 0 : -1}
          aria-label={`Back to ${artistName}`}
          className="grid size-11 shrink-0 place-items-center rounded-full [-webkit-tap-highlight-color:transparent]"
        >
          <ChevronLeft className="size-[22px]" strokeWidth={2.2} />
        </Link>
        <span className="min-w-0 flex-1 truncate font-display text-base font-bold">{name}</span>
        <button
          type="button"
          onClick={onPlayButton}
          tabIndex={docked ? 0 : -1}
          aria-label={thisAlbumPlaying ? 'Pause' : `Play ${name}`}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
        >
          {playIcon}
        </button>
      </div>

      {/* full-width square reserve; the sticky cover inside shrinks to COVER_MIN */}
      <div ref={reserveRef} className="relative -mx-4 aspect-square md:mx-auto md:max-w-[420px]">
        <div ref={stickyRef} className="sticky top-[calc(env(safe-area-inset-top)+var(--top-bar))] flex justify-center">
          <img ref={coverRef} src={coverUrl} alt={`${name} cover`} className="aspect-square w-full bg-muted object-cover shadow-[0_24px_50px_rgb(0_0_0/0.45)] will-change-[width,height]" />
        </div>
      </div>

      <div className="relative">
        <h1 className="mt-4 font-display text-[30px] font-extrabold leading-9 tracking-[-0.03em]">{name}</h1>
        <Link to="/library/artists/$id" params={{ id: artistId }} className="mt-2 inline-flex items-center gap-2 [-webkit-tap-highlight-color:transparent]">
          <Avatar artist={{ id: artistId, name: artistName }} image={artistImage} size={24} />
          <span className="text-sm font-bold">{artistName}</span>
        </Link>
        <p className="mt-1.5 text-[13px] text-muted-foreground">{meta}</p>

        <div className="mt-1 flex h-14 items-center gap-1">
          <button type="button" onClick={radio} aria-label="Start album radio" className="-ml-2.5 grid size-11 place-items-center rounded-full text-foreground/80">
            <Radio className="size-[22px]" />
          </button>
          <span className="flex-1" />
          <button type="button" onClick={shuffle} aria-label="Shuffle" className="grid size-11 place-items-center rounded-full text-foreground/80">
            <Shuffle className="size-[22px]" />
          </button>
          <button
            ref={playRef}
            type="button"
            onClick={onPlayButton}
            tabIndex={docked ? -1 : 0}
            aria-label={thisAlbumPlaying ? 'Pause' : `Play ${name}`}
            className={cn(
              'grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_color-mix(in_oklch,var(--primary)_45%,transparent)] transition-opacity',
              docked && 'opacity-0',
            )}
          >
            {playIcon}
          </button>
        </div>

        <div className="mt-2 flex flex-col">
          {songs.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-right font-mono text-[13px] text-muted-foreground">{s.track || i + 1}</span>
              <div className="min-w-0 flex-1">
                <GlassSongRow
                  song={s}
                  cover={false}
                  playing={s.id === current?.id}
                  onPlay={() => play(s)}
                  onMore={() => sheet.open(s)}
                  sub={`${s.artist && s.artist !== artistName ? `${s.artist} · ` : ''}${fmt(s.duration)}`}
                />
              </div>
            </div>
          ))}
        </div>
        {year ? <p className="mt-4 text-xs text-muted-foreground">{year} · {artistName}</p> : null}

        {moreBy.length > 0 && (
          <section className="mt-5 space-y-2">
            <GlassSectionHead title={`More by ${artistName}`} />
            <GlassAlbums albums={moreBy} layout="strip" onOpen={() => {}} />
          </section>
        )}
      </div>
      {sheet.element}
    </div>
  );
}
