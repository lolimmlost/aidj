import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const router = vi.hoisted(() => ({ pathname: '/playlists/p1' }));
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: router.pathname } }),
}));
vi.mock('@/lib/stores/audio', () => ({
  useAudioStore: (sel: (s: object) => unknown) =>
    sel({ isPlaying: false, currentSongIndex: -1, playlist: [] }),
}));

import { useDocumentTitle, usePageTitle } from '../useDocumentTitle';

function App({ name }: { name?: string }) {
  useDocumentTitle();
  return <Page name={name} />;
}
function Page({ name }: { name?: string }) {
  usePageTitle(name);
  return null;
}

describe('usePageTitle + useDocumentTitle', () => {
  afterEach(() => {
    router.pathname = '/playlists/p1';
  });

  it('uses the route label until the page reports its name', () => {
    const { rerender } = render(<App />);
    expect(document.title).toBe('Playlist · AIDJ');
    rerender(<App name="Liked Songs" />);
    expect(document.title).toBe('Liked Songs · AIDJ');
  });

  it('drops the page name when the page unmounts', () => {
    const { rerender } = render(<App name="Road Trip" />);
    expect(document.title).toBe('Road Trip · AIDJ');
    rerender(<App />);
    expect(document.title).toBe('Playlist · AIDJ');
  });

  it('never applies a name set on a different path', () => {
    const { rerender } = render(<App name="Road Trip" />);
    router.pathname = '/settings';
    function Other() {
      useDocumentTitle();
      return null;
    }
    rerender(<Other />);
    expect(document.title).toBe('Settings · AIDJ');
  });
});
