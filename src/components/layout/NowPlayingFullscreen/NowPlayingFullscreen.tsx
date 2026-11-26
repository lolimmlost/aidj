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
  Loader2,
  Shuffle,
  Repeat,
  Repeat1,
  ListMusic,
  Maximize2,
  Minimize2,
  Smartphone,
  Speaker,
  ListPlus,
  Disc3,
} from 'lucide-react';
import { setLowMotion, useLowMotion } from '@/lib/hooks/useLowMotion';
import { toast } from '@/lib/toast';
import { useGlassUi } from '@/lib/hooks/useGlassUi';
import { Waveform } from '@/components/glass/Waveform';
import { useIsPhone } from '@/components/glass/GlassSheet';
import { GlassAddToPlaylistSheet } from '@/components/glass/GlassAddToPlaylistSheet';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { cn } from '@/lib/utils';
import { AIDJToggle } from '@/components/ai-dj-toggle';
import { SleepTimerButton } from '@/components/player/SleepTimerButton';
import { LikeHeart } from '@/components/player/LikeHeart';
import { haptic } from '@/lib/utils/haptics';
import { AddToPlaylistButton } from '@/components/playlists/AddToPlaylistButton';
import { useAudioStore } from '@/lib/stores/audio';
import { ArtMode } from './ArtMode';
import { LyricsPeek } from './LyricsPeek';
import { LyricsMode } from './LyricsMode';
import { VisualizerMode } from './VisualizerMode';
import { ModeSwitcher } from './ModeSwitcher';
import type { NowPlayingFullscreenProps, NPMode } from './types';

// Cmd/ctrl/shift/alt-click on a link means "new tab/window": leave it to the browser.
const isModifiedClick = (e: React.MouseEvent) =>
  e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

const formatTime = (time: number) => {
  if (!isFinite(time) || time < 0) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export function NowPlayingFullscreen({
  isOpen,
  onClose,
  skipSlide = false,
  onOpenAlbum,
  onOpenArtist,
  initialMode = 'art',
  currentSong,
  isPlaying,
  isLoading,
  currentTime,
  duration,
  isLiked,
  isLikePending,
  likeEffect,
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
  onOpenDevices,
  deviceLabel = 'This phone',
  deviceRemote = false,
  upNext = 0,
}: NowPlayingFullscreenProps) {
  // Glass UI (phones, canvas "full screen — glass"): cover-tinted backdrop,
  // left-aligned title with the heart beside it, waveform scrubber, a big glowing
  // play, and device / up-next pills. Desktop and landscape keep this layout.
  const glass = useGlassUi();
  const phone = useIsPhone();
  const lowMotion = useLowMotion();
  const [addOpen, setAddOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [mode, setMode] = useState<NPMode>(initialMode);
  const [isExpanded, setIsExpanded] = useState(false);

  // Double-tap the artwork to like (Instagram rule: it only ever likes,
  // never unlikes). ArtMode shows the big heart either way.
  const handleArtDoubleTap = useCallback(() => {
    if (!isLiked && !isLikePending) onToggleLike();
    else haptic('light');
  }, [isLiked, isLikePending, onToggleLike]);

  // Reset mode on each open so re-opening from a fresh trigger respects
  // the caller's initialMode (e.g. opening from the player-bar lyrics
  // button should land on 'lyrics' even if the user previously closed
  // the surface while on 'art'). Done during render, not in an effect, so a
  // view-transition open captures the right mode in its very first frame.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setMode(initialMode);
  }

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
    touchStartRef.current = null;
    // A sheet on top (queue, add to playlist, sleep, devices, visualizer) owns
    // the swipe: dismissing it lands back here, it must not also close the
    // player. React bubbles portal touches up to this handler (the sheets
    // opened from in here are portals), so check the DOM, plus the open flag.
    if (!containerRef.current?.contains(e.target as Node)) return;
    if (useAudioStore.getState().queuePanelOpen || document.documentElement.hasAttribute('data-glass-sheet')) return;
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
    if (touchStartRef.current && containerRef.current) {
      containerRef.current.style.transition = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';
      if (touchOffsetRef.current > 100) {
        // With a view transition the art morphs back to the mini player from
        // where the drag left it; otherwise slide the rest of the way out.
        if (!skipSlide) containerRef.current.style.transform = 'translateY(100%)';
        onClose();
      } else {
        containerRef.current.style.transform = 'translateY(0)';
      }
    }
    touchStartRef.current = null;
    touchOffsetRef.current = 0;
  }, [onClose, skipSlide]);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient UI state on close
      setIsExpanded(false);
      document.exitFullscreen?.().catch(() => {});
    }
  }, [isOpen]);

  // Esc to close (or collapse expanded first).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // A glass sheet on top (queue, add to playlist, sleep, devices)
        // handles its own Escape.
        if (useAudioStore.getState().queuePanelOpen || document.documentElement.hasAttribute('data-glass-sheet')) return;
        if (isExpanded) {
          setIsExpanded(false);
          document.exitFullscreen?.().catch(() => {});
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

  // With skipSlide the view transition does the animating: render the final
  // open/closed state immediately instead of the slide.
  const isVisible = skipSlide ? isOpen : visible;
  const isShown = skipSlide ? isOpen : animating;

  if (!isVisible || !currentSong) return null;

  const artId = currentSong.albumId || currentSong.id;
  const bgCoverUrl = getCoverArtUrl(artId, 128);
  const songTitle = currentSong.name || currentSong.title || 'Unknown';
  const songArtist = currentSong.artist || 'Unknown';
  const artistId = currentSong.artistId;

  return createPortal(
    <div
      className={cn(
        // overflow-hidden: the blurred, scaled-up art tint below bleeds past
        // the sheet's edges. The np-sheet snapshot would include that bleed,
        // leaving a strip of it at the bottom of the screen after the
        // slide-down until the transition ends and it vanishes.
        'fixed inset-0 z-[60] overflow-hidden transition-opacity duration-300',
        isShown ? 'opacity-100' : 'opacity-0'
      )}
      // With a view transition the whole sheet (background + controls) gets its
      // own snapshot so it can slide up behind the art morph instead of
      // snapping in with the page cross-fade (#289; styles: np-sheet).
      style={skipSlide ? { viewTransitionName: 'np-sheet' } : undefined}
      data-np-sheet
    >
      {/* Solid black base + blurred album art tint.
       *  Skipped in visualizer mode because the opaque canvas covers the
       *  same area and the blur-3xl filter is expensive GPU work that
       *  would never be visible. */}
      <div className="absolute inset-0 bg-black" />
      {bgCoverUrl && mode !== 'visualizer' && (
        <div
          className={cn("absolute inset-0 bg-cover bg-center scale-110 blur-3xl opacity-40", glass && "max-md:opacity-70")}
          style={{ backgroundImage: `url(${bgCoverUrl})` }}
        />
      )}
      {mode !== 'visualizer' && <div className={cn("absolute inset-0 bg-black/40", glass && "max-md:hidden")} />}
      {glass && mode !== 'visualizer' && (
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.15)_0%,rgb(0_0_0/0.55)_55%,rgb(0_0_0/0.85)_100%)] md:hidden" />
      )}

      {/* Slide-up container */}
      <div
        ref={containerRef}
        className={cn(
          'relative h-full flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          isShown ? 'translate-y-0' : 'translate-y-full'
        )}
        onTouchStart={handleBodyTouchStart}
        onTouchMove={handleBodyTouchMove}
        onTouchEnd={handleBodyTouchEnd}
      >
        {/* Persistent header — chevron + mode pill + expand */}
        {!isExpanded && (
          <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] py-3 short-landscape:py-1 short-landscape:pt-1 short-landscape:pl-[max(1rem,env(safe-area-inset-left))] short-landscape:pr-[max(1rem,env(safe-area-inset-right))]">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 text-white/80 hover:text-white hover:bg-white/10"
              onClick={onClose}
            >
              <ChevronDown className="h-6 w-6" />
            </Button>
            <ModeSwitcher mode={mode} onModeChange={setMode} glass={glass} />
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
          "flex-1 flex flex-col lg:flex-row short-landscape:flex-row justify-center mx-auto w-full min-h-0",
          isExpanded
            ? "items-stretch p-0"
            : cn(
                "px-6 sm:px-8 lg:px-16 gap-6 sm:gap-8 lg:gap-16 max-w-6xl",
                // Landscape phone: side-by-side, clear of the notch/home bar
                "short-landscape:gap-8 short-landscape:py-1 short-landscape:pl-[max(1.5rem,env(safe-area-inset-left))] short-landscape:pr-[max(1.5rem,env(safe-area-inset-right))]",
                mode === 'art' ? "items-center" : "items-stretch",
                // Glass art mode spaces the art itself (ArtMode pt/pb).
                glass && mode === 'art' && "np-phone:gap-0"
              )
        )}>

          {/* === Mode swap area === */}
          {mode === 'art' && (
            <ArtMode
              song={currentSong}
              onPrevious={onPrevious}
              onNext={onNext}
              expanded={isExpanded}
              onDoubleTap={handleArtDoubleTap}
            />
          )}
          {mode === 'lyrics' && (
            <div className={cn("w-full flex min-h-0", isExpanded ? "flex-1 pt-[env(safe-area-inset-top)]" : "lg:flex-1 flex-1")}>
              <LyricsMode expanded={isExpanded} glass={glass} onSeek={onSeek} />
            </div>
          )}
          {mode === 'visualizer' && (
            <div className={cn("w-full flex min-h-0", isExpanded ? "flex-1" : "lg:flex-1 flex-1", glass && !isExpanded && "np-phone:-mx-6 np-phone:w-[calc(100%+3rem)]")}>
              <VisualizerMode analyserNode={analyserNode ?? null} expanded={isExpanded} glass={glass} />
            </div>
          )}

          {/* === Persistent metadata + transport column (hidden when expanded) === */}
          {!isExpanded && (
            <div className={cn(
              "w-full lg:flex-1 lg:max-w-md flex flex-col items-center gap-6 sm:gap-8",
              "short-landscape:flex-1 short-landscape:max-w-md short-landscape:min-w-0 short-landscape:gap-3 short-landscape:justify-center",
              mode !== 'art' && "justify-center",
              // Glass phone: a tighter lower half, so the record keeps its size with the lyrics line above the title
              glass && "max-md:gap-4"
            )}>
              {/* Glass, phone: the sung line under the record, above the title */}
              {glass && phone && mode === 'art' && (
                <div className="-mb-3 w-full md:hidden short-landscape:hidden">
                  <LyricsPeek song={currentSong} duration={duration} onOpen={() => setMode('lyrics')} />
                </div>
              )}
              {/* Song info — title links to album page (song info context); artist links to artist page */}
              {glass && currentSong.album && mode === 'art' && (
                <p className="-mb-3 w-full truncate font-mono text-[10px] tracking-[0.14em] text-white/55 md:hidden short-landscape:hidden">
                  PLAYING FROM · {currentSong.album.toUpperCase()}
                </p>
              )}
              <div className={cn("w-full", glass && "max-md:flex max-md:items-center max-md:gap-3")}>
              <div className={cn("w-full text-center lg:text-left short-landscape:text-left", glass && "max-md:min-w-0 max-md:flex-1 max-md:text-left")}>
                {artistId && currentSong.albumId ? (
                  <Link
                    to="/library/artists/$id/albums/$albumId"
                    params={{ id: artistId, albumId: currentSong.albumId }}
                    onClick={(e) => {
                      // Let cmd/ctrl/shift-click open the album in a new tab.
                      if (isModifiedClick(e)) return;
                      if (onOpenAlbum && currentSong.albumId) {
                        e.preventDefault();
                        onOpenAlbum(artistId, currentSong.albumId);
                      } else {
                        onClose();
                      }
                    }}
                    className={cn("text-xl sm:text-2xl lg:text-3xl font-bold text-white truncate hover:underline focus:outline-none focus:underline block", glass && "max-md:font-display max-md:text-[26px] max-md:font-extrabold max-md:leading-8 max-md:tracking-[-0.03em]")}
                    title="View album"
                  >
                    {songTitle}
                  </Link>
                ) : (
                  <h2 className={cn("text-xl sm:text-2xl lg:text-3xl font-bold text-white truncate", glass && "max-md:font-display max-md:text-[26px] max-md:font-extrabold max-md:leading-8 max-md:tracking-[-0.03em]")}>{songTitle}</h2>
                )}
                {artistId ? (
                  <Link
                    to="/library/artists/$id"
                    params={{ id: artistId }}
                    onClick={(e) => {
                      if (isModifiedClick(e)) return;
                      if (onOpenArtist) {
                        e.preventDefault();
                        onOpenArtist(artistId);
                      } else {
                        onClose();
                      }
                    }}
                    className="text-sm sm:text-base text-white/60 mt-1 truncate hover:text-white hover:underline block"
                  >
                    {songArtist}
                  </Link>
                ) : (
                  <p className="text-sm sm:text-base text-white/60 mt-1 truncate">{songArtist}</p>
                )}
              </div>
              {glass && (
                <button
                  type="button"
                  onClick={onToggleLike}
                  disabled={isLikePending}
                  aria-label={isLiked ? 'Unlike' : 'Like'}
                  aria-pressed={isLiked}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-white/80 md:hidden"
                >
                  <LikeHeart liked={isLiked} effect={likeEffect} className="h-6 w-6" burst={18} />
                </button>
              )}
              </div>

              {/* Scrubber */}
              <div className="w-full space-y-2">
                {glass && (
                  <Waveform
                    seed={currentSong.id}
                    current={isFinite(currentTime) ? currentTime : 0}
                    duration={isFinite(duration) && duration > 0 ? duration : 0}
                    onSeek={onSeek}
                    playedClassName="bg-primary"
                    unplayedClassName="bg-white/20"
                    className="h-8 md:hidden short-landscape:hidden"
                  />
                )}
                <Slider
                  value={[isFinite(currentTime) ? currentTime : 0]}
                  max={isFinite(duration) && duration > 0 ? duration : 100}
                  step={0.1}
                  onValueChange={([v]) => onSeek(v)}
                  className={cn("w-full [&_[data-slot=slider-track]]:bg-white/20 [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:bg-white", glass && "max-md:hidden short-landscape:flex")}
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
                  className={cn("h-16 w-16 sm:h-18 sm:w-18 p-0 rounded-full shadow-lg", glass && "max-md:h-16 max-md:w-16 max-md:shadow-[0_10px_26px_color-mix(in_oklch,var(--primary)_50%,transparent)]")}
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

              {glass && (
                <div className="-mt-1 flex w-full items-center justify-between gap-2 md:hidden short-landscape:hidden">
                  <button
                    type="button"
                    onClick={(e) => onOpenDevices?.(e.currentTarget)}
                    className={cn(
                      'glass-surface flex h-9 min-w-0 items-center gap-2 rounded-full px-3 text-xs font-medium [-webkit-tap-highlight-color:transparent]',
                      deviceRemote ? 'text-success' : 'text-white',
                    )}
                    aria-label={`Playing on ${deviceLabel}. Choose a device`}
                  >
                    {deviceRemote ? <Speaker className="size-4 shrink-0" /> : <Smartphone className="size-4 shrink-0" />}
                    <span className="truncate">{deviceLabel}</span>
                  </button>
                  <button
                    type="button"
                    // The queue sheet opens over the player (which recedes
                    // behind it) instead of after it closes, so it's one move
                    // and closing the queue lands back here.
                    onClick={() => useAudioStore.getState().toggleQueuePanel()}
                    className="glass-surface flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-medium text-white [-webkit-tap-highlight-color:transparent]"
                  >
                    <ListMusic className="size-4" /> Up next{upNext > 0 ? ` · ${upNext}` : ''}
                  </button>
                </div>
              )}

              {/* Secondary actions */}
              <div className={cn("flex items-center justify-center gap-4 sm:gap-6", glass && "np-phone:w-full np-phone:justify-between np-phone:px-1")}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-white/10", glass && "max-md:hidden short-landscape:inline-flex")}
                  onClick={onToggleLike}
                  disabled={isLikePending}
                >
                  <LikeHeart liked={isLiked} effect={likeEffect} className="h-5 w-5" burst={18} />
                </Button>
                {glass && phone ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Add to playlist"
                      className="h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-white/10"
                      onClick={() => setAddOpen(true)}
                    >
                      <ListPlus className="h-5 w-5" />
                    </Button>
                    <GlassAddToPlaylistSheet
                      open={addOpen}
                      onOpenChange={setAddOpen}
                      dark
                      song={{ id: currentSong.id, title: songTitle, artist: songArtist }}
                    />
                  </>
                ) : (
                <AddToPlaylistButton
                  songId={currentSong.id}
                  artistName={songArtist}
                  songTitle={songTitle}
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-white/10 [&_svg]:h-5 [&_svg]:w-5"
                  contentClassName="z-[70]"
                />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-white/10", glass && "max-md:hidden short-landscape:inline-flex")}
                  onClick={() => closeAndThen(() => {
                    useAudioStore.getState().toggleQueuePanel();
                  })}
                >
                  <ListMusic className="h-5 w-5" />
                </Button>
                <div className="[&_label]:text-white/70 [&_[data-state=checked]]:bg-primary">
                  <AIDJToggle compact />
                </div>
                {glass && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Low motion"
                    aria-pressed={lowMotion}
                    title={lowMotion ? 'Low motion: still artwork' : 'Record spin on'}
                    className={cn('h-10 w-10 p-0 hover:bg-white/10', lowMotion ? 'text-white/40' : 'text-white/80')}
                    onClick={() => {
                      setLowMotion(!lowMotion);
                      toast(lowMotion ? 'Record spin on' : 'Low motion — still artwork');
                    }}
                  >
                    <Disc3 className="h-5 w-5" />
                  </Button>
                )}
                <SleepTimerButton
                  glass={glass}
                  className="h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-white/10 [&_svg]:h-5 [&_svg]:w-5"
                  contentClassName="z-[70]"
                />
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

        {!isExpanded && <div className={cn("h-8 short-landscape:h-3 pb-[env(safe-area-inset-bottom)]", glass && "np-phone:h-[calc(env(safe-area-inset-bottom)+1.25rem)] np-phone:pb-0")} />}
      </div>
    </div>,
    document.body
  );
}

