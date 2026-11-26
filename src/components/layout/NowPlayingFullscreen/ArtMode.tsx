/**
 * Art mode — the canonical big-album-art view with horizontal swipe to
 * skip prev/next. This is the only mode in PR A; lyrics / visualizer /
 * queue plug in via the same shape in subsequent PRs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { LikeHeart } from '@/components/player/LikeHeart';
import type { NowPlayingSong } from './types';
import { useGlassUi } from '@/lib/hooks/useGlassUi';
import { useLowMotion } from '@/lib/hooks/useLowMotion';
import { useBeat } from '@/components/glass/beat-sync';
import { useAudioStore } from '@/lib/stores/audio';

interface ArtModeProps {
  song: NowPlayingSong;
  onPrevious: () => void;
  onNext: () => void;
  expanded?: boolean;
  /** Double-tap / double-click on the artwork (used to like the song). */
  onDoubleTap?: () => void;
}

// A tap is a touch that barely moves and lifts quickly; two within this
// window are a double-tap.
const TAP_MAX_MOVE_PX = 10;
const TAP_MAX_MS = 250;
const DOUBLE_TAP_MS = 300;
// Swipe-to-skip: the gesture must commit to sideways (more horizontal than vertical once it has moved
// AXIS_LOCK_PX), then travel SKIP_PX, or FLICK_PX at FLICK_SPEED px/ms. A swipe down to close the player
// that drifted sideways, or a 15 px twitch, used to skip — mostly "previous".
const AXIS_LOCK_PX = 12;
const SKIP_PX = 90;
const FLICK_PX = 45;
const FLICK_SPEED = 0.5;

export function ArtMode({ song, onPrevious, onNext, expanded, onDoubleTap }: ArtModeProps) {
  const [imgError, setImgError] = useState(false);

  const artSwipeRef = useRef<{ x: number; y: number; time: number; axis: 'x' | 'y' | null } | null>(null);
  const artOffsetRef = useRef(0);
  const artContainerRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef(0);
  const lastTouchEndRef = useRef(0);
  // Bumped per double-tap to replay the big-heart burst over the art.
  const [bigHeartKey, setBigHeartKey] = useState(0);

  const triggerDoubleTap = useCallback(() => {
    if (!onDoubleTap) return;
    setBigHeartKey((k) => k + 1);
    onDoubleTap();
  }, [onDoubleTap]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setImgError(false); }, [song.id]);


  // Swipe-to-skip as ONE continuous motion (#289): the current art carries on
  // in the swipe direction and fades, the track changes, then the new art
  // slides in from the other side. Driven here with the Web Animations API so
  // nothing competes with it (the old version ran an inline snap-back
  // transition and a CSS slide-in class at the same time, which jumped when
  // they settled).
  const animateSkip = useCallback((dir: 'next' | 'previous', fromX: number, fromOpacity: number) => {
    const el = artContainerRef.current;
    const skip = dir === 'next' ? onNext : onPrevious;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!el || reduce || typeof el.animate !== 'function') {
      if (el) {
        el.style.transition = '';
        el.style.transform = '';
        el.style.opacity = '';
      }
      skip();
      return;
    }
    const exitX = (dir === 'next' ? -1 : 1) * Math.max(160, el.offsetWidth * 0.6);
    el.style.transition = 'none';
    const out = el.animate(
      [
        { transform: `translateX(${fromX}px)`, opacity: fromOpacity },
        { transform: `translateX(${exitX}px)`, opacity: 0 },
      ],
      { duration: 140, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    );
    out.onfinish = () => {
      skip();
      // Next frame: React has rendered the new song; bring it in from the
      // opposite side, then hand the element back with no inline styles.
      requestAnimationFrame(() => {
        el.style.transform = '';
        el.style.opacity = '';
        out.cancel();
        el.animate(
          [
            { transform: `translateX(${-exitX * 0.5}px)`, opacity: 0 },
            { transform: 'translateX(0)', opacity: 1 },
          ],
          { duration: 280, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
        );
      });
    };
  }, [onNext, onPrevious]);

  const handleDoubleClick = useCallback(() => {
    if (Date.now() - lastTouchEndRef.current < 800) return;
    triggerDoubleTap();
  }, [triggerDoubleTap]);

  const handleArtTouchStart = useCallback((e: React.TouchEvent) => {
    artSwipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now(), axis: null };
    artOffsetRef.current = 0;
  }, []);

  const handleArtTouchMove = useCallback((e: React.TouchEvent) => {
    const start = artSwipeRef.current;
    if (!start) return;
    const deltaX = e.touches[0].clientX - start.x;
    const deltaY = e.touches[0].clientY - start.y;
    if (!start.axis && Math.hypot(deltaX, deltaY) >= AXIS_LOCK_PX) start.axis = Math.abs(deltaX) > Math.abs(deltaY) * 1.2 ? 'x' : 'y';
    // vertical (closing the player, scrolling): the art stays put and nothing skips
    if (start.axis === 'y') {
      artOffsetRef.current = 0;
      return;
    }
    artOffsetRef.current = deltaX;
    if (artContainerRef.current) {
      const dampened = deltaX * 0.6;
      artContainerRef.current.style.transform = `translateX(${dampened}px)`;
      artContainerRef.current.style.transition = 'none';
      artContainerRef.current.style.opacity = `${1 - Math.abs(dampened) / 400}`;
    }
  }, []);

  const handleArtTouchEnd = useCallback(() => {
    lastTouchEndRef.current = Date.now();
    const start = artSwipeRef.current;
    if (start && Math.abs(artOffsetRef.current) < TAP_MAX_MOVE_PX && Date.now() - start.time < TAP_MAX_MS) {
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        triggerDoubleTap();
      } else {
        lastTapRef.current = now;
      }
    }
    if (artContainerRef.current) {
      const offset = artOffsetRef.current;
      const velocity = artSwipeRef.current
        ? Math.abs(offset) / (Date.now() - artSwipeRef.current.time)
        : 0;
      const sideways = artSwipeRef.current?.axis === 'x';
      if (sideways && (Math.abs(offset) > SKIP_PX || (Math.abs(offset) > FLICK_PX && velocity > FLICK_SPEED))) {
        const dampened = offset * 0.6;
        animateSkip(offset > 0 ? 'previous' : 'next', dampened, 1 - Math.abs(dampened) / 400);
      } else {
        // Not a skip: spring back to centre.
        artContainerRef.current.style.transition = 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1), opacity 250ms ease';
        artContainerRef.current.style.transform = 'translateX(0)';
        artContainerRef.current.style.opacity = '1';
      }
    }
    artSwipeRef.current = null;
    artOffsetRef.current = 0;
  }, [animateSkip, triggerDoubleTap]);

  const artId = song.albumId || song.id;
  const coverUrl = getCoverArtUrl(artId, 600);
  const songArtist = song.artist || 'Unknown';

  const glass = useGlassUi() && !expanded;
  // Glass: the art is a record that turns once a bar and ducks on each kick (a sidechain pump) — on the
  // real downbeat when the Lab has a grid for the song. Low motion keeps the still square.
  const lowMotion = useLowMotion();
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const vinyl = glass && !lowMotion && !!coverUrl && !imgError;
  const beat = useBeat(vinyl ? song : null, isPlaying);

  return (
    <div
      className={cn(
        "relative overflow-visible touch-pan-y",
        expanded
          ? "flex-1 flex items-center justify-center"
          : "w-[75vw] sm:w-[60vw] md:w-[50vw] lg:w-auto lg:flex-1 max-w-[500px] aspect-square mx-auto lg:mx-0 flex-shrink-0",
        // Landscape phone: fill the row's real height and let aspect-square set
        // the width, so the square fits exactly between the header and the
        // bottom safe area whatever their heights. (A guessed
        // min(45vw, 100dvh - 5.5rem) cut the art's bottom off on an iPhone 11.)
        !expanded && "short-landscape:h-full short-landscape:w-auto short-landscape:max-w-[50%] short-landscape:mx-0",
        // Glass, phone upright: the art fills the free height between the
        // header and the song info as a box, and a square sized
        // min(box width, box height) sits centred in it — so it's as big as
        // fits, flush with the text column's edges, with the same space
        // above and below (pt-2 + the header's 12px = pb-5).
        glass && "np-phone:flex np-phone:aspect-auto np-phone:min-h-0 np-phone:w-full np-phone:max-w-none np-phone:flex-1 np-phone:items-center np-phone:justify-center np-phone:pb-5 np-phone:pt-2 np-phone:[container-type:size]"
      )}
      onTouchStart={handleArtTouchStart}
      onTouchMove={handleArtTouchMove}
      onTouchEnd={handleArtTouchEnd}
      // Desktop. Touch double-taps are handled in touchend; ignore the
      // synthetic dblclick some mobile browsers emit right after them.
      onDoubleClick={handleDoubleClick}
    >
      <div
        ref={artContainerRef}
        data-np-art
        className={cn(
          // Morph target for the mini-player art (#289)
          '[view-transition-name:np-art]',
          expanded ? 'max-h-full max-w-full aspect-square' : 'w-full h-full',
          glass && 'np-phone:aspect-square np-phone:h-auto np-phone:w-[min(100cqw,100cqh)]',
        )}
      >
        {vinyl ? (
          <div ref={beat?.ref} className="np-vinyl relative h-full w-full" data-playing={isPlaying ? '' : undefined}>
            <div className="np-pump absolute inset-0" data-beat={beat ? '' : undefined} style={beat?.loop(1)}>
              <div className="np-spin absolute inset-0 overflow-hidden rounded-full bg-black shadow-2xl shadow-black/60" style={beat ? { animationDuration: `${beat.bar}s` } : undefined}>
                <img
                  src={coverUrl}
                  alt={`${song.name || song.title || 'Unknown'} album art`}
                  className="h-full w-full select-none object-cover pointer-events-none"
                  onError={() => setImgError(true)}
                  draggable={false}
                />
                <span aria-hidden className="np-grooves absolute inset-0 rounded-full" />
              </div>
              <span aria-hidden className="np-shine absolute inset-0 rounded-full" />
              {beat && <span aria-hidden className="np-flash absolute inset-0 rounded-full" data-beat style={beat.loop(1)} />}
              <span aria-hidden className="absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0d0f16] ring-[3px] ring-white/35" />
            </div>
          </div>
        ) : coverUrl && !imgError ? (
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

      {bigHeartKey > 0 && (
        <div
          key={bigHeartKey}
          className="animate-like-big pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <LikeHeart
            liked
            effect={{ kind: 'like', key: bigHeartKey }}
            className="h-24 w-24 drop-shadow-[0_4px_24px_rgba(239,68,68,0.55)]"
            burst={72}
          />
        </div>
      )}
    </div>
  );
}
