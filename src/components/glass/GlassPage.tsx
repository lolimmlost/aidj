import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { GlassBackdrop } from './GlassBackdrop';

/**
 * A glass page: the frosted-card styles (glass-page, glass-home) and, on phones, the cover-tinted
 * glow at the top. Wider screens are transparent so the app-wide glow (GlassBackdropWide) shows.
 */
export function GlassPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('glass-page glass-home relative min-h-screen bg-background md:bg-transparent', className)}>
      <GlassBackdrop className="md:hidden" />
      {children}
    </div>
  );
}

/** The page's content column, starting right under the status bar (phones) and above the glow. */
export function GlassColumn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative mx-auto w-full max-w-3xl px-4 pt-[calc(env(safe-area-inset-top)+var(--top-bar)+0.5rem)] md:px-8 md:pt-8', className)}>
      {children}
    </div>
  );
}
