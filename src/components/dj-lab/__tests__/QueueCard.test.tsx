import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueueCard } from '../QueueCard';
import type { EngineSnapshot, LabEngine } from '@/lib/dj-lab/engine';
import type { LabVote } from '@/lib/dj-lab/votes';
import { track } from '@/lib/dj-lab/__tests__/fixtures';

const BASE = track([[16, -20], [16, -30], [32, -8], [16, -30], [32, -8], [16, -20]]);
const at = (bpm: number) => ({ ...BASE, bpm, barLen: 240 / bpm });
const song = (id: string) => ({ id, title: `Song ${id}`, artist: `Artist ${id}`, duration: 200 });
const flag = (a: string, b: string): LabVote => ({ id: `${a}${b}`, at: '2026-11-01T00:00:00Z', kind: 'flag', a: song(a), b: song(b), setBpm: 126, thumb: 'up', tags: [], note: '' });

const pool = ['a', 'b', 'c', 'd'].map((id) => ({ song: song(id), analysis: at(126) }));
const snap = (queue: string[]) =>
  ({
    status: 'playing',
    setBpm: 126,
    mode: 'dropchain',
    autoLock: true,
    history: [{ song: song('a'), at: 0 }],
    now: { song: song('a'), analysis: at(126), rate: 1, floorBar: 0 },
    choices: {},
    pinned: [],
    defaults: { openerPlaysOut: false, preferFirstDrop: false, tempoDown: 4, tempoUp: 4, phoneMono: false },
    queue: queue.map(song),
  }) as unknown as EngineSnapshot;
const fakeEngine = () => ({ enqueue: vi.fn(), dequeue: vi.fn(), moveQueued: vi.fn(), playNext: vi.fn() }) as unknown as LabEngine & Record<string, ReturnType<typeof vi.fn>>;

describe('QueueCard', () => {
  it('lists the queue with each transition and wires its buttons', () => {
    const engine = fakeEngine();
    render(<QueueCard engine={engine} snap={snap(['b', 'c'])} pool={pool} starred={new Set()} votes={[]} />);
    expect(screen.getByText(/2 after the locked song/)).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByText(/Artist b · (chain|swap|playout|cut|intro), \d+ bars/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Play Song c next' }));
    expect(engine.playNext).toHaveBeenCalledWith('c');
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);
    expect(engine.moveQueued).toHaveBeenCalledWith('b', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Song b from the queue' }));
    expect(engine.dequeue).toHaveBeenCalledWith('b');
  });

  it('offers your liked run from the end of the queue', () => {
    const engine = fakeEngine();
    render(<QueueCard engine={engine} snap={snap(['b'])} pool={pool} starred={new Set()} votes={[flag('b', 'c'), flag('c', 'd')]} />);
    fireEvent.click(screen.getByRole('button', { name: /Liked run · 2/ }));
    expect((engine.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0].map((s: { id: string }) => s.id)).toEqual(['c', 'd']);
  });
});
