import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArtistRequestPanel, groupReleases } from '../ArtistRequestPanel';
import { toast } from '@/lib/toast';

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const MBID = '780269c0-0000-4000-8000-000000000000';
const releases = [
  { id: 'rg-album', title: 'Eien', primaryType: 'Album', firstReleaseDate: '2025-02-01' },
  { id: 'rg-star', title: 'STAR', primaryType: 'Single', firstReleaseDate: '2024-05-01' },
  { id: 'rg-oku', title: '億万長者', primaryType: 'Single', firstReleaseDate: '2024-09-01' },
  { id: 'rg-ep', title: 'Some EP', primaryType: 'EP', firstReleaseDate: '2023-01-01' },
];

type Status = {
  inLidarr: boolean; artistMonitored: boolean; followingNewReleases: boolean;
  albums: Record<string, { state: string; title: string; trackFiles: number; tracks: number; filedUnder?: string }>;
  requests: Record<string, { users: number; byMe: boolean }>;
};

function mockFetch(status: Status, requestResult?: unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/lidarr/request-status')) {
      return new Response(JSON.stringify({ data: status }), { status: 200 });
    }
    if (url === '/api/lidarr/request') {
      return new Response(JSON.stringify({ data: requestResult ?? { outcome: 'monitored', message: 'ok', body: init?.body } }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ArtistRequestPanel mbid={MBID} artistName="千葉雄喜" releaseGroups={releases} />
    </QueryClientProvider>,
  );
}

const emptyStatus: Status = { inLidarr: false, artistMonitored: false, followingNewReleases: false, albums: {}, requests: {} };

describe('groupReleases', () => {
  it('groups Albums / EPs / Singles, newest first', () => {
    const g = groupReleases(releases);
    expect(g.map(x => x.label)).toEqual(['Albums', 'EPs', 'Singles']);
    expect(g[2].items.map(r => r.title)).toEqual(['億万長者', 'STAR']);
  });
});

describe('ArtistRequestPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers follow, per-release Get, and a song field', async () => {
    mockFetch(emptyStatus);
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: /follow artist/i })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Get STAR' })).toBeInTheDocument();
    expect(screen.getByLabelText(/looking for a specific song/i)).toBeInTheDocument();
  });

  it('shows the real Lidarr state instead of a Get button', async () => {
    mockFetch({
      inLidarr: true, artistMonitored: true, followingNewReleases: true,
      albums: {
        'rg-album': { state: 'wanted', title: 'Eien', trackFiles: 0, tracks: 10 },
        'rg-star': { state: 'partial', title: 'STAR', trackFiles: 1, tracks: 3 },
        'rg-ep': { state: 'in_library', title: 'Some EP', trackFiles: 4, tracks: 4 },
      },
      requests: { 'rg-album': { users: 2, byMe: true } },
    });
    renderPanel();
    expect(await screen.findByText(/following\. new releases download/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /follow artist/i })).not.toBeInTheDocument();
    const eien = screen.getByText('Eien').closest('li')!;
    expect(within(eien).getByText(/waiting for download/i)).toBeInTheDocument();
    expect(within(eien).getByText(/requested by you \+ 1 other/i)).toBeInTheDocument();
    expect(screen.getByText(/downloading 1\/3/i)).toBeInTheDocument();
    expect(screen.getByText(/in library/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Get Eien' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get 億万長者' })).toBeInTheDocument();
  });

  it('Get posts a release request and reports the outcome', async () => {
    const fetchMock = mockFetch(emptyStatus, { outcome: 'monitored', message: '"STAR" is monitored and waiting for download.' });
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Get STAR' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Get STAR' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('"STAR" is monitored and waiting for download.'));
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/lidarr/request')!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ mbid: MBID, artistName: '千葉雄喜', mode: 'release', releaseGroupId: 'rg-star' });
  });

  it('a not_found song lookup is an error toast, and keeps the typed title', async () => {
    mockFetch(emptyStatus, { outcome: 'not_found', message: "Couldn't tell which release has \"Foo\"." });
    renderPanel();
    const input = await screen.findByLabelText(/looking for a specific song/i);
    await userEvent.type(input, 'Foo');
    await waitFor(() => expect(screen.getByRole('button', { name: /find/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /find/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(input).toHaveValue('Foo');
  });

  it('an unavailable release is an error toast', async () => {
    mockFetch(emptyStatus, { outcome: 'unavailable', message: `Lidarr's database doesn't have "STAR", so it can't download it.` });
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Get STAR' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Get STAR' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(`Lidarr's database doesn't have "STAR", so it can't download it.`));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows the lead artist a collab is filed under', async () => {
    mockFetch({
      ...emptyStatus,
      albums: { 'rg-star': { state: 'wanted', title: 'STAR', trackFiles: 0, tracks: 1, filedUnder: 'DUMMFÖUND' } },
    });
    renderPanel();
    const row = (await screen.findByText('STAR')).closest('li')!;
    await waitFor(() => expect(within(row).getByText(/filed under DUMMFÖUND/)).toBeInTheDocument());
    expect(within(row).getByText(/waiting for download/i)).toBeInTheDocument();
  });

  it('says so when Lidarr is not configured', async () => {
    global.fetch = vi.fn(async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
    renderPanel();
    expect(await screen.findByText(/lidarr isn't configured/i)).toBeInTheDocument();
  });
});
