import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Menu, X, Music, Search, Settings, Download, LayoutDashboard, BarChart3, Clock, ListMusic, Sparkles, User, LogOut, Shield, ListTodo, TrendingUp, Layers } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import authClient from '@/lib/auth/auth-client';
import { useQueryClient } from '@tanstack/react-query';
import { useDebugTapToggle } from '@/lib/hooks/useDebugTapToggle';
import { useGlassUi, setGlassUi } from '@/lib/hooks/useGlassUi';
import { toast } from '@/lib/toast';

/** Derive a page title from the current route path */
function getPageTitle(path: string): string {
  if (path === '/dashboard' || path === '/dashboard/') return 'Dashboard';
  if (path.includes('/dashboard/discover')) return 'Discover';
  if (path.includes('/dashboard/analytics')) return 'Analytics';
  if (path.includes('/dashboard/history')) return 'History';
  if (path.match(/\/library\/artists\/[^/]+\/albums\//)) return 'Album';
  if (path.match(/\/library\/artists\/[^/]+/)) return 'Artist';
  if (path.includes('/library/artists')) return 'Artists';
  if (path.includes('/library/search')) return 'Search';
  if (path.startsWith('/playlists')) return 'Playlists';
  if (path.startsWith('/downloads')) return 'Downloads';
  if (path.startsWith('/music-identity')) return 'Music Identity';
  if (path.startsWith('/settings')) return 'Settings';
  if (path.startsWith('/admin')) return 'Admin';
  if (path.startsWith('/tasks')) return 'Tasks';
  if (path.startsWith('/dashboard/library-growth')) return 'Library Growth';
  if (path.startsWith('/dj')) return 'DJ';
  return 'AIDJ';
}

function NavSectionLabel({ label }: { label: string }) {
  return (
    <p className="px-4 pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      {label}
    </p>
  );
}

/** Height of the mobile top bar in pixels — exported so other components can account for it */
export const MOBILE_TOP_BAR_HEIGHT = 48;

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === 'admin';

  const queryClient = useQueryClient();
  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  const pageTitle = getPageTitle(currentPath);

  // Tap the title bar 5× rapidly to toggle on-device debug logging (PWA-safe).
  const debugTap = useDebugTapToggle();
  const glass = useGlassUi();

  // glass phones have no top bar: pages read --top-bar (styles.css) to sit right under the status bar
  useEffect(() => {
    document.documentElement.toggleAttribute('data-glass-ui', glass);
  }, [glass]);

  const handleSignOut = async () => {
    closeMenu();
    await authClient.signOut();
    queryClient.clear();
    navigate({ to: '/login' });
  };

  // glass: no bar at all; the menu is the You tab's sheet (MobileTabBar), back is in the page
  if (glass) return null;

  return (
    <>
      {/* ─── Fixed Top Bar ─── */}
      <div
        className={cn(
          "md:hidden fixed top-0 left-0 right-0 z-50 flex items-center px-3 backdrop-blur-xl",
          glass ? "bg-background/40" : "bg-background/80 border-b border-border/30",
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(env(safe-area-inset-top) + 3rem)' }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleMenu}
          className="h-9 w-9 p-0 shrink-0"
          aria-label="Toggle navigation menu"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <span
          // glass: the page shows its own big title, so this one is invisible (still the debug tap target)
          className={cn("flex-1 text-center text-sm font-bold text-foreground truncate pr-9 select-none", glass && "opacity-0")}
          style={{ fontFamily: 'var(--font-display), Inter, sans-serif' }}
          onClick={debugTap}
        >
          {pageTitle}
        </span>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+3rem)] bg-black/50 z-[55] animate-in fade-in-0 duration-200"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* Slide-out Navigation Drawer */}
      <nav
        className={`
          md:hidden fixed top-[calc(env(safe-area-inset-top)+3rem)] bottom-0 left-0 w-[280px] bg-background border-r border-border z-[55]
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        aria-label="Mobile navigation"
      >
        <div className="flex flex-col h-full pt-4 px-4 overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div className="space-y-1">
            <NavSectionLabel label="Main" />
            <NavLink
              to="/dashboard"
              icon={<LayoutDashboard className="h-5 w-5" />}
              label="Dashboard"
              onClick={closeMenu}
              active={currentPath === '/dashboard' || currentPath === '/dashboard/'}
            />
            <NavLink
              to="/dashboard/discover"
              icon={<Sparkles className="h-5 w-5" />}
              label="Discover"
              onClick={closeMenu}
              active={currentPath.includes('/dashboard/discover')}
            />
            <NavLink
              to="/library/search"
              icon={<Search className="h-5 w-5" />}
              label="Search Library"
              onClick={closeMenu}
              active={currentPath.includes('/library/search')}
            />
            <NavLink
              to="/library/artists"
              icon={<Music className="h-5 w-5" />}
              label="Browse Artists"
              onClick={closeMenu}
              active={currentPath.includes('/library/artists')}
            />

            <NavSectionLabel label="Library" />
            <NavLink
              to="/playlists"
              icon={<ListMusic className="h-5 w-5" />}
              label="Playlists"
              onClick={closeMenu}
              active={currentPath.startsWith('/playlists')}
            />
            <NavLink
              to="/downloads"
              icon={<Download className="h-5 w-5" />}
              label="Downloads"
              onClick={closeMenu}
              active={currentPath.startsWith('/downloads')}
            />
            <NavLink
              to="/tasks"
              icon={<ListTodo className="h-5 w-5" />}
              label="Tasks"
              onClick={closeMenu}
              active={currentPath.startsWith('/tasks')}
            />

            <NavSectionLabel label="Insights" />
            <NavLink
              to="/dashboard/analytics"
              icon={<BarChart3 className="h-5 w-5" />}
              label="Analytics"
              onClick={closeMenu}
              active={currentPath.includes('/analytics')}
            />
            <NavLink
              to="/dashboard/history"
              icon={<Clock className="h-5 w-5" />}
              label="History"
              onClick={closeMenu}
              active={currentPath.includes('/dashboard/history')}
            />
            <NavLink
              to="/music-identity"
              icon={<User className="h-5 w-5" />}
              label="Music Identity"
              onClick={closeMenu}
              active={currentPath.startsWith('/music-identity')}
            />
            <NavLink
              to="/dashboard/library-growth"
              icon={<TrendingUp className="h-5 w-5" />}
              label="Library Growth"
              onClick={closeMenu}
              active={currentPath.includes('/library-growth')}
            />

            <NavSectionLabel label="System" />
            {isAdmin && (
              <NavLink
                to="/admin"
                icon={<Shield className="h-5 w-5" />}
                label="Admin"
                onClick={closeMenu}
                active={currentPath.startsWith('/admin')}
              />
            )}
            <NavLink
              to="/settings"
              icon={<Settings className="h-5 w-5" />}
              label="Settings"
              onClick={closeMenu}
              active={currentPath.startsWith('/settings')}
            />

            <div className="border-t border-border my-4" />

            {/* Glass design switch (PWA has no address bar for ?glass=0) */}
            <button
              type="button"
              role="switch"
              aria-checked={glass}
              onClick={() => {
                if (setGlassUi(!glass)) {
                  toast.success(glass ? 'Classic design' : 'Glass design', { duration: 1500 });
                } else {
                  toast.error('Can’t save this setting (storage blocked)');
                }
              }}
              className="flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-lg hover:bg-accent transition-colors w-full text-foreground"
            >
              <Layers className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 text-left text-base">Glass design</span>
              <span aria-hidden className={cn("relative h-6 w-10 rounded-full transition-colors", glass ? "bg-primary" : "bg-muted")}>
                <span className={cn("absolute top-0.5 size-5 rounded-full bg-background shadow transition-[left]", glass ? "left-[18px]" : "left-0.5")} />
              </span>
            </button>

            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors w-full text-muted-foreground"
            >
              <LogOut className="h-5 w-5" />
              <span className="text-base">Sign Out</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}

interface NavLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}

function NavLink({ to, icon, label, onClick, active }: NavLinkProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-lg transition-colors",
        active
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {icon}
      <span className="text-base">{label}</span>
    </Link>
  );
}
