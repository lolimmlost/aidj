import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TrackPicker } from '../LabAB';
import type { TrackAnalysis } from '@/lib/dj-lab/analysis';

const song = (id: string, title: string, artist: string) => ({ song: { id, title, artist, duration: 200 }, analysis: { bpm: 126 } as TrackAnalysis });
const songs = [song('a', 'Got The Floor', 'WELKER'), song('b', 'Moon (Think of You)', 'Wuki'), song('c', '1,2,3', 'James Hype')];

describe('TrackPicker', () => {
  it('opens a filterable list under the field and picks from it', () => {
    const onPick = vi.fn();
    render(<TrackPicker label="A (out)" songs={songs} onPick={onPick} />);
    expect(screen.queryByRole('list')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /pick a track/i }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('Filter A (out)'), { target: { value: 'wuki' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Moon \(Think of You\)/ }));
    expect(onPick).toHaveBeenCalledWith('b');
    // closes after a pick
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows the picked song in the field', () => {
    render(<TrackPicker label="B (in)" songs={songs} value={songs[2].song} onPick={() => {}} />);
    expect(screen.getByRole('button', { name: /1,2,3 · James Hype/ })).toBeTruthy();
  });
});
