import type { AnchorHTMLAttributes } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileNav } from '../mobile-nav';

const routerState = vi.hoisted(() => ({ location: { pathname: '/dashboard' } }));

// Keep route and session setup independent of the app's backend services.
vi.mock('@tanstack/react-router', () => ({
  useRouterState: () => routerState,
  useNavigate: () => vi.fn(),
  Link: ({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props} />
  ),
}));

vi.mock('@/lib/auth/auth-client', () => ({
  default: {
    useSession: () => ({ data: { user: { role: 'user' } } }),
    signOut: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: vi.fn() }),
}));

vi.mock('@/lib/hooks/useDebugTapToggle', () => ({
  useDebugTapToggle: () => vi.fn(),
}));

const destinations = [
  { label: 'Downloads', path: '/downloads' },
  { label: 'Tasks', path: '/tasks' },
  { label: 'Library Growth', path: '/dashboard/library-growth' },
];

describe('MobileNav', () => {
  beforeEach(() => {
    routerState.location.pathname = '/dashboard';
  });

  it.each(destinations)('links to $label from the mobile menu', ({ label, path }) => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation menu' }));

    const menu = screen.getByRole('navigation', { name: 'Mobile navigation' });
    expect(within(menu).getByRole('link', { name: label })).toHaveAttribute('href', path);
  });

  it.each(destinations)('shows $label in the mobile header at $path', ({ label, path }) => {
    routerState.location.pathname = path;
    render(<MobileNav />);

    // The toggle and page title share the top bar; exclude the drawer's labels.
    const topBar = screen.getByRole('button', { name: 'Toggle navigation menu' }).parentElement!;
    expect(within(topBar).getByText(label)).toBeInTheDocument();
  });
});
