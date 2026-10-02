import { Link, useRouterState } from '@tanstack/react-router';
import { Home, Search, Library, Disc3, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Height of the tab bar's content row (excludes the safe-area inset). The
 * mobile player bar sits directly above it — keep the two in sync.
 */
export const MOBILE_TAB_BAR_HEIGHT_REM = 3.5;

interface Tab {
  id: 'home' | 'search' | 'library' | 'dj';
  to: string;
  label: string;
  icon: LucideIcon;
}

const TABS: readonly Tab[] = [
  { id: 'home', to: '/dashboard', label: 'Home', icon: Home },
  { id: 'search', to: '/library/search', label: 'Search', icon: Search },
  { id: 'library', to: '/playlists', label: 'Library', icon: Library },
  { id: 'dj', to: '/dj', label: 'DJ', icon: Disc3 },
];

/** Which root tab a pathname belongs to, or null for pages outside the four roots. */
export function getActiveTab(pathname: string): Tab['id'] | null {
  if (pathname.startsWith('/library/search')) return 'search';
  if (
    pathname.startsWith('/playlists') ||
    pathname.startsWith('/library') ||
    pathname.startsWith('/downloads')
  ) {
    return 'library';
  }
  if (pathname.startsWith('/dj')) return 'dj';
  if (pathname.startsWith('/dashboard')) return 'home';
  return null;
}

function scrollMainToTop() {
  document
    .querySelector('main [data-radix-scroll-area-viewport]')
    ?.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Persistent bottom navigation for mobile (#283) — the four primary jobs are
 * one tap from anywhere instead of hidden behind the hamburger drawer, which
 * stays for secondary destinations. Re-tapping the active tab returns to its
 * root, or scrolls to the top when already there (iOS convention).
 */
export function MobileTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = getActiveTab(pathname);

  return (
    <nav
      aria-label="Primary"
      className="md:hidden shrink-0 border-t border-border/50 bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-4" style={{ height: `${MOBILE_TAB_BAR_HEIGHT_REM}rem` }}>
        {TABS.map(({ id, to, label, icon: Icon }) => {
          const isActive = active === id;
          const isAtRoot = pathname === to || pathname === `${to}/`;
          return (
            <li key={id} className="flex">
              <Link
                to={to}
                aria-current={isActive ? 'page' : undefined}
                onClick={(e) => {
                  if (isActive && isAtRoot) {
                    e.preventDefault();
                    scrollMainToTop();
                  }
                }}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground',
                )}
              >
                <Icon className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')} strokeWidth={isActive ? 2.5 : 2} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
