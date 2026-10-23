import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FeaturedMixCard } from '../FeaturedMixCard';

const tracklist = Array.from({ length: 8 }, (_, i) => `${i * 2}:00   ${i + 1}. Artist ${i + 1} – Track ${i + 1}`).join('\n');

function renderCard(song: unknown, songId = 'mix1') {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ 'subsonic-response': song ? { song } : { status: 'failed' } }),
  })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FeaturedMixCard songId={songId} />
    </QueryClientProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('FeaturedMixCard', () => {
  it('shows the mix without its version note, with a collapsed tracklist', async () => {
    renderCard({
      id: 'mix1', title: 'Five-Star Peak Time (bar-fix test)', album: 'Tacoma Bike Party', albumId: 'al1',
      artist: 'AIDJ', duration: 1126, comment: tracklist,
    });
    expect(await screen.findByRole('heading', { name: 'Five-Star Peak Time' })).toBeDefined();
    expect(screen.getByText('Featured mix · Tacoma Bike Party')).toBeDefined();
    expect(screen.getByText('AIDJ · 19 min · 8 tracks')).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);

    fireEvent.click(screen.getByRole('button', { name: /show all 8/i }));
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });

  it('renders nothing when Navidrome does not know the id', async () => {
    const { container } = renderCard(null);
    await waitFor(() => expect(container.querySelector('[data-slot="skeleton"]')).toBeNull());
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders nothing when the feature is turned off', () => {
    const { container } = renderCard(null, '');
    expect(container.innerHTML).toBe('');
  });
});
