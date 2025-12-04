/**
 * @vitest-environment jsdom
 * Story 7.1: Source Mode Selector Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourceModeSelector, SourceBadge } from '../source-mode-selector';

describe('SourceModeSelector', () => {
  it('renders all three mode buttons', () => {
    const onChange = vi.fn();
    render(
      <SourceModeSelector
        value="library"
        onChange={onChange}
      />
    );

    expect(screen.getByRole('button', { name: /library/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discovery/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mix/i })).toBeInTheDocument();
  });

  it('calls onChange when a mode button is clicked', () => {
    const onChange = vi.fn();
    render(
      <SourceModeSelector
        value="library"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /discovery/i }));
    expect(onChange).toHaveBeenCalledWith('discovery');
  });

  it('shows mix ratio slider when Mix mode is selected', () => {
    const onChange = vi.fn();
    const onMixRatioChange = vi.fn();
    render(
      <SourceModeSelector
        value="mix"
        onChange={onChange}
        mixRatio={70}
        onMixRatioChange={onMixRatioChange}
      />
    );

    // Should show the ratio display
    expect(screen.getByText(/70% \/ 30%/)).toBeInTheDocument();
    // Should show mix ratio description
    expect(screen.getByText(/Mostly familiar songs with some discoveries/)).toBeInTheDocument();
    // Slider should be present (check for slider role)
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('hides mix ratio slider when Library mode is selected', () => {
    const onChange = vi.fn();
    const onMixRatioChange = vi.fn();
    render(
      <SourceModeSelector
        value="library"
        onChange={onChange}
        mixRatio={70}
        onMixRatioChange={onMixRatioChange}
      />
    );

    // Should not show the ratio display
    expect(screen.queryByText(/70% \/ 30%/)).not.toBeInTheDocument();
  });

  it('shows correct description for each mode', () => {
    const { rerender } = render(
      <SourceModeSelector
        value="library"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/only include songs from your Navidrome library/i)).toBeInTheDocument();

    rerender(
      <SourceModeSelector
        value="discovery"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/discover new music/i)).toBeInTheDocument();

    rerender(
      <SourceModeSelector
        value="mix"
        onChange={vi.fn()}
        mixRatio={70}
        onMixRatioChange={vi.fn()}
      />
    );
    expect(screen.getByText(/70% songs from your library/i)).toBeInTheDocument();
  });

  it('disables buttons when disabled prop is true', () => {
    render(
      <SourceModeSelector
        value="library"
        onChange={vi.fn()}
        disabled
      />
    );

    expect(screen.getByRole('button', { name: /library/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /discovery/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /mix/i })).toBeDisabled();
  });
});

describe('SourceBadge', () => {
  it('renders "In Library" badge when inLibrary is true', () => {
    render(<SourceBadge inLibrary={true} />);
    expect(screen.getByText('In Library')).toBeInTheDocument();
  });

  it('renders "AI Discovery" badge when isDiscovery is true', () => {
    render(<SourceBadge inLibrary={false} isDiscovery={true} />);
    expect(screen.getByText('AI Discovery')).toBeInTheDocument();
  });

  it('renders "Last.fm" badge when discoverySource is lastfm', () => {
    render(<SourceBadge inLibrary={false} isDiscovery={true} discoverySource="lastfm" />);
    expect(screen.getByText('Last.fm')).toBeInTheDocument();
  });

  it('renders nothing when inLibrary is false and isDiscovery is false', () => {
    const { container } = render(<SourceBadge inLibrary={false} isDiscovery={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('applies correct styling for library badge', () => {
    render(<SourceBadge inLibrary={true} />);
    const badge = screen.getByText('In Library');
    expect(badge).toHaveClass('bg-green-100');
  });

  it('applies correct styling for AI discovery badge', () => {
    render(<SourceBadge inLibrary={false} isDiscovery={true} />);
    const badge = screen.getByText('AI Discovery');
    expect(badge).toHaveClass('bg-purple-100');
  });

  it('applies correct styling for Last.fm discovery badge', () => {
    render(<SourceBadge inLibrary={false} isDiscovery={true} discoverySource="lastfm" />);
    const badge = screen.getByText('Last.fm');
    expect(badge).toHaveClass('bg-red-100');
  });
});
