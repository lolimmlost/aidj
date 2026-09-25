import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/config/config', () => ({
  getConfig: () => ({
    musicAssistantUrl: 'http://ma:8095/',
    musicAssistantToken: 'token',
    musicAssistantSubsonicProvider: 'opensubsonic--abc',
  }),
}));

import { songIdToUri, uriToSongId, toSpeaker, isMusicAssistantConfigured } from '../music-assistant';

describe('music-assistant track uris', () => {
  it('round-trips a Navidrome song id through the provider uri', () => {
    const uri = songIdToUri('qNEZpWqG7jzKaptOqzTSFg');
    expect(uri).toBe('opensubsonic--abc://track/qNEZpWqG7jzKaptOqzTSFg');
    expect(uriToSongId(uri)).toBe('qNEZpWqG7jzKaptOqzTSFg');
  });

  it('ignores tracks from other providers', () => {
    expect(uriToSongId('spotify://track/123')).toBeNull();
    expect(uriToSongId('opensubsonic--other://track/123')).toBeNull();
    expect(uriToSongId(null)).toBeNull();
  });

  it('is configured when url, token and provider are all set', () => {
    expect(isMusicAssistantConfigured()).toBe(true);
  });
});

describe('toSpeaker', () => {
  const base = { player_id: 'tv', display_name: 'Living Room TV', provider: 'chromecast' };

  it('flags a speaker another app is playing on', () => {
    const s = toSpeaker({
      ...base,
      playback_state: 'playing',
      active_source: 'youtube',
      source_list: [{ id: 'youtube', name: 'YouTube' }],
    });
    expect(s.busyWith).toBe('YouTube');
  });

  it('is not busy when idle or playing its own MA queue', () => {
    expect(toSpeaker({ ...base, playback_state: 'idle', active_source: 'youtube' }).busyWith).toBeNull();
    expect(toSpeaker({ ...base, playback_state: 'playing', active_source: 'tv' }).busyWith).toBeNull();
  });
});
