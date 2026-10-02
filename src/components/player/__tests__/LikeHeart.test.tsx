import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LikeHeart } from '../LikeHeart';

const root = (c: HTMLElement) => c.querySelector('.like-heart') as HTMLElement;

describe('LikeHeart', () => {
  it('renders a static outline with no effect when not liked', () => {
    const { container } = render(<LikeHeart liked={false} />);
    expect(root(container).dataset.effect).toBeUndefined();
    expect(container.querySelector('.like-heart-fill')).toBeNull();
    expect(container.querySelectorAll('.like-heart-dot')).toHaveLength(0);
  });

  it('shows the fill without animating when liked by state alone', () => {
    const { container } = render(<LikeHeart liked />);
    expect(container.querySelector('.like-heart-fill')).not.toBeNull();
    expect(root(container).dataset.effect).toBeUndefined();
    expect(container.querySelector('.like-heart-ring')).toBeNull();
  });

  it('plays fill, ring and dot burst on a like effect', () => {
    const { container } = render(<LikeHeart liked effect={{ kind: 'like', key: 1 }} burst={20} />);
    expect(root(container).dataset.effect).toBe('like');
    expect(root(container).style.getPropertyValue('--like-burst')).toBe('20px');
    expect(container.querySelector('.like-heart-ring')).not.toBeNull();
    expect(container.querySelectorAll('.like-heart-dot').length).toBeGreaterThan(4);
  });

  it('deflates quietly on unlike (no burst)', () => {
    const { container } = render(<LikeHeart liked={false} effect={{ kind: 'unlike', key: 2 }} />);
    expect(root(container).dataset.effect).toBe('unlike');
    expect(container.querySelector('.like-heart-ring')).toBeNull();
    expect(container.querySelectorAll('.like-heart-dot')).toHaveLength(0);
  });

  it('replays the animation when the effect key changes', () => {
    const { container, rerender } = render(<LikeHeart liked effect={{ kind: 'like', key: 1 }} />);
    const first = root(container);
    rerender(<LikeHeart liked effect={{ kind: 'like', key: 2 }} />);
    expect(root(container)).not.toBe(first);
  });
});
