import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

vi.mock('@/components/ui/album-art', () => ({ getCoverArtUrl: () => null }));

import { ArtMode } from '../ArtMode';

const song = { id: 's1', name: 'Song', artist: 'Band' };

function tap(el: Element, x = 100) {
  fireEvent.touchStart(el, { touches: [{ clientX: x }] });
  fireEvent.touchEnd(el);
}

describe('ArtMode double-tap', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const onDoubleTap = vi.fn();
    const onNext = vi.fn();
    const { container } = render(
      <ArtMode song={song} onPrevious={vi.fn()} onNext={onNext} onDoubleTap={onDoubleTap} />,
    );
    return { art: container.firstElementChild as Element, container, onDoubleTap, onNext };
  };

  it('fires on two quick taps and shows the big heart', () => {
    const { art, container, onDoubleTap } = setup();
    tap(art);
    vi.advanceTimersByTime(120);
    tap(art);
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.animate-like-big')).not.toBeNull();
  });

  it('does not fire for taps too far apart', () => {
    const { art, onDoubleTap } = setup();
    tap(art);
    vi.advanceTimersByTime(500);
    tap(art);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('a swipe is not a tap', () => {
    const { art, onDoubleTap, onNext } = setup();
    tap(art);
    vi.advanceTimersByTime(100);
    fireEvent.touchStart(art, { touches: [{ clientX: 200 }] });
    fireEvent.touchMove(art, { touches: [{ clientX: 60 }] });
    fireEvent.touchEnd(art);
    expect(onDoubleTap).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('ignores the synthetic dblclick right after a touch double-tap', () => {
    const { art, onDoubleTap } = setup();
    tap(art);
    vi.advanceTimersByTime(100);
    tap(art);
    fireEvent.doubleClick(art);
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
  });

  it('desktop double-click fires', () => {
    const { art, onDoubleTap } = setup();
    fireEvent.doubleClick(art);
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
  });
});
