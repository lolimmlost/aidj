import { describe, it, expect } from 'vitest';
import { planFeed } from '../useSpeakerSync';

describe('planFeed', () => {
  const desired = ['b', 'c', 'd', 'e', 'f'];

  it('does nothing while the speaker is in step and has enough queued', () => {
    expect(planFeed(desired, ['b', 'c', 'd'], 120)).toBeNull();
  });

  it('appends the missing tail once the speaker runs low', () => {
    expect(planFeed(desired, ['b'], 120)).toEqual({ songIds: ['c', 'd', 'e', 'f'], mode: 'add' });
  });

  it('fills an empty speaker queue', () => {
    expect(planFeed(desired, [], 120)).toEqual({ songIds: desired, mode: 'add' });
  });

  it('replaces the upcoming tracks when AIDJ\'s queue changed', () => {
    expect(planFeed(['x', 'b', 'c'], ['b', 'c', 'd'], 120)).toEqual({
      songIds: ['x', 'b', 'c'],
      mode: 'replace_next',
    });
  });

  it('holds off replacing near the end of the current track', () => {
    expect(planFeed(['x', 'b'], ['b', 'c'], 10)).toBeNull();
  });

  it('treats a longer speaker queue than AIDJ wants as in step', () => {
    expect(planFeed(['b', 'c'], ['b', 'c', 'd', 'e'], 120)).toBeNull();
  });

  it('never sends an empty replacement when AIDJ has nothing next', () => {
    expect(planFeed([], ['b', 'c'], 120)).toBeNull();
  });
});
