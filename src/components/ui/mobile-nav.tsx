import React, { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Menu, X, Home, Music, Search, Settings, Download, LayoutDashboard, BarChart3, ListMusic } from 'lucide-react';
import { Button } from './button';

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

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
        <div className="flex flex-col h-full pt-20 pb-6 px-4 overflow-y-auto">
          <div className="space-y-2">
            <NavLink
              to="/dashboard"
              icon={<LayoutDashboard className="h-5 w-5" />}
              label="Dashboard"
              onClick={closeMenu}
            />
            <NavLink
              to="/dashboard/analytics"
              icon={<BarChart3 className="h-5 w-5" />}
              label="Analytics"
              onClick={closeMenu}
            />
            <NavLink
              to="/library/artists"
              icon={<Music className="h-5 w-5" />}
              label="Browse Artists"
              onClick={closeMenu}
            />
            <NavLink
              to="/library/search"
              icon={<Search className="h-5 w-5" />}
              label="Search Library"
              onClick={closeMenu}
            />
            <NavLink
              to="/playlists"
              icon={<ListMusic className="h-5 w-5" />}
              label="Playlists"
              onClick={closeMenu}
            />
            <NavLink
              to="/downloads"
              icon={<Download className="h-5 w-5" />}
              label="Downloads"
              onClick={closeMenu}
            />
            <NavLink
              to="/settings"
              icon={<Settings className="h-5 w-5" />}
              label="Settings"
              onClick={closeMenu}
            />

            <div className="border-t border-border my-4" />

            <NavLink
              to="/"
              icon={<Home className="h-5 w-5" />}
              label="Home"
              onClick={closeMenu}
            />
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
}

function NavLink({ to, icon, label, onClick }: NavLinkProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
      activeProps={{
        className: 'bg-accent text-accent-foreground font-medium',
      }}
    >
      {icon}
      <span className="text-base">{label}</span>
    </Link>
  );
}
