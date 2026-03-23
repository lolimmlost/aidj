import React, { useRef, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Heart,
  Loader2,
  Shuffle,
  Repeat,
  Repeat1,
  MicVocal,
  Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { cn } from '@/lib/utils';

const formatTime = (time: number) => {
  if (!isFinite(time) || time < 0) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export interface FullscreenPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: { id: string; name?: string; title?: string; artist?: string; albumId?: string } | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  isLiked: boolean;
  isLikePending: boolean;
  isShuffled: boolean;
  repeatMode: 'off' | 'all' | 'one';
  onTogglePlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onToggleLike: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onShowLyrics: () => void;
}

export function FullscreenPlayer({
  isOpen,
  onClose,
  currentSong,
  isPlaying,
  isLoading,
  currentTime,
  duration,
  isLiked,
  isLikePending,
  isShuffled,
  repeatMode,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onSeek,
  onToggleLike,
  onToggleShuffle,
  onToggleRepeat,
  onShowLyrics,
}: FullscreenPlayerProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  // Vertical swipe-to-dismiss refs
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchOffsetRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Horizontal swipe refs for album art
  const artSwipeRef = useRef<{ x: number; time: number } | null>(null);
  const artOffsetRef = useRef(0);
  const artAxisLockedRef = useRef<'x' | 'y' | null>(null);
  const artContainerRef = useRef<HTMLDivElement>(null);

  // Handle open/close animation — setState drives mount/unmount for CSS transitions
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      // Trigger animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Reset image error on song change
  const currentSongId = currentSong?.id;
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setImgError(false); }, [currentSongId]);

  // Clear swipe animation after it plays
  useEffect(() => {
    if (!swipeDirection) return;
    const timer = setTimeout(() => setSwipeDirection(null), 300);
    return () => clearTimeout(timer);
  }, [swipeDirection]);

  // --- Album art horizontal swipe (prev/next song) ---
  const handleArtTouchStart = useCallback((e: React.TouchEvent) => {
    artSwipeRef.current = { x: e.touches[0].clientX, time: Date.now() };
    artOffsetRef.current = 0;
    artAxisLockedRef.current = null;
    // Also store Y for axis detection
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
    touchOffsetRef.current = 0;
  }, []);

  const handleArtTouchMove = useCallback((e: React.TouchEvent) => {
    if (!artSwipeRef.current || !touchStartRef.current) return;

    const deltaX = e.touches[0].clientX - artSwipeRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;

    // Lock axis once movement exceeds threshold
    if (!artAxisLockedRef.current) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        artAxisLockedRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
      } else {
        return;
      }
    }

    if (artAxisLockedRef.current === 'x') {
      // Horizontal: drag album art
      e.preventDefault();
      artOffsetRef.current = deltaX;
      if (artContainerRef.current) {
        // Dampen the drag slightly for a rubbery feel
        const dampened = deltaX * 0.6;
        artContainerRef.current.style.transform = `translateX(${dampened}px)`;
        artContainerRef.current.style.transition = 'none';
        // Reduce opacity as it moves away
        artContainerRef.current.style.opacity = `${1 - Math.abs(dampened) / 400}`;
      }
    } else {
      // Vertical: dismiss (delegate to container)
      if (deltaY > 0 && containerRef.current) {
        touchOffsetRef.current = deltaY;
        containerRef.current.style.transform = `translateY(${deltaY}px)`;
        containerRef.current.style.transition = 'none';
      }
    }
  }, []);

  const handleArtTouchEnd = useCallback(() => {
    const axis = artAxisLockedRef.current;

    if (axis === 'x' && artContainerRef.current) {
      const offset = artOffsetRef.current;
      const velocity = artSwipeRef.current
        ? Math.abs(offset) / (Date.now() - artSwipeRef.current.time)
        : 0;

      // Trigger if dragged >80px or fast flick (>0.3px/ms)
      if (Math.abs(offset) > 80 || velocity > 0.3) {
        if (offset > 0) {
          // Swipe right → previous
          setSwipeDirection('right');
          onPrevious();
        } else {
          // Swipe left → next
          setSwipeDirection('left');
          onNext();
        }
      }

      // Snap back
      artContainerRef.current.style.transition = 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1), opacity 250ms ease';
      artContainerRef.current.style.transform = 'translateX(0)';
      artContainerRef.current.style.opacity = '1';
    } else if (axis === 'y' || !axis) {
      // Vertical dismiss or no movement
      if (containerRef.current) {
        containerRef.current.style.transition = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';
        if (touchOffsetRef.current > 100) {
          containerRef.current.style.transform = 'translateY(100%)';
          onClose();
        } else {
          containerRef.current.style.transform = 'translateY(0)';
        }
      }
    }

    artSwipeRef.current = null;
    artOffsetRef.current = 0;
    artAxisLockedRef.current = null;
    touchStartRef.current = null;
    touchOffsetRef.current = 0;
  }, [onClose, onPrevious, onNext]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!visible || !currentSong) return null;

  // Use albumId or fall back to songId for cover art
  const artId = currentSong.albumId || currentSong.id;
  const coverUrl = getCoverArtUrl(artId, 600);
  const bgCoverUrl = getCoverArtUrl(artId, 128); // smaller for blurred bg
  const songTitle = currentSong.name || currentSong.title || 'Unknown';
  const songArtist = currentSong.artist || 'Unknown';

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[60] transition-opacity duration-300',
        animating ? 'opacity-100' : 'opacity-0'
      )}
    >
      {/* Solid black base — nothing bleeds through */}
      <div className="absolute inset-0 bg-black" />
      {/* Blurred album art tint on top */}
      {bgCoverUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center scale-110 blur-3xl opacity-40"
          style={{ backgroundImage: `url(${bgCoverUrl})` }}
        />
      )}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content container */}
      <div
        ref={containerRef}
        className={cn(
          'relative h-full flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          animating ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] py-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 text-white/80 hover:text-white hover:bg-white/10"
            onClick={onClose}
          >
            <ChevronDown className="h-6 w-6" />
          </Button>
          <p className="text-xs font-medium text-white/60 uppercase tracking-wider">
            Now Playing
          </p>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>

        {/* Main content - centered */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 max-w-lg mx-auto w-full gap-8">
          {/* Album Art — swipeable */}
          <div
            className="w-[80vw] max-w-[400px] aspect-square relative mx-auto overflow-visible touch-pan-y"
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
                  alt={`${songTitle} album art`}
                  className="w-full h-full object-cover rounded-2xl shadow-2xl shadow-black/50 select-none pointer-events-none"
                  onError={() => setImgError(true)}
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full rounded-2xl bg-white/10 flex items-center justify-center">
                  <span className="text-6xl font-bold text-white/30">
                    {songArtist.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Song info */}
          <div className="w-full text-center">
            <h2 className="text-xl font-bold text-white truncate">{songTitle}</h2>
            <p className="text-sm text-white/60 mt-1 truncate">{songArtist}</p>
          </div>

          {/* Progress */}
          <div className="w-full space-y-2">
            <Slider
              value={[isFinite(currentTime) ? currentTime : 0]}
              max={isFinite(duration) && duration > 0 ? duration : 100}
              step={0.1}
              onValueChange={([v]) => onSeek(v)}
              className="w-full [&_[data-slot=slider-track]]:bg-white/20 [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:bg-white"
            />
            <div className="flex justify-between">
              <span className="text-xs font-mono text-white/50">{formatTime(currentTime)}</span>
              <span className="text-xs font-mono text-white/50">-{formatTime(Math.max(0, duration - currentTime))}</span>
            </div>
          </div>

          {/* Main controls */}
          <div className="flex items-center justify-center gap-6 w-full">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-10 w-10 p-0 hover:bg-white/10',
                isShuffled ? 'text-primary' : 'text-white/70'
              )}
              onClick={onToggleShuffle}
            >
              <Shuffle className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-12 w-12 p-0 text-white hover:bg-white/10"
              onClick={onPrevious}
            >
              <SkipBack className="h-6 w-6 fill-current" />
            </Button>

            <Button
              variant="default"
              size="sm"
              className="h-16 w-16 p-0 rounded-full shadow-lg"
              onClick={onTogglePlayPause}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-7 w-7" />
              ) : (
                <Play className="h-7 w-7 ml-1" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-12 w-12 p-0 text-white hover:bg-white/10"
              onClick={onNext}
            >
              <SkipForward className="h-6 w-6 fill-current" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-10 w-10 p-0 hover:bg-white/10',
                repeatMode !== 'off' ? 'text-primary' : 'text-white/70'
              )}
              onClick={onToggleRepeat}
            >
              {repeatMode === 'one' ? (
                <Repeat1 className="h-5 w-5" />
              ) : (
                <Repeat className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Secondary actions */}
          <div className="flex items-center justify-center gap-8">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-white/10"
              onClick={onToggleLike}
              disabled={isLikePending}
            >
              <Heart className={cn('h-5 w-5', isLiked && 'fill-red-500 text-red-500')} />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-white/10"
              onClick={onShowLyrics}
            >
              <MicVocal className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: songTitle,
                    text: `${songTitle} by ${songArtist}`,
                  }).catch(() => {});
                }
              }}
            >
              <Share2 className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Bottom safe area spacer */}
        <div className="h-8 pb-[env(safe-area-inset-bottom)]" />
      </div>
    </div>,
    document.body
  );
}
