/**
 * Story 7.1: Source Mode Prompt Builder Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies
vi.mock('../../library-index', () => ({
  getSongSampleForAI: vi.fn().mockResolvedValue([
    'Artist A - Song One',
    'Artist B - Song Two',
    'Artist C - Song Three',
  ]),
  getIndexedArtists: vi.fn().mockResolvedValue(['Artist A', 'Artist B', 'Artist C']),
}));

vi.mock('../../preferences', () => ({
  buildUserPreferenceProfile: vi.fn().mockResolvedValue({
    likedArtists: [],
    dislikedArtists: [],
    totalFeedbackCount: 0,
    thumbsUpCount: 0,
    thumbsDownCount: 0,
  }),
  getListeningPatterns: vi.fn().mockResolvedValue({
    hasEnoughData: false,
    insights: [],
  }),
}));

vi.mock('../../library-profile', () => ({
  getOrCreateLibraryProfile: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../seasonal-patterns', () => ({
  getCurrentSeasonalPattern: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../db/schema', () => ({
  userPreferences: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

import { buildPlaylistPrompt } from '../prompt-builder';

describe('buildPlaylistPrompt with sourceMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes LIBRARY ONLY instructions when sourceMode is library', async () => {
    const prompt = await buildPlaylistPrompt({
      style: 'rock',
      sourceMode: 'library',
    });

    expect(prompt).toContain('SOURCE MODE: LIBRARY ONLY');
    expect(prompt).toContain('ONLY suggest songs from the user\'s library');
    expect(prompt).toContain('Do NOT suggest any songs that are not in this list');
  });

  it('includes DISCOVERY instructions when sourceMode is discovery', async () => {
    const prompt = await buildPlaylistPrompt({
      style: 'chill',
      sourceMode: 'discovery',
    });

    expect(prompt).toContain('SOURCE MODE: DISCOVERY');
    expect(prompt).toContain('Suggest songs the user likely doesn\'t have');
    expect(prompt).toContain('Do NOT include songs from their existing library');
  });

  it('includes MIX instructions with ratio when sourceMode is mix', async () => {
    const prompt = await buildPlaylistPrompt({
      style: 'party',
      sourceMode: 'mix',
      mixRatio: 70,
    });

    expect(prompt).toContain('SOURCE MODE: MIX');
    expect(prompt).toContain('70% library / 30% discovery');
    // 70% of 5 songs = 3.5 rounded = 4 library songs
    expect(prompt).toContain('4 songs FROM the library');
    expect(prompt).toContain('1 NEW songs');
  });

  it('uses 50/50 mix ratio when specified', async () => {
    const prompt = await buildPlaylistPrompt({
      style: 'electronic',
      sourceMode: 'mix',
      mixRatio: 50,
    });

    expect(prompt).toContain('50% library / 50% discovery');
    // 50% of 5 songs = 2.5 rounded = 3 library songs
    expect(prompt).toContain('3 songs FROM the library');
    expect(prompt).toContain('2 NEW songs');
  });

  it('defaults to library mode when sourceMode not specified', async () => {
    const prompt = await buildPlaylistPrompt({
      style: 'jazz',
    });

    expect(prompt).toContain('SOURCE MODE: LIBRARY ONLY');
  });

  it('defaults to 70% mixRatio when not specified in mix mode', async () => {
    const prompt = await buildPlaylistPrompt({
      style: 'ambient',
      sourceMode: 'mix',
    });

    expect(prompt).toContain('70% library / 30% discovery');
  });

  it('includes isDiscovery field in output format for discovery mode', async () => {
    const prompt = await buildPlaylistPrompt({
      style: 'indie',
      sourceMode: 'discovery',
    });

    expect(prompt).toContain('"isDiscovery": true/false');
  });

  it('includes isDiscovery field in output format for mix mode', async () => {
    const prompt = await buildPlaylistPrompt({
      style: 'pop',
      sourceMode: 'mix',
      mixRatio: 60,
    });

    expect(prompt).toContain('"isDiscovery": true/false');
  });

  it('does NOT include isDiscovery field for library-only mode', async () => {
    const prompt = await buildPlaylistPrompt({
      style: 'classical',
      sourceMode: 'library',
    });

    expect(prompt).not.toContain('"isDiscovery"');
  });

  it('includes style in the prompt', async () => {
    const prompt = await buildPlaylistPrompt({
      style: 'Halloween Party',
      sourceMode: 'library',
    });

    expect(prompt).toContain('style "Halloween Party"');
  });

  it('includes excluded artists when provided', async () => {
    const prompt = await buildPlaylistPrompt({
      style: 'rock',
      sourceMode: 'library',
      excludeArtists: ['Bad Artist', 'Another Bad Artist'],
    });

    expect(prompt).toContain('FORBIDDEN ARTISTS');
    expect(prompt).toContain('Bad Artist');
    expect(prompt).toContain('Another Bad Artist');
  });
});
