import React, { useState } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Menu, X, Home, Music, Search, Settings, Download, LayoutDashboard, BarChart3, ListMusic, Sparkles, User, TrendingUp, LogOut } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import authClient from '@/lib/auth/auth-client';
import { useAudioStore } from '@/lib/stores/audio';

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { playlist, currentSongIndex } = useAudioStore();
  const hasActiveSong = playlist.length > 0 && currentSongIndex >= 0;

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  const handleSignOut = async () => {
    closeMenu();
    await authClient.signOut();
    navigate({ to: '/login' });
  };

  return (
    <>
      {/* Hamburger Button - Fixed Top Left on Mobile */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleMenu}
          className="min-h-[44px] min-w-[44px] p-3 bg-background/95 backdrop-blur-sm shadow-lg"
          aria-label="Toggle navigation menu"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 animate-in fade-in-0 duration-200"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* Slide-out Navigation Drawer */}
      <nav
        className={`
          md:hidden fixed top-0 left-0 h-full w-[280px] bg-background border-r border-border z-40
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        aria-label="Mobile navigation"
      >
        <div className={`flex flex-col h-full pt-20 px-4 overflow-y-auto ${hasActiveSong ? 'pb-28' : 'pb-6'}`}>
          <div className="space-y-2">
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
              to="/dashboard/analytics"
              icon={<BarChart3 className="h-5 w-5" />}
              label="Analytics"
              onClick={closeMenu}
              active={currentPath.includes('/analytics')}
            />
            <NavLink
              to="/music-identity"
              icon={<User className="h-5 w-5" />}
              label="Music Identity"
              onClick={closeMenu}
              active={currentPath.startsWith('/music-identity')}
            />
            <NavLink
              to="/library/artists"
              icon={<Music className="h-5 w-5" />}
              label="Browse Artists"
              onClick={closeMenu}
              active={currentPath.includes('/library/artists')}
            />
            <NavLink
              to="/library/search"
              icon={<Search className="h-5 w-5" />}
              label="Search Library"
              onClick={closeMenu}
              active={currentPath.includes('/library/search')}
            />
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
              to="/dashboard/library-growth"
              icon={<TrendingUp className="h-5 w-5" />}
              label="Library Growth"
              onClick={closeMenu}
              active={currentPath.includes('/library-growth')}
            />
            <NavLink
              to="/settings"
              icon={<Settings className="h-5 w-5" />}
              label="Settings"
              onClick={closeMenu}
              active={currentPath.startsWith('/settings')}
            />

            <div className="border-t border-border my-4" />

            <NavLink
              to="/"
              icon={<Home className="h-5 w-5" />}
              label="Home"
              onClick={closeMenu}
              active={currentPath === '/'}
            />

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
