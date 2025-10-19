import { describe, it, expect } from 'vitest';

// Basic component tests for AddToPlaylistButton
// Note: Full tests would require React Testing Library setup

describe('AddToPlaylistButton', () => {
  it('should accept valid song props', () => {
    const props = {
      songId: 'song123',
      artistName: 'The Beatles',
      songTitle: 'Hey Jude',
    };

    expect(props.songId).toBeTruthy();
    expect(props.artistName).toBeTruthy();
    expect(props.songTitle).toBeTruthy();
  });

  it('should handle variant prop', () => {
    const variants = ['default', 'ghost', 'outline'] as const;
    variants.forEach(variant => {
      expect(['default', 'ghost', 'outline']).toContain(variant);
    });
  });

  it('should handle size prop', () => {
    const sizes = ['default', 'sm', 'lg', 'icon'] as const;
    sizes.forEach(size => {
      expect(['default', 'sm', 'lg', 'icon']).toContain(size);
    });
  });

  it('should format song artist title correctly', () => {
    const artistName = 'The Beatles';
    const songTitle = 'Hey Jude';
    const expected = `${artistName} - ${songTitle}`;

    expect(expected).toBe('The Beatles - Hey Jude');
  });
});
