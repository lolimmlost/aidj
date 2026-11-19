import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResumeBanner } from '../ResumeBanner';
import type { ResumePoint } from '@/lib/dj-lab/resume';

const point = (reason: ResumePoint['reason']): ResumePoint => ({
  sid: 'n2t1sn',
  t: 0,
  status: 'paused',
  reason,
  savedAt: 0,
  song: 'Grupo Cañaveral de Humberto Pabón – Tiene espinas el rosal',
  pos: 134,
});

describe('ResumeBanner (#439)', () => {
  it('offers to resume a set whose page died, at the song and time it was on', async () => {
    const onResume = vi.fn();
    const onDismiss = vi.fn();
    render(<ResumeBanner point={point('died')} busy={false} onResume={onResume} onDismiss={onDismiss} />);
    expect(screen.getByText('Your set stopped when the page reloaded')).toBeTruthy();
    expect(screen.getByText(/Tiene espinas el rosal · Grupo Cañaveral de Humberto Pabón · at 2:14/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /resume set/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('says a set still open in another window can be moved here', () => {
    render(<ResumeBanner point={point('other-window')} busy={false} onResume={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText('Your set is still open in another window')).toBeTruthy();
    expect(screen.getByRole('button', { name: /move it here/i })).toBeTruthy();
  });

  it('holds the buttons while a resume loads', () => {
    render(<ResumeBanner point={point('died')} busy onResume={() => {}} onDismiss={() => {}} />);
    expect((screen.getByRole('button', { name: /resume set/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /dismiss/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
