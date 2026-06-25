/**
 * Unified Now Playing fullscreen surface (chassis).
 *
 * Replaces the old single-purpose FullscreenPlayer. The chassis renders
 * the persistent header, metadata, scrubber, and transport — and swaps
 * out a mode-specific content area in the middle. Phase B ships the
 * 'art' and 'lyrics' modes; phases C/D add visualizer / queue.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@tanstack/react-router';
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
  Share2,
  ListMusic,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { cn } from '@/lib/utils';
import { AIDJToggle } from '@/components/ai-dj-toggle';
import { AddToPlaylistButton } from '@/components/playlists/AddToPlaylistButton';
import { useAudioStore } from '@/lib/stores/audio';
import { ArtMode } from './ArtMode';
import { LyricsMode } from './LyricsMode';
import { VisualizerMode } from './VisualizerMode';
import { ModeSwitcher } from './ModeSwitcher';
import type { NowPlayingFullscreenProps, NPMode } from './types';

const formatTime = (time: number) => {
  if (!isFinite(time) || time < 0) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export function NowPlayingFullscreen({
  isOpen,
  onClose,
  initialMode = 'art',
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
  analyserNode,
}: NowPlayingFullscreenProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [mode, setMode] = useState<NPMode>(initialMode);
  const [isExpanded, setIsExpanded] = useState(false);

  // Reset mode on each open so re-opening from a fresh trigger respects
  // the caller's initialMode (e.g. opening from the player-bar lyrics
  // button should land on 'lyrics' even if the user previously closed
  // the surface while on 'art').
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) setMode(initialMode);
  }, [isOpen, initialMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchOffsetRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mount/unmount with CSS-driven slide-up animation.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    } else {
      setAnimating(false);
      const t = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Vertical swipe-to-dismiss on the body (not the art swipe area).
  const handleBodyTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
    touchOffsetRef.current = 0;
  }, []);

  const handleBodyTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;
    if (deltaY > 0 && containerRef.current) {
      touchOffsetRef.current = deltaY;
      containerRef.current.style.transform = `translateY(${deltaY}px)`;
      containerRef.current.style.transition = 'none';
    }
  }, []);

  const handleBodyTouchEnd = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.style.transition = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';
      if (touchOffsetRef.current > 100) {
        containerRef.current.style.transform = 'translateY(100%)';
        onClose();
      } else {
        containerRef.current.style.transform = 'translateY(0)';
      }
    }
    touchStartRef.current = null;
    touchOffsetRef.current = 0;
  }, [onClose]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setIsExpanded(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Collapse expanded mode when closing the surface.
  useEffect(() => {
    if (!isOpen && isExpanded) {
      setIsExpanded(false);
      document.exitFullscreen?.().catch(() => {});
    }
  }, [isOpen]);

  // Esc to close (or collapse expanded first).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isExpanded) {
          toggleExpanded();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isExpanded, onClose, toggleExpanded]);

  // Closes the surface, then runs an action (used by clickable artist link
  // and song-radio trigger so the navigation/queue change isn't hidden
  // behind the open fullscreen).
  const closeAndThen = useCallback((fn: () => void) => {
    onClose();
    setTimeout(fn, 150);
  }, [onClose]);

  if (!visible || !currentSong) return null;

  const artId = currentSong.albumId || currentSong.id;
  const bgCoverUrl = getCoverArtUrl(artId, 128);
  const songTitle = currentSong.name || currentSong.title || 'Unknown';
  const songArtist = currentSong.artist || 'Unknown';
  const artistId = currentSong.artistId;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[60] transition-opacity duration-300',
        animating ? 'opacity-100' : 'opacity-0'
      )}
    >
      {/* Solid black base + blurred album art tint.
       *  Skipped in visualizer mode because the opaque canvas covers the
       *  same area and the blur-3xl filter is expensive GPU work that
       *  would never be visible. */}
      <div className="absolute inset-0 bg-black" />
      {bgCoverUrl && mode !== 'visualizer' && (
        <div
          className="absolute inset-0 bg-cover bg-center scale-110 blur-3xl opacity-40"
          style={{ backgroundImage: `url(${bgCoverUrl})` }}
        />
      )}
      {mode !== 'visualizer' && <div className="absolute inset-0 bg-black/40" />}

      {/* Slide-up container */}
      <div
        ref={containerRef}
        className={cn(
          'relative h-full flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          animating ? 'translate-y-0' : 'translate-y-full'
        )}
        onTouchStart={handleBodyTouchStart}
        onTouchMove={handleBodyTouchMove}
        onTouchEnd={handleBodyTouchEnd}
      >
        {/* Persistent header — chevron + mode pill + expand */}
        {!isExpanded && (
          <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] py-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 text-white/80 hover:text-white hover:bg-white/10"
              onClick={onClose}
            >
              <ChevronDown className="h-6 w-6" />
            </Button>
            <ModeSwitcher mode={mode} onModeChange={setMode} />
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 text-white/80 hover:text-white hover:bg-white/10"
              onClick={toggleExpanded}
              title="Expand"
            >
              <Maximize2 className="h-5 w-5" />
            </Button>
          </div>
        )}

        {/* Mode swap area + persistent metadata/transport (portrait stack on
            mobile, side-by-side on desktop).
            items-center on art mode for cosmetic balance; items-stretch on
            lyrics/visualizer modes so both columns fill row height — the
            mode column scrolls/renders internally and the metadata column
            centers its own content via justify-center, keeping metadata
            position stable regardless of mode-column content.
            When expanded, mode content fills the entire surface. */}
        <div className={cn(
          "flex-1 flex flex-col lg:flex-row justify-center mx-auto w-full min-h-0",
          isExpanded
            ? "items-stretch p-0"
            : cn(
                "px-6 sm:px-8 lg:px-16 gap-6 sm:gap-8 lg:gap-16 max-w-6xl",
                mode === 'art' ? "items-center" : "items-stretch"
              )
        )}>

          {/* === Mode swap area === */}
          {mode === 'art' && (
            <ArtMode song={currentSong} onPrevious={onPrevious} onNext={onNext} expanded={isExpanded} />
          )}
          {mode === 'lyrics' && (
            <div className={cn("w-full flex min-h-0", isExpanded ? "flex-1" : "lg:flex-1 flex-1")}>
              <LyricsMode />
            </div>
          )}
          {mode === 'visualizer' && (
            <div className={cn("w-full flex min-h-0", isExpanded ? "flex-1" : "lg:flex-1 flex-1")}>
              <VisualizerMode analyserNode={analyserNode ?? null} />
            </div>
          )}

          {/* === Persistent metadata + transport column (hidden when expanded) === */}
          {!isExpanded && (
            <div className={cn(
              "w-full lg:flex-1 lg:max-w-md flex flex-col items-center gap-6 sm:gap-8",
              mode !== 'art' && "justify-center"
            )}>
              {/* Song info — title links to album page (song info context); artist links to artist page */}
              <div className="w-full text-center lg:text-left">
                {artistId && currentSong.albumId ? (
                  <Link
                    to="/library/artists/$id/albums/$albumId"
                    params={{ id: artistId, albumId: currentSong.albumId }}
                    onClick={() => onClose()}
                    className="text-xl sm:text-2xl lg:text-3xl font-bold text-white truncate hover:underline focus:outline-none focus:underline block"
                    title="View album"
                  >
                    {songTitle}
                  </Link>
                ) : (
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white truncate">{songTitle}</h2>
                )}
                {artistId ? (
                  <Link
                    to="/library/artists/$id"
                    params={{ id: artistId }}
                    onClick={() => onClose()}
                    className="text-sm sm:text-base text-white/60 mt-1 truncate hover:text-white hover:underline block"
                  >
                    {songArtist}
                  </Link>
                ) : (
                  <p className="text-sm sm:text-base text-white/60 mt-1 truncate">{songArtist}</p>
                )}
              </div>

              {/* Scrubber */}
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

              {/* Transport */}
              <div className="flex items-center justify-center gap-4 sm:gap-6 w-full">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-10 w-10 sm:h-11 sm:w-11 p-0 hover:bg-white/10',
                    isShuffled ? 'text-primary' : 'text-white/70'
                  )}
                  onClick={onToggleShuffle}
                >
                  <Shuffle className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-12 w-12 sm:h-14 sm:w-14 p-0 text-white hover:bg-white/10"
                  onClick={onPrevious}
                >
                  <SkipBack className="h-6 w-6 sm:h-7 sm:w-7 fill-current" />
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-16 w-16 sm:h-18 sm:w-18 p-0 rounded-full shadow-lg"
                  onClick={onTogglePlayPause}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-7 w-7 sm:h-8 sm:w-8 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-7 w-7 sm:h-8 sm:w-8" />
                  ) : (
                    <Play className="h-7 w-7 sm:h-8 sm:w-8 ml-1" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-12 w-12 sm:h-14 sm:w-14 p-0 text-white hover:bg-white/10"
                  onClick={onNext}
                >
                  <SkipForward className="h-6 w-6 sm:h-7 sm:w-7 fill-current" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-10 w-10 sm:h-11 sm:w-11 p-0 hover:bg-white/10',
                    repeatMode !== 'off' ? 'text-primary' : 'text-white/70'
                  )}
                  onClick={onToggleRepeat}
                >
                  {repeatMode === 'one' ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
                </Button>
              </div>

              {/* Secondary actions */}
              <div className="flex items-center justify-center gap-4 sm:gap-6">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-white/10"
                  onClick={onToggleLike}
                  disabled={isLikePending}
                >
                  <Heart className={cn('h-5 w-5', isLiked && 'fill-red-500 text-red-500')} />
                </Button>
                {/* TODO: restyle dropdown to match dark fullscreen theme */}
                <AddToPlaylistButton
                  songId={currentSong.id}
                  artistName={songArtist}
                  songTitle={songTitle}
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-white/10 [&_svg]:h-5 [&_svg]:w-5"
                  contentClassName="z-[70]"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-white/10"
                  onClick={() => closeAndThen(() => {
                    useAudioStore.getState().toggleQueuePanel();
                  })}
                >
                  <ListMusic className="h-5 w-5" />
                </Button>
                <div className="[&_label]:text-white/70 [&_[data-state=checked]]:bg-primary">
                  <AIDJToggle compact />
                </div>
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
          )}
        </div>

        {/* Floating collapse button when expanded */}
        {isExpanded && (
          <div className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-20 flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 text-white/60 hover:text-white bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full"
              onClick={toggleExpanded}
              title="Exit fullscreen"
            >
              <Minimize2 className="h-5 w-5" />
            </Button>
          </div>
        )}

        {!isExpanded && <div className="h-8 pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>,
    document.body
  );
}

