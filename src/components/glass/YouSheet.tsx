import type { ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart3, Clock, Download, Layers, ListTodo, LogOut, Palette, Settings, Shield, Sparkles, TrendingUp, User } from 'lucide-react';
import authClient from '@/lib/auth/auth-client';
import { setGlassUi } from '@/lib/hooks/useGlassUi';
import { useDebugTapToggle } from '@/lib/hooks/useDebugTapToggle';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { GlassSheet } from './GlassSheet';
import { ThemeSegmented } from './ThemeSegmented';

type To = '/dashboard/discover' | '/downloads' | '/dashboard/history' | '/dashboard/analytics' | '/music-identity' | '/dashboard/library-growth' | '/tasks' | '/admin';

/** First letter of the account's name (or email) for the You tab and sheet. */
export function initialOf(user: { name?: string | null; email?: string | null } | undefined): string {
  return (user?.name || user?.email || '?').trim().charAt(0).toUpperCase() || '?';
}

export function YouAvatar({ letter, className }: { letter: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid place-items-center rounded-full bg-[linear-gradient(135deg,var(--primary),#E0AE4A)] font-display font-extrabold text-[#0B0A12]',
        className,
      )}
    >
      {letter}
    </span>
  );
}

/**
 * Glass UI (phones): what the ☰ drawer held, opened from the You tab. Menu pages as tiles, Settings top
 * right, the glass switch and sign out at the bottom. Tap the avatar 5× for on-device debug logging
 * (that tap target used to be the top bar's title, which is gone).
 */
export function YouSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const debugTap = useDebugTapToggle();
  const close = () => onOpenChange(false);

  const tiles: { to: To; label: string; icon: ReactNode }[] = [
    { to: '/dashboard/discover', label: 'Discover', icon: <Sparkles /> },
    { to: '/downloads', label: 'Downloads', icon: <Download /> },
    { to: '/dashboard/history', label: 'History', icon: <Clock /> },
    { to: '/dashboard/analytics', label: 'Analytics', icon: <BarChart3 /> },
    { to: '/music-identity', label: 'Identity', icon: <User /> },
    { to: '/dashboard/library-growth', label: 'Growth', icon: <TrendingUp /> },
    { to: '/tasks', label: 'Tasks', icon: <ListTodo /> },
    ...(isAdmin ? [{ to: '/admin' as const, label: 'Admin', icon: <Shield /> }] : []),
  ];

  const signOut = async () => {
    close();
    await authClient.signOut();
    queryClient.clear();
    navigate({ to: '/login' });
  };

  return (
    <GlassSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-3">
          <span onClick={debugTap} className="shrink-0 [-webkit-tap-highlight-color:transparent]">
            <YouAvatar letter={initialOf(user)} className="size-11 text-[18px]" />
          </span>
          <span className="truncate">{user?.name || 'You'}</span>
        </span>
      }
      description="Your pages, settings and account"
      headerRight={
        <Link to="/settings" search={{ tab: undefined }} onClick={close} aria-label="Settings" className="glass-flat grid size-11 place-items-center rounded-full">
          <Settings className="size-5" />
        </Link>
      }
    >
      <h3 className="mb-2 mt-3 font-display text-[17px] font-bold">Go to</h3>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            onClick={close}
            className="glass-surface flex h-[78px] flex-col items-center justify-center gap-1.5 rounded-[18px] text-xs font-semibold [-webkit-tap-highlight-color:transparent] [&_svg]:size-[22px] [&_svg]:text-primary"
          >
            {t.icon}
            {t.label}
          </Link>
        ))}
      </div>

      <div className="glass-surface mt-4 overflow-hidden rounded-[18px]">
        <div className="flex min-h-[56px] items-center gap-3 px-3.5">
          <Palette className="size-5 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-[15px] font-semibold">Theme</span>
          <ThemeSegmented compact className="w-[156px]" />
        </div>
        <div className="ml-[46px] h-px bg-foreground/10" />
        <button
          type="button"
          role="switch"
          aria-checked
          onClick={() => {
            if (setGlassUi(false)) toast.success('Classic design', { duration: 1500 });
            else toast.error('Can’t save this setting (storage blocked)');
            close();
          }}
          className="flex min-h-[52px] w-full items-center gap-3 px-3.5 text-[15px] font-semibold"
        >
          <Layers className="size-5 text-muted-foreground" />
          <span className="flex-1 text-left">Glass design</span>
          <span aria-hidden className="relative h-[26px] w-11 rounded-full bg-primary">
            <span className="absolute left-[21px] top-[3px] size-5 rounded-full bg-background" />
          </span>
        </button>
        <div className="ml-[46px] h-px bg-foreground/10" />
        <button type="button" onClick={signOut} className="flex min-h-[52px] w-full items-center gap-3 px-3.5 text-[15px] font-semibold text-destructive">
          <LogOut className="size-5" />
          Sign out
        </button>
      </div>
    </GlassSheet>
  );
}
