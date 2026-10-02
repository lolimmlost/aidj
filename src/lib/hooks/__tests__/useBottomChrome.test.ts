import { describe, expect, it } from 'vitest';
import { measureBottomChrome } from '../useBottomChrome';

const el = (top: number, height: number) =>
  ({ getBoundingClientRect: () => ({ top, height }) }) as unknown as Element;

describe('measureBottomChrome', () => {
  it('is 0 with nothing visible', () => {
    expect(measureBottomChrome([], 800)).toBe(0);
    expect(measureBottomChrome([el(0, 0)], 800)).toBe(0); // display: none
  });

  it('measures from the highest visible chrome edge to the viewport bottom', () => {
    // tab bar 744–800, player 648–744 above it
    expect(measureBottomChrome([el(744, 56), el(648, 96)], 800)).toBe(152);
  });

  it('ignores a hidden player and uses the tab bar alone', () => {
    expect(measureBottomChrome([el(744, 56), el(0, 0)], 800)).toBe(56);
  });
});
