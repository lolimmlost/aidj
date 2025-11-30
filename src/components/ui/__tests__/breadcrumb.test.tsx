import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb, breadcrumbItems, BreadcrumbItem } from '../breadcrumb';
import { Home } from 'lucide-react';

// Mock TanStack Router Link
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe('Breadcrumb', () => {
  describe('rendering', () => {
    it('renders nothing when items array is empty', () => {
      const { container } = render(<Breadcrumb items={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders a single breadcrumb item', () => {
      const items: BreadcrumbItem[] = [{ label: 'Home' }];
      render(<Breadcrumb items={items} />);

      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('renders multiple breadcrumb items with separators', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Artists', href: '/library/artists' },
        { label: 'The Beatles' },
      ];
      render(<Breadcrumb items={items} />);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Artists')).toBeInTheDocument();
      expect(screen.getByText('The Beatles')).toBeInTheDocument();
    });

    it('renders links for items with href', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Current Page' },
      ];
      render(<Breadcrumb items={items} />);

      const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
      expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    });

    it('renders the last item as text (not a link)', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Current Page' },
      ];
      render(<Breadcrumb items={items} />);

      const currentPage = screen.getByText('Current Page');
      expect(currentPage.tagName).not.toBe('A');
    });

    it('renders icons when provided', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Home', href: '/', icon: <Home data-testid="home-icon" /> },
      ];
      render(<Breadcrumb items={items} />);

      expect(screen.getByTestId('home-icon')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has proper nav aria-label', () => {
      const items: BreadcrumbItem[] = [{ label: 'Home' }];
      render(<Breadcrumb items={items} />);

      const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(nav).toBeInTheDocument();
    });

    it('marks the last item with aria-current="page"', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Current Page' },
      ];
      render(<Breadcrumb items={items} />);

      // The aria-current is on the outer span (parent of the truncate span containing text)
      const textSpan = screen.getByText('Current Page');
      const outerSpan = textSpan.parentElement;
      expect(outerSpan).toHaveAttribute('aria-current', 'page');
    });

    it('does not mark intermediate items with aria-current', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Artists', href: '/library/artists' },
        { label: 'Current Page' },
      ];
      render(<Breadcrumb items={items} />);

      const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
      expect(dashboardLink).not.toHaveAttribute('aria-current');
    });

    it('renders list with proper role', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Current' },
      ];
      render(<Breadcrumb items={items} />);

      const list = screen.getByRole('list');
      expect(list).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('applies custom className', () => {
      const items: BreadcrumbItem[] = [{ label: 'Home' }];
      render(<Breadcrumb items={items} className="custom-class" />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('custom-class');
    });

    it('truncates long labels on small screens', () => {
      const items: BreadcrumbItem[] = [
        { label: 'This is a very long breadcrumb label that should be truncated' },
      ];
      render(<Breadcrumb items={items} />);

      const label = screen.getByText('This is a very long breadcrumb label that should be truncated');
      expect(label).toHaveClass('truncate');
    });
  });

  describe('breadcrumbItems presets', () => {
    it('has dashboard preset with correct properties', () => {
      expect(breadcrumbItems.dashboard).toEqual({
        label: 'Dashboard',
        href: '/dashboard',
        icon: expect.anything(),
      });
    });

    it('has artists preset with correct properties', () => {
      expect(breadcrumbItems.artists).toEqual({
        label: 'Artists',
        href: '/library/artists',
      });
    });

    it('has playlists preset with correct properties', () => {
      expect(breadcrumbItems.playlists).toEqual({
        label: 'Playlists',
        href: '/playlists',
      });
    });

    it('has settings preset with correct properties', () => {
      expect(breadcrumbItems.settings).toEqual({
        label: 'Settings',
        href: '/settings',
      });
    });
  });
});
