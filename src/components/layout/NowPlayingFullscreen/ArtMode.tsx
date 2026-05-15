/**
 * Art mode — the canonical big-album-art view with horizontal swipe to
 * skip prev/next. This is the only mode in PR A; lyrics / visualizer /
 * queue plug in via the same shape in subsequent PRs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { getCoverArtUrl } from '@/components/ui/album-art';
import type { NowPlayingSong } from './types';

interface ArtModeProps {
  song: NowPlayingSong;
  onPrevious: () => void;
  onNext: () => void;
}

export function ArtMode({ song, onPrevious, onNext }: ArtModeProps) {
  const [imgError, setImgError] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  const artSwipeRef = useRef<{ x: number; time: number } | null>(null);
  const artOffsetRef = useRef(0);
  const artContainerRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setImgError(false); }, [song.id]);

  useEffect(() => {
    if (!swipeDirection) return;
    const t = setTimeout(() => setSwipeDirection(null), 300);
    return () => clearTimeout(t);
  }, [swipeDirection]);

  const handleArtTouchStart = useCallback((e: React.TouchEvent) => {
    artSwipeRef.current = { x: e.touches[0].clientX, time: Date.now() };
    artOffsetRef.current = 0;
  }, []);

  const handleArtTouchMove = useCallback((e: React.TouchEvent) => {
    if (!artSwipeRef.current) return;
    const deltaX = e.touches[0].clientX - artSwipeRef.current.x;
    artOffsetRef.current = deltaX;
    if (artContainerRef.current) {
      const dampened = deltaX * 0.6;
      artContainerRef.current.style.transform = `translateX(${dampened}px)`;
      artContainerRef.current.style.transition = 'none';
      artContainerRef.current.style.opacity = `${1 - Math.abs(dampened) / 400}`;
    }
  }, []);

  const handleArtTouchEnd = useCallback(() => {
    if (artContainerRef.current) {
      const offset = artOffsetRef.current;
      const velocity = artSwipeRef.current
        ? Math.abs(offset) / (Date.now() - artSwipeRef.current.time)
        : 0;
      if (Math.abs(offset) > 80 || velocity > 0.3) {
        if (offset > 0) {
          setSwipeDirection('right');
          onPrevious();
        } else {
          setSwipeDirection('left');
          onNext();
        }
      }
      artContainerRef.current.style.transition = 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1), opacity 250ms ease';
      artContainerRef.current.style.transform = 'translateX(0)';
      artContainerRef.current.style.opacity = '1';
    }
    artSwipeRef.current = null;
    artOffsetRef.current = 0;
  }, [onNext, onPrevious]);

  const artId = song.albumId || song.id;
  const coverUrl = getCoverArtUrl(artId, 600);
  const songArtist = song.artist || 'Unknown';

  return (
    <div
      className="w-[75vw] sm:w-[60vw] md:w-[50vw] lg:w-auto lg:flex-1 max-w-[500px] aspect-square relative mx-auto lg:mx-0 overflow-visible touch-pan-y flex-shrink-0"
      onTouchStart={handleArtTouchStart}
      onTouchMove={handleArtTouchMove}
      onTouchEnd={handleArtTouchEnd}
    >
      <div
        ref={artContainerRef}
        className={cn(
          'w-full h-full',
          swipeDirection === 'left' && 'animate-[slideInRight_250ms_ease-out]',
          swipeDirection === 'right' && 'animate-[slideInLeft_250ms_ease-out]',
        )}
      >
        {coverUrl && !imgError ? (
          <img
            src={coverUrl}
            alt={`${song.name || song.title || 'Unknown'} album art`}
            className="w-full h-full object-cover rounded-2xl shadow-2xl shadow-black/50 select-none pointer-events-none"
            onError={() => setImgError(true)}
            draggable={false}
          />
        ) : (
          <div className="w-full h-full rounded-2xl bg-white/10 flex items-center justify-center">
            <span className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white/30">
              {songArtist.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
