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

export function ArtMode({ song, onPrevious, onNext, expanded, onDoubleTap }: ArtModeProps) {
  const [imgError, setImgError] = useState(false);

  const artSwipeRef = useRef<{ x: number; time: number } | null>(null);
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
      if (Math.abs(offset) > 80 || velocity > 0.3) {
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

  return (
    <div
      className={cn(
        "relative overflow-visible touch-pan-y",
        expanded
          ? "flex-1 flex items-center justify-center"
          : "w-[75vw] sm:w-[60vw] md:w-[50vw] lg:w-auto lg:flex-1 max-w-[500px] aspect-square mx-auto lg:mx-0 flex-shrink-0"
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
