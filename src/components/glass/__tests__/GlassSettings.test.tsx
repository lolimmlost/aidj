import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';

const { setAIDJEnabled, setGlassUi, setLowMotion, auth } = vi.hoisted(() => ({
  setAIDJEnabled: vi.fn(),
  setGlassUi: vi.fn(() => true),
  setLowMotion: vi.fn(),
  auth: { session: null as { user: Record<string, unknown> } | null },
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, search, className, ...rest }: { children: ReactNode; search?: { tab?: string }; className?: string }) => (
    <a href={`/settings?tab=${search?.tab ?? ''}`} className={className} aria-current={(rest as { 'aria-current'?: 'page' })['aria-current']}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/auth/auth-client', () => ({ default: { useSession: () => ({ data: auth.session }) } }));
vi.mock('@/components/theme-provider', () => ({ useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }) }));
vi.mock('@/lib/stores/audio', () => ({ useAudioStore: { getState: () => ({ setAIDJEnabled }) } }));
vi.mock('@/lib/hooks/useGlassUi', () => ({ useGlassUi: () => true, setGlassUi }));
vi.mock('@/lib/hooks/useLowMotion', () => ({ useLowMotion: () => false, setLowMotion }));

import { usePreferencesStore } from '@/lib/stores/preferences';
import { GlassSettingsIndex } from '../GlassSettings';

function setPrefs(recs: { aiEnabled: boolean; aiDJEnabled: boolean; aiDJDripInterval?: number }, crossfade = 6) {
  const p = usePreferencesStore.getState().preferences;
  usePreferencesStore.setState({
    preferences: {
      ...p,
      recommendationSettings: { ...p.recommendationSettings, ...recs },
      playbackSettings: { ...p.playbackSettings, crossfadeDuration: crossfade },
      notificationSettings: { browserNotifications: true, downloadCompletion: true, recommendationUpdates: false },
    },
  });
}

const row = (name: string) => screen.getByRole('link', { name: new RegExp(`^${name}`) });

describe('GlassSettingsIndex (Control centre)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.session = { user: { name: 'Juan Reyes', email: 'juan@example.com', twoFactorEnabled: true } };
    setPrefs({ aiEnabled: true, aiDJEnabled: true, aiDJDripInterval: 3 });
  });

  it('shows the profile card and each page’s current value', () => {
    render(<GlassSettingsIndex isAdmin />);
    expect(within(row('J')).getByText('Juan Reyes')).toBeTruthy();
    expect(within(row('J')).getByText('juan@example.com · Admin')).toBeTruthy();
    expect(within(row('Playback')).getByText('Crossfade 6 s')).toBeTruthy();
    expect(within(row('AI DJ')).getByText('Every 3')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Notifications/ })).toBeNull();
    expect(within(row('Appearance')).getByText('Dark')).toBeTruthy();
    expect(within(row('Security')).getByText('2FA on')).toBeTruthy();
    expect(row('Services')).toBeTruthy();
    expect(row('Album art')).toBeTruthy();
  });

  it('hides the admin pages from everyone else', () => {
    render(<GlassSettingsIndex isAdmin={false} />);
    expect(screen.queryByRole('link', { name: /^Services/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Album art/ })).toBeNull();
  });

  it('turns the AI DJ off through the player’s own switch', () => {
    render(<GlassSettingsIndex isAdmin />);
    const tile = screen.getByRole('switch', { name: /AI DJ/ });
    expect(tile.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(tile);
    expect(setAIDJEnabled).toHaveBeenCalledWith(false);
  });

  it('locks the AI DJ tile while recommendations are off', () => {
    setPrefs({ aiEnabled: false, aiDJEnabled: true });
    render(<GlassSettingsIndex isAdmin />);
    const tile = screen.getByRole('switch', { name: /AI DJ/ }) as HTMLButtonElement;
    expect(tile.disabled).toBe(true);
    expect(tile.getAttribute('aria-checked')).toBe('false');
    expect(within(tile).getByText('Turn on recommendations first')).toBeTruthy();
  });

  it('flips glass and low motion from the quick tiles', () => {
    render(<GlassSettingsIndex isAdmin />);
    fireEvent.click(screen.getByRole('switch', { name: /Glass/ }));
    expect(setGlassUi).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('switch', { name: /Low motion/ }));
    expect(setLowMotion).toHaveBeenCalledWith(true);
  });

  it('says “Password only” without two-factor, and drops chevrons in the split view', () => {
    auth.session = { user: { name: 'A', email: 'a@example.com' } };
    const { container } = render(<GlassSettingsIndex isAdmin active="playback" />);
    expect(within(row('Security')).getByText('Password only')).toBeTruthy();
    expect(row('Playback').getAttribute('aria-current')).toBe('page');
    expect(container.querySelectorAll('.lucide-chevron-right')).toHaveLength(0);
  });
});
