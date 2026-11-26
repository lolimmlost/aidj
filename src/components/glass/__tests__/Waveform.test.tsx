import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Waveform, waveformShape } from '../Waveform';

describe('waveformShape', () => {
  it('is stable per song and different across songs', () => {
    expect(waveformShape('song-a')).toEqual(waveformShape('song-a'));
    expect(waveformShape('song-a')).not.toEqual(waveformShape('song-b'));
  });

  it('gives 48 bars between 0.12 and 1', () => {
    const bars = waveformShape('5ylFkLUg6RgRvL9oO2wpqn');
    expect(bars).toHaveLength(48);
    for (const h of bars) {
      expect(h).toBeGreaterThanOrEqual(0.12);
      expect(h).toBeLessThanOrEqual(1);
    }
  });
});

describe('Waveform', () => {
  it('fills bars up to the played fraction', () => {
    const { container } = render(<Waveform seed="x" current={30} duration={120} playedClassName="played" unplayedClassName="unplayed" />);
    const played = container.querySelectorAll('.played').length;
    expect(played).toBeGreaterThanOrEqual(12);
    expect(played).toBeLessThanOrEqual(13);
  });

  it('seeks through the range input', () => {
    let sought = -1;
    render(<Waveform seed="x" current={0} duration={175} onSeek={(s) => { sought = s; }} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '90' } });
    expect(sought).toBe(90);
  });

  it('is disabled when there is no duration yet', () => {
    render(<Waveform seed="x" current={0} duration={NaN} />);
    expect((screen.getByRole('slider', { name: 'Seek' }) as HTMLInputElement).disabled).toBe(true);
  });
});
