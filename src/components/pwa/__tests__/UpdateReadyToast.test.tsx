import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ custom: vi.fn(), dismiss: vi.fn() }));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

const audio = vi.hoisted(() => ({ isPlaying: false }));
vi.mock('@/lib/stores/audio', () => ({
  useAudioStore: (sel: (s: { isPlaying: boolean }) => unknown) => sel(audio),
}));

import { UpdateReadyCard, showUpdateReadyToast, UPDATE_TOAST_ID } from '../UpdateReadyToast';

describe('UpdateReadyCard', () => {
  beforeEach(() => {
    audio.isPlaying = false;
    vi.clearAllMocks();
  });

  it('calls onReload / onLater from its buttons', () => {
    const onReload = vi.fn();
    const onLater = vi.fn();
    render(<UpdateReadyCard onReload={onReload} onLater={onLater} />);
    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    fireEvent.click(screen.getByRole('button', { name: /later/i }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it('warns that reloading pauses music while playing', () => {
    audio.isPlaying = true;
    render(<UpdateReadyCard onReload={vi.fn()} onLater={vi.fn()} />);
    expect(screen.getByText(/pauses your music/i)).toBeTruthy();
  });

  it('shows a persistent, de-duplicated custom toast', () => {
    const onReload = vi.fn();
    showUpdateReadyToast(onReload);
    const [renderFn, opts] = toastMock.custom.mock.calls[0];
    expect(opts).toMatchObject({ id: UPDATE_TOAST_ID, duration: Infinity });

    render(renderFn('t1'));
    fireEvent.click(screen.getByRole('button', { name: /later/i }));
    expect(toastMock.dismiss).toHaveBeenCalledWith('t1');
    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
