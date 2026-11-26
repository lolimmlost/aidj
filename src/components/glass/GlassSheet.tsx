import { useCallback, useEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const PHONE_QUERY = '(max-width: 767px)';

/** True on phone widths (the glass UI's max-md), tracked live. */
export function useIsPhone() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PHONE_QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

/** Ease shared with the sheet's CSS slide (glass-sheet-in, np-sheet-up). */
const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * Drag-to-dismiss for the sheet. Two ways in: the header (grabber, title row,
 * now-playing card; a tap on the grabber also closes) via pointer events, and
 * pulling down on the list while it's scrolled to the top via touch events
 * (non-passive, so the pull doesn't turn into iOS rubber-banding). The sheet
 * follows the finger, the full-screen player behind comes forward with it
 * (--glass-sheet-drag), and on release it either slides off or springs back.
 */
export function useSheetDrag(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ y0: number; dy: number; lastY: number; lastT: number; v: number; grabber: boolean } | null>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  const begin = useCallback((y: number, grabber: boolean) => {
    const el = sheetRef.current;
    if (!el) return;
    dragRef.current = { y0: y, dy: 0, lastY: y, lastT: performance.now(), v: 0, grabber };
    el.style.transition = 'none';
    document.documentElement.setAttribute('data-glass-sheet-dragging', '');
  }, []);

  const move = useCallback((y: number) => {
    const d = dragRef.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    const now = performance.now();
    d.v = (y - d.lastY) / Math.max(1, now - d.lastT);
    d.lastY = y;
    d.lastT = now;
    d.dy = Math.max(0, y - d.y0);
    el.style.transform = `translateY(${d.dy}px)`;
    document.documentElement.style.setProperty('--glass-sheet-drag', String(Math.min(1, d.dy / el.offsetHeight)));
  }, []);

  const end = useCallback((cancelled = false) => {
    const d = dragRef.current;
    const el = sheetRef.current;
    dragRef.current = null;
    const html = document.documentElement;
    html.removeAttribute('data-glass-sheet-dragging');
    if (!d || !el) return;
    html.style.removeProperty('--glass-sheet-drag');
    if (d.dy < 6) {
      el.style.transition = '';
      el.style.transform = '';
      if (d.grabber && !cancelled) onClose();
      return;
    }
    const dismiss = !cancelled && (d.dy > Math.min(160, el.offsetHeight * 0.25) || (d.v > 0.5 && d.dy > 24));
    el.style.transition = `transform 320ms ${SHEET_EASE}`;
    if (dismiss) {
      // Slide the rest of the way from where the finger let go, then close
      // without the CSS slide-out (data-drag-closed) so it doesn't run twice.
      el.setAttribute('data-drag-closed', '');
      el.style.transform = 'translateY(calc(100% + 1rem))';
      html.removeAttribute('data-glass-sheet');
      closeTimerRef.current = window.setTimeout(onClose, 300);
    } else {
      el.style.transform = 'translateY(0)';
    }
  }, [onClose]);

  const headerHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      const t = e.target as HTMLElement;
      if (t.closest('button:not([data-grabber]), a, input, label')) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      begin(e.clientY, !!t.closest('[data-grabber]'));
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current) move(e.clientY);
    },
    onPointerUp: () => end(),
    onPointerCancel: () => end(true),
  };

  // Callback ref with cleanup (React 19): the list mounts a frame after
  // `open` flips (Radix Portal), so an effect could miss it.
  const listRef = useCallback((list: HTMLDivElement | null) => {
    if (!list) return;
    let startY = 0;
    let armed = false;
    const onStart = (e: TouchEvent) => {
      armed = list.scrollTop <= 0 && !(e.target as Element).closest('[data-grip]');
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      const y = e.touches[0].clientY;
      if (!dragRef.current) {
        if (y <= startY) { armed = false; return; } // scrolling up the list
        begin(startY, false);
      }
      if (e.cancelable) e.preventDefault();
      move(y);
    };
    const onEnd = () => {
      armed = false;
      if (dragRef.current) end();
    };
    list.addEventListener('touchstart', onStart, { passive: true });
    list.addEventListener('touchmove', onMove, { passive: false });
    list.addEventListener('touchend', onEnd);
    list.addEventListener('touchcancel', onEnd);
    return () => {
      list.removeEventListener('touchstart', onStart);
      list.removeEventListener('touchmove', onMove);
      list.removeEventListener('touchend', onEnd);
      list.removeEventListener('touchcancel', onEnd);
    };
  }, [begin, move, end]);

  return { sheetRef, listRef, headerHandlers };
}

interface GlassSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Screen-reader description (Radix wants one). */
  description: string;
  /** Small line under the title. */
  subtitle?: ReactNode;
  /** Right side of the title row (chips, actions). A close × is always added. */
  headerRight?: ReactNode;
  /** Extra content inside the drag zone, under the title row. */
  header?: ReactNode;
  children: ReactNode;
  /** Pinned under the scrolling body. */
  footer?: ReactNode;
  /** Full height (top just under the status bar) instead of fitting its content. */
  tall?: boolean;
  bodyClassName?: string;
  /** Always dark (sheets over the full-screen player, which is dark in both themes). */
  dark?: boolean;
}

/**
 * Glass UI (phones): the shared bottom sheet. Slides up on the Now Playing
 * curve, drag the header or pull the body down from the top to dismiss, tap
 * the grabber to close, and the full-screen player recedes behind it
 * (data-glass-sheet, styles.css). Everything sits above the full-screen
 * player (z-60).
 */
export function GlassSheet({ open, onOpenChange, title, description, subtitle, headerRight, header, children, footer, tall, bodyClassName, dark }: GlassSheetProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { sheetRef, listRef, headerHandlers } = useSheetDrag(close);
  useGlassSheetFlag(open);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="glass-sheet-overlay fixed inset-0 z-[70] bg-black/50" />
        <DialogPrimitive.Content
          ref={sheetRef}
          className={cn(
            'glass-sheet glass-surface fixed inset-x-2 bottom-2 z-[71] flex flex-col rounded-[26px] px-4 pt-2 text-foreground',
            // `dark` on the sheet itself re-scopes the theme tokens for everything inside.
            dark ? 'dark border-white/10 bg-[rgb(22_20_32/0.9)]' : 'bg-background/85 dark:bg-[rgb(22_20_32/0.88)]',
            tall ? 'top-[calc(env(safe-area-inset-top)+3rem)]' : 'max-h-[calc(100dvh-env(safe-area-inset-top)-3rem)]',
          )}
        >
          <div className="-mx-4 -mt-2 shrink-0 touch-none select-none px-4 pb-2" {...headerHandlers}>
            <button
              type="button"
              data-grabber
              onClick={(e) => { if (e.detail === 0) close(); }}
              aria-label="Close"
              className="flex h-6 w-full items-center justify-center [-webkit-tap-highlight-color:transparent]"
            >
              <span aria-hidden className="block h-1.5 w-10 rounded-full bg-foreground/30" />
            </button>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="truncate font-display text-[22px] font-extrabold leading-7 tracking-[-0.02em]">{title}</DialogPrimitive.Title>
                {subtitle != null && <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{subtitle}</div>}
              </div>
              <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
              <div className="flex shrink-0 items-center gap-1.5">
                {headerRight}
                <DialogPrimitive.Close aria-label="Close" className="grid size-9 place-items-center rounded-full text-muted-foreground">
                  <X className="size-5" />
                </DialogPrimitive.Close>
              </div>
            </div>
            {header}
          </div>
          <div
            ref={listRef}
            className={cn(
              '-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1',
              footer == null && 'pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
              bodyClassName,
            )}
          >
            {children}
          </div>
          {footer != null && (
            <div className="-mx-4 shrink-0 border-t border-foreground/10 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2.5">{footer}</div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Marks <html> while a glass sheet is open so the full-screen player recedes. Counted, so stacked sheets don't clear it early. */
let openSheets = 0;
export function useGlassSheetFlag(open: boolean) {
  useEffect(() => {
    if (!open) return;
    openSheets += 1;
    document.documentElement.setAttribute('data-glass-sheet', '');
    return () => {
      openSheets = Math.max(0, openSheets - 1);
      if (openSheets === 0) document.documentElement.removeAttribute('data-glass-sheet');
    };
  }, [open]);
}

/** A tappable sheet row: leading tile, title + sub, trailing. 56px. */
export function SheetRow({ icon, title, sub, trailing, onClick, active, disabled, tone }: {
  icon: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  tone?: 'success' | 'primary';
}) {
  const toneText = tone === 'success' ? 'text-success' : tone === 'primary' ? 'text-primary' : '';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left [-webkit-tap-highlight-color:transparent] active:bg-foreground/10 disabled:opacity-50',
        active && (tone === 'success' ? 'bg-success/10' : 'bg-primary/10'),
      )}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl glass-flat', active ? toneText : 'text-muted-foreground')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[15px] font-semibold', active && toneText)}>{title}</span>
        {sub != null && <span className="block truncate text-[13px] text-muted-foreground">{sub}</span>}
      </span>
      {trailing}
    </button>
  );
}

/** Small mono section label inside a sheet. */
export function SheetLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-2 pb-1 pt-3 font-mono text-[10px] tracking-[0.14em] text-muted-foreground', className)}>{children}</div>;
}
