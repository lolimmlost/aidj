import { describe, expect, it, vi } from 'vitest';

const sonnerToast = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
);
vi.mock('sonner', () => ({ toast: sonnerToast }));

import { toast, UNDO_DURATION_MS } from '../toast';

describe('toast.undo', () => {
  it('shows an Undo action that calls back, with the undo duration', () => {
    const onUndo = vi.fn();
    toast.undo('Removed from queue', onUndo, { description: 'Song' });

    expect(sonnerToast).toHaveBeenCalledTimes(1);
    const [message, data] = sonnerToast.mock.calls[0];
    expect(message).toBe('Removed from queue');
    expect(data).toMatchObject({ duration: UNDO_DURATION_MS, description: 'Song' });
    expect(data.action.label).toBe('Undo');

    data.action.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('keeps per-type defaults on the other variants', () => {
    toast.success('ok');
    expect(sonnerToast.success).toHaveBeenCalledWith('ok', { duration: 3_000 });
  });
});
