import { useLayoutEffect } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Home, Search, Library, Disc3, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Height of the tab bar's content row (excludes the bottom inset). */
export const MOBILE_TAB_BAR_HEIGHT_REM = 3.5;

/**
 * How far an installed iOS web app's layout viewport stops short of the
 * physical screen bottom. Some iOS versions size the standalone viewport
 * `screen height − status bar`, leaving a dead band below `position: fixed`
 * content that already clears the home indicator; adding the full
 * safe-area inset on top doubles the gap. 0 in browsers and when correct.
 */
export function measureViewportBottomGap(win: Pick<Window, 'innerHeight' | 'innerWidth' | 'matchMedia' | 'screen'> & { navigator: { standalone?: boolean } }): number {
  const standalone = win.matchMedia('(display-mode: standalone)').matches || win.navigator.standalone === true;
  if (!standalone) return 0;
  const portrait = win.innerHeight >= win.innerWidth;
  const { width, height } = win.screen;
  const screenHeight = portrait ? Math.max(width, height) : Math.min(width, height);
  return Math.max(0, Math.round(screenHeight - win.innerHeight));
}

/**
 * Publishes the bottom offsets other fixed mobile UI stacks on:
 *   --mobile-safe-bottom     inset still needed below the tab row
 *   --mobile-tabbar-offset   full tab bar height (row + inset)
 * Unset when the tab bar isn't mounted, so consumers fall back to 0.
 */
function useTabBarOffsets() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const gap = measureViewportBottomGap(window as Window & { navigator: { standalone?: boolean } });
      root.style.setProperty('--mobile-safe-bottom', `max(0px, calc(env(safe-area-inset-bottom) - ${gap}px))`);
      root.style.setProperty('--mobile-tabbar-offset', `calc(${MOBILE_TAB_BAR_HEIGHT_REM}rem + var(--mobile-safe-bottom))`);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      root.style.removeProperty('--mobile-safe-bottom');
      root.style.removeProperty('--mobile-tabbar-offset');
    };
  }, []);
}

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
  useTabBarOffsets();

  return (
    <nav
      data-bottom-chrome
      aria-label="Primary"
      className="md:hidden shrink-0 border-t border-border/50 bg-background/95 backdrop-blur-xl pb-[var(--mobile-safe-bottom,env(safe-area-inset-bottom))]"
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
