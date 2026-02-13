import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SongFeedbackButtons } from '../SongFeedbackButtons';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('SongFeedbackButtons', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  const renderComponent = (props: Partial<React.ComponentProps<typeof SongFeedbackButtons>> = {}) => {
    const defaultProps = {
      songId: 'test-song-id',
      artistName: 'Test Artist',
      songTitle: 'Test Song',
      currentFeedback: null as 'thumbs_up' | 'thumbs_down' | null,
      source: 'search' as const,
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <SongFeedbackButtons {...defaultProps} {...props} />
      </QueryClientProvider>
    );
  };

  describe('Rendering', () => {
    it('renders thumbs up and thumbs down buttons', () => {
      renderComponent();

      expect(screen.getByLabelText('Like song')).toBeInTheDocument();
      expect(screen.getByLabelText('Dislike song')).toBeInTheDocument();
    });

    it('renders with thumbs up active state', () => {
      renderComponent({ currentFeedback: 'thumbs_up' });

      const likeButton = screen.getByLabelText('Unlike song');
      expect(likeButton).toBeInTheDocument();
      expect(likeButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('renders with thumbs down active state', () => {
      renderComponent({ currentFeedback: 'thumbs_down' });

      const dislikeButton = screen.getByLabelText('Remove dislike');
      expect(dislikeButton).toBeInTheDocument();
      expect(dislikeButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('applies correct styling for active thumbs up', () => {
      renderComponent({ currentFeedback: 'thumbs_up' });

      const likeButton = screen.getByLabelText('Unlike song');
      expect(likeButton).toHaveClass('text-blue-600');
    });

    it('applies correct styling for active thumbs down', () => {
      renderComponent({ currentFeedback: 'thumbs_down' });

      const dislikeButton = screen.getByLabelText('Remove dislike');
      expect(dislikeButton).toHaveClass('text-red-600');
    });
  });

  describe('User Interactions', () => {
    it('calls feedback API when thumbs up is clicked', async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, feedbackId: 'test-id' }),
      });

      renderComponent();

      const likeButton = screen.getByLabelText('Like song');
      await user.click(likeButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/recommendations/feedback',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              songArtistTitle: 'Test Artist - Test Song',
              feedbackType: 'thumbs_up',
              source: 'search',
              songId: 'test-song-id',
            }),
          })
        );
      });
    });

    it('calls feedback API when thumbs down is clicked', async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, feedbackId: 'test-id' }),
      });

      renderComponent();

      const dislikeButton = screen.getByLabelText('Dislike song');
      await user.click(dislikeButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/recommendations/feedback',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              songArtistTitle: 'Test Artist - Test Song',
              feedbackType: 'thumbs_down',
              source: 'search',
              songId: 'test-song-id',
            }),
          })
        );
      });
    });

    it('prevents double-clicking the same feedback button', async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, feedbackId: 'test-id' }),
      });

      renderComponent({ currentFeedback: 'thumbs_up' });

      const likeButton = screen.getByLabelText('Unlike song');
      await user.click(likeButton);

      // Should not call fetch again if already liked
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Optimistic Updates', () => {
    it('immediately updates UI when thumbs up is clicked', async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {})); // Never resolves

      renderComponent();

      const likeButton = screen.getByLabelText('Like song');
      await user.click(likeButton);

      // Should show active state immediately (optimistic update)
      await waitFor(() => {
        expect(screen.getByLabelText('Unlike song')).toBeInTheDocument();
      });
    });

    it('shows loading spinner during mutation', async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {})); // Never resolves

      renderComponent();

      const likeButton = screen.getByLabelText('Like song');
      await user.click(likeButton);

      // Should show loading state
      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons[0]).toBeDisabled();
        expect(buttons[1]).toBeDisabled();
      });
    });
  });

  describe('Error Handling', () => {
    it('reverts optimistic update on API error', async () => {
      const user = userEvent.setup();
      const { toast } = await import('sonner');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      renderComponent({ currentFeedback: null });

      const likeButton = screen.getByLabelText('Like song');
      await user.click(likeButton);

      // Wait for error state
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to save feedback', {
          description: 'Please try again',
          duration: 3000,
        });
      });

      // Should revert to original state
      expect(screen.getByLabelText('Like song')).toBeInTheDocument();
    });

    it('handles duplicate feedback gracefully without showing toast', async () => {
      const user = userEvent.setup();
      const { toast } = await import('sonner');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ code: 'DUPLICATE_FEEDBACK' }),
      });

      renderComponent();

      const likeButton = screen.getByLabelText('Like song');
      await user.click(likeButton);

      // Wait for mutation to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Should NOT show any toast - the button state is enough feedback
      expect(toast.info).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for screen readers', () => {
      renderComponent();

      expect(screen.getByLabelText('Like song')).toBeInTheDocument();
      expect(screen.getByLabelText('Dislike song')).toBeInTheDocument();
    });

    it('has proper ARIA pressed state for active feedback', () => {
      renderComponent({ currentFeedback: 'thumbs_up' });

      const likeButton = screen.getByLabelText('Unlike song');
      expect(likeButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('has proper role group for button container', () => {
      renderComponent();

      const group = screen.getByRole('group', { name: 'Song feedback' });
      expect(group).toBeInTheDocument();
    });

    it('has minimum 44px touch target size', () => {
      renderComponent();

      const likeButton = screen.getByLabelText('Like song');
      const dislikeButton = screen.getByLabelText('Dislike song');

      expect(likeButton).toHaveClass('min-h-[44px]');
      expect(likeButton).toHaveClass('min-w-[44px]');
      expect(dislikeButton).toHaveClass('min-h-[44px]');
      expect(dislikeButton).toHaveClass('min-w-[44px]');
    });
  });

  describe('Toast Notifications', () => {
    it('shows success toast when like is successful', async () => {
      const user = userEvent.setup();
      const { toast } = await import('sonner');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, feedbackId: 'test-id' }),
      });

      renderComponent();

      const likeButton = screen.getByLabelText('Like song');
      await user.click(likeButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Liked "Test Song"', {
          description: 'Test Artist',
          duration: 2000,
        });
      });
    });

    it('shows success toast when dislike is successful', async () => {
      const user = userEvent.setup();
      const { toast } = await import('sonner');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, feedbackId: 'test-id' }),
      });

      renderComponent();

      const dislikeButton = screen.getByLabelText('Dislike song');
      await user.click(dislikeButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Disliked "Test Song"', {
          description: 'Test Artist',
          duration: 2000,
        });
      });
    });
  });
});
