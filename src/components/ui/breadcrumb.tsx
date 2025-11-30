import { Link } from '@tanstack/react-router';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Breadcrumb navigation component
 * Provides hierarchical navigation with proper accessibility support
 */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb navigation"
      className={cn('flex items-center text-sm', className)}
    >
      <ol className="flex items-center flex-wrap gap-1" role="list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isFirst = index === 0;

          return (
            <li key={item.href || item.label} className="flex items-center">
              {/* Separator (not for first item) */}
              {!isFirst && (
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground mx-1 flex-shrink-0"
                  aria-hidden="true"
                />
              )}

              {/* Breadcrumb link or current page */}
              {isLast || !item.href ? (
                <span
                  className={cn(
                    'flex items-center gap-1.5 font-medium',
                    isLast
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.icon}
                  <span className="truncate max-w-[200px] sm:max-w-[300px]">
                    {item.label}
                  </span>
                </span>
              ) : (
                <Link
                  to={item.href}
                  className={cn(
                    'flex items-center gap-1.5 text-muted-foreground hover:text-foreground',
                    'transition-colors min-h-[44px] px-1 -mx-1',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm'
                  )}
                >
                  {item.icon}
                  <span className="truncate max-w-[150px] sm:max-w-[200px]">
                    {item.label}
                  </span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Pre-built breadcrumb items for common navigation paths
 */
export const breadcrumbItems = {
  dashboard: { label: 'Dashboard', href: '/dashboard', icon: <Home className="h-4 w-4" /> },
  library: { label: 'Library', href: '/library' },
  artists: { label: 'Artists', href: '/library/artists' },
  albums: { label: 'Albums' },
  playlists: { label: 'Playlists', href: '/playlists' },
  settings: { label: 'Settings', href: '/settings' },
  search: { label: 'Search', href: '/library/search' },
};
