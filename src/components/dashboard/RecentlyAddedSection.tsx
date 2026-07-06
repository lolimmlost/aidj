import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Clock, Disc, Play, Music, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useAudioStore } from '@/lib/stores/audio';
import { cn } from '@/lib/utils';

interface RecentAlbum {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  coverArt?: string;
  songCount: number;
  year?: number;
  created: string;
}

interface RecentSong {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId: string;
  coverArt?: string;
  duration: number;
  track: number;
}

function useRecentlyAddedAlbums(size = 12) {
  return useQuery({
    queryKey: ['recently-added-albums', size],
    queryFn: async () => {
      const res = await fetch(`/api/navidrome/rest/getAlbumList2?type=newest&size=${size}`);
      if (!res.ok) return [];
      const data = await res.json();
      const albums = data['subsonic-response']?.albumList2?.album || [];
      return albums as RecentAlbum[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useRecentlyAddedSongs(size = 12) {
  return useQuery({
    queryKey: ['recently-added-songs', size],
    queryFn: async () => {
      const res = await fetch(`/api/navidrome/rest/getAlbumList2?type=newest&size=6`);
      if (!res.ok) return [];
      const data = await res.json();
      const albums = data['subsonic-response']?.albumList2?.album || [];

      const songs: RecentSong[] = [];
      for (const album of albums) {
        const songRes = await fetch(`/api/navidrome/rest/getAlbum?id=${album.id}`);
        if (!songRes.ok) continue;
        const songData = await songRes.json();
        const albumSongs = songData['subsonic-response']?.album?.song || [];
        for (const s of albumSongs) {
          songs.push({
            id: s.id,
            title: s.title || s.name || 'Unknown',
            artist: s.artist || album.artist || 'Unknown',
            artistId: s.artistId,
            album: album.name,
            albumId: album.id,
            coverArt: s.coverArt || album.coverArt,
            duration: s.duration || 0,
            track: s.track || 0,
          });
        }
        if (songs.length >= size) break;
      }
      return songs.slice(0, size);
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useScrollControls(ref: React.RefObject<HTMLDivElement | null>) {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [ref, updateScrollState]);

  const scrollBy = useCallback((direction: 'left' | 'right') => {
    const el = ref.current;
    if (!el) return;
    const pageWidth = el.clientWidth * 0.8;
    el.scrollBy({ left: direction === 'left' ? -pageWidth : pageWidth, behavior: 'smooth' });
  }, [ref]);

  return { canScrollLeft, canScrollRight, scrollBy };
}

function ScrollArrow({ direction, onClick, visible }: { direction: 'left' | 'right'; onClick: () => void; visible: boolean }) {
  if (!visible) return null;
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      className={cn(
        'hidden md:grid absolute top-1/2 -translate-y-1/2 z-10 size-9 place-items-center rounded-full',
        'bg-background/90 border shadow-lg backdrop-blur-sm',
        'hover:bg-accent transition-colors',
        direction === 'left' ? '-left-3' : '-right-3',
      )}
      aria-label={`Scroll ${direction}`}
    >
      <Icon className="size-4" />
    </button>
  );
}

function AlbumCard({ album }: { album: RecentAlbum }) {
  const [imgError, setImgError] = useState(false);
  const coverUrl = album.coverArt
    ? `/api/navidrome/rest/getCoverArt?id=${album.coverArt}&size=300`
    : null;

  return (
    <Link
      to="/library/artists/$id/albums/$albumId"
      params={{ id: album.artistId || '', albumId: album.id }}
      className="group flex w-36 sm:w-40 shrink-0 snap-start flex-col gap-2 rounded-xl p-2 transition-colors hover:bg-muted/40"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {coverUrl && !imgError ? (
          <img
            src={coverUrl}
            alt={album.name}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <Disc className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        <span className="absolute bottom-2 right-2 grid size-8 translate-y-2 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100">
          <Play className="size-3.5 fill-current" />
        </span>
      </div>
      <div className="min-w-0 px-0.5">
        <p className="truncate text-sm font-medium">{album.name}</p>
        <p className="truncate text-xs text-muted-foreground">{album.artist}</p>
      </div>
    </Link>
  );
}

function SongCard({ song }: { song: RecentSong }) {
  const [imgError, setImgError] = useState(false);
  const { playSong, setIsPlaying } = useAudioStore();
  const coverUrl = song.coverArt
    ? `/api/navidrome/rest/getCoverArt?id=${song.coverArt}&size=200`
    : null;

  const handlePlay = () => {
    const queueSong = {
      id: song.id,
      name: song.title,
      title: song.title,
      artist: song.artist,
      album: song.album,
      albumId: song.albumId,
      url: `/api/navidrome/stream/${song.id}`,
      duration: song.duration,
      track: song.track,
    };
    playSong(song.id, [queueSong]);
    setIsPlaying(true);
  };

  return (
    <button
      onClick={handlePlay}
      className="group flex w-36 sm:w-40 shrink-0 snap-start flex-col gap-2 rounded-xl p-2 text-left transition-colors hover:bg-muted/40"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {coverUrl && !imgError ? (
          <img
            src={coverUrl}
            alt={song.title}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <Music className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        <span className="absolute bottom-2 right-2 grid size-8 translate-y-2 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100">
          <Play className="size-3.5 fill-current" />
        </span>
      </div>
      <div className="min-w-0 px-0.5">
        <p className="truncate text-sm font-medium">{song.title}</p>
        <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
      </div>
    </button>
  );
}

function ScrollableRow({ children, label }: { children: React.ReactNode; label: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { canScrollLeft, canScrollRight, scrollBy } = useScrollControls(scrollRef);

  return (
    <div className="relative group/carousel">
      <ScrollArrow direction="left" onClick={() => scrollBy('left')} visible={canScrollLeft} />
      <ScrollArrow direction="right" onClick={() => scrollBy('right')} visible={canScrollRight} />
      <div
        ref={scrollRef}
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 snap-x snap-mandatory md:snap-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

export function RecentlyAddedSection() {
  const { data: albums = [], isLoading: albumsLoading } = useRecentlyAddedAlbums();
  const { data: songs = [], isLoading: songsLoading } = useRecentlyAddedSongs();

  if (albumsLoading && songsLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-500" />
            Recently Added
          </h3>
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-36 sm:w-40 shrink-0 space-y-2 p-2 animate-pulse">
                <div className="aspect-square rounded-lg bg-muted" />
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (albums.length === 0 && songs.length === 0) return null;

  return (
    <div className="space-y-6">
      {albums.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Disc className="h-4 w-4 text-violet-500" />
            Recently Added Albums
          </h3>
          <ScrollableRow label="Recently added albums">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </ScrollableRow>
        </div>
      )}

      {songs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Music className="h-4 w-4 text-cyan-500" />
            Recently Added Songs
          </h3>
          <ScrollableRow label="Recently added songs">
            {songs.map((song) => (
              <SongCard key={song.id} song={song} />
            ))}
          </ScrollableRow>
        </div>
      )}
    </div>
  );
}
