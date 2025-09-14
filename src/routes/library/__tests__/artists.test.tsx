import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArtistsList } from '../artists';
import * as navidrome from '@/lib/services/navidrome';

// Mock the navidrome service
vi.mock('@/lib/services/navidrome', () => ({
  getArtists: vi.fn(),
}));

const mockGetArtists = navidrome.getArtists as unknown as ReturnType<typeof vi.fn>;

const mockArtists = [
  { id: '1', name: 'Artist A' },
  { id: '2', name: 'Artist B' },
  { id: '3', name: 'Artist C' },
];

const renderWithProviders = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ArtistsList />
    </QueryClientProvider>
  );
};

describe('ArtistsList Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetArtists.mockResolvedValue(mockArtists);
  });

  it('should render title and basic structure', () => {
    renderWithProviders();
    
    expect(screen.getByText('Artists')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show filters/i })).toBeInTheDocument();
    expect(screen.getByText('← Dashboard')).toBeInTheDocument();
  });

  it('should render artists after loading', async () => {
    renderWithProviders();
    
    await waitFor(() => {
      expect(screen.getByText('Artist A')).toBeInTheDocument();
      expect(screen.getByText('Artist B')).toBeInTheDocument();
      expect(screen.getByText('Artist C')).toBeInTheDocument();
    });
    
    expect(mockGetArtists).toHaveBeenCalledWith(0, 50);
  });

  it('should render sorted artists alphabetically', async () => {
    const unsortedArtists = [
      { id: '3', name: 'Charlie' },
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];
    mockGetArtists.mockResolvedValueOnce(unsortedArtists);
    
    renderWithProviders();
    
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });
  });

  it('should render error state when query fails', async () => {
    const error = new Error('Failed to load artists');
    mockGetArtists.mockRejectedValueOnce(error);
    
    renderWithProviders();
    
    await waitFor(() => {
      expect(screen.getByText(/Error loading artists/)).toBeInTheDocument();
    });
    
    expect(screen.queryByText('Artist A')).not.toBeInTheDocument();
  });

  it('should render no artists message when empty', async () => {
    mockGetArtists.mockResolvedValueOnce([]);
    
    renderWithProviders();
    
    await waitFor(() => {
      expect(screen.getByText('No artists found.')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your filters or check your library configuration.')).toBeInTheDocument();
    });
  });

  it('should toggle filters visibility', async () => {
    renderWithProviders();
    
    await waitFor(() => {
      expect(screen.getByText('Artist A')).toBeInTheDocument();
    });
    
    // Initially filters should not be visible
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    
    // Click show filters
    const showFiltersButton = screen.getByRole('button', { name: /show filters/i });
    fireEvent.click(showFiltersButton);
    
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(showFiltersButton).toHaveTextContent('Hide Filters');
    });
    
    // Click hide filters
    fireEvent.click(showFiltersButton);
    
    await waitFor(() => {
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(showFiltersButton).toHaveTextContent('Show Filters');
    });
  });

  it('should render navigation links', async () => {
    renderWithProviders();
    
    await waitFor(() => {
      expect(screen.getByText('Artist A')).toBeInTheDocument();
    });
    
    // Check dashboard navigation
    const dashboardLinks = screen.getAllByText('← Dashboard');
    expect(dashboardLinks).toHaveLength(2);
  });
});
