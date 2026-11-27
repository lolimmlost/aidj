import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Glass phones: the scrolled back pill (as on playlists and Liked Songs). Place it at the top of the
 * page body, under the page title. It takes no space; once the body scrolls up to the top edge
 * (the title has gone under it), a frosted pill slides in: ‹ back, the title, and an optional action.
 * The parent must be the block that holds the rest of the page (a sticky element can't leave it).
 */
export function GlassBackPill({
  title,
  backLabel,
  onBack,
  action,
}: {
  title: string;
  /** For screen readers: "Back to Settings". */
  backLabel: string;
  onBack: () => void;
  /** Right side, e.g. a Play button; a spacer keeps the title centred when there's none. */
  action?: ReactNode;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    const mark = markRef.current;
    if (!bar || !mark) return;
    const scroller: HTMLElement | Window = (mark.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null) ?? window;
    let frame = 0;
    // Not stuck yet: the marker sits exactly at the bar's top. Stuck: the marker scrolls up past it.
    const check = () => {
      frame = 0;
      setDocked(mark.getBoundingClientRect().top < bar.getBoundingClientRect().top - 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <div
        ref={barRef}
        aria-hidden={!docked}
        className={cn(
          'glass-surface sticky top-[calc(env(safe-area-inset-top)+var(--top-bar))] z-20 -mx-1 -mb-[52px] flex h-[52px] items-center gap-2 rounded-full px-1 shadow-[0_12px_30px_rgb(0_0_0/0.45)] transition-[opacity,transform] duration-200',
          docked ? 'opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
        )}
      >
        <button
          type="button"
          onClick={onBack}
          tabIndex={docked ? 0 : -1}
          aria-label={backLabel}
          className="grid size-11 shrink-0 place-items-center rounded-full [-webkit-tap-highlight-color:transparent] active:bg-foreground/10"
        >
          <ChevronLeft className="size-[22px]" strokeWidth={2.2} />
        </button>
        <span className="min-w-0 flex-1 truncate text-center font-display text-base font-bold">{title}</span>
        {action ?? <span aria-hidden className="size-11 shrink-0" />}
      </div>
      <div ref={markRef} aria-hidden />
    </>
  );
}
