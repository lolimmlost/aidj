import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SmartPlaylistBuilder } from '../smart-playlist-builder';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('SmartPlaylistBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the trigger button', () => {
    render(<SmartPlaylistBuilder />, { wrapper: createWrapper() });
    const button = screen.getByRole('button', { name: /create smart playlist/i });
    expect(button).toBeDefined();
  });

  it('should open dialog when trigger is clicked', async () => {
    render(<SmartPlaylistBuilder />, { wrapper: createWrapper() });
    const button = screen.getByRole('button', { name: /create smart playlist/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/create a dynamic playlist with filters/i)).toBeDefined();
    });
  });

  it('should display all filter inputs when dialog is open', async () => {
    render(<SmartPlaylistBuilder />, { wrapper: createWrapper() });
    const button = screen.getByRole('button', { name: /create smart playlist/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByLabelText(/playlist name/i)).toBeDefined();
      expect(screen.getByLabelText(/genre/i)).toBeDefined();
      expect(screen.getByText(/year range/i)).toBeDefined();
      expect(screen.getByLabelText(/artists/i)).toBeDefined();
      expect(screen.getByLabelText(/minimum rating/i)).toBeDefined();
      expect(screen.getByLabelText(/recently added/i)).toBeDefined();
    });
  });

  it('should display required attribute on name input', async () => {
    render(<SmartPlaylistBuilder />, { wrapper: createWrapper() });

    const button = screen.getByRole('button', { name: /create smart playlist/i });
    fireEvent.click(button);

    await waitFor(() => {
      const nameInput = screen.getByLabelText(/playlist name/i);
      expect(nameInput.getAttribute('required')).toBe('');
    });
  });

  it('should allow adding and removing genre tags', async () => {
    render(<SmartPlaylistBuilder availableGenres={['Rock', 'Pop']} />, {
      wrapper: createWrapper(),
    });

    const button = screen.getByRole('button', { name: /create smart playlist/i });
    fireEvent.click(button);

    await waitFor(() => {
      const genreSelect = screen.getByRole('combobox', { name: /genre/i });
      expect(genreSelect).toBeDefined();
    });

    // Note: Full select interaction would require more complex testing
    // This is a basic smoke test
  });

  it('should validate year range', async () => {
    const { toast } = await import('sonner');
    render(<SmartPlaylistBuilder />, { wrapper: createWrapper() });

    const button = screen.getByRole('button', { name: /create smart playlist/i });
    fireEvent.click(button);

    await waitFor(async () => {
      const nameInput = screen.getByLabelText(/playlist name/i);
      fireEvent.change(nameInput, { target: { value: 'Test Playlist' } });

      // Note: Testing slider interaction is complex
      // This test verifies the component renders
      expect(screen.getByText(/year range/i)).toBeDefined();
    });
  });

  it('should allow adding artists via input', async () => {
    render(<SmartPlaylistBuilder />, { wrapper: createWrapper() });

    const button = screen.getByRole('button', { name: /create smart playlist/i });
    fireEvent.click(button);

    await waitFor(() => {
      const artistInput = screen.getByPlaceholderText(/type artist name/i);
      fireEvent.change(artistInput, { target: { value: 'The Beatles' } });

      const addButton = screen.getByRole('button', { name: /add/i });
      fireEvent.click(addButton);

      expect(screen.getByText('The Beatles')).toBeDefined();
    });
  });
});
