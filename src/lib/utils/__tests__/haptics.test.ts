import { afterEach, describe, expect, it, vi } from 'vitest';
import { haptic } from '../haptics';

describe('haptic', () => {
  const original = navigator.vibrate;
  afterEach(() => {
    Object.defineProperty(navigator, 'vibrate', { value: original, configurable: true, writable: true });
  });

  it('vibrates with the pattern for the requested kind', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
    haptic();
    haptic('success');
    expect(vibrate).toHaveBeenNthCalledWith(1, 10);
    expect(vibrate).toHaveBeenNthCalledWith(2, [10, 40, 15]);
  });

  it('no-ops when the Vibration API is missing', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true, writable: true });
    expect(() => haptic('medium')).not.toThrow();
  });

  it('swallows errors thrown by the browser', () => {
    Object.defineProperty(navigator, 'vibrate', {
      value: () => { throw new Error('blocked'); },
      configurable: true,
      writable: true,
    });
    expect(() => haptic()).not.toThrow();
  });
});
