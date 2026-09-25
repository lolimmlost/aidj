import { describe, it, expect } from 'vitest';
import { SECRET_KEYS, redactConfig } from '../redact';

describe('redactConfig', () => {
  const cfg = {
    navidromeUrl: 'http://navidrome:4533',
    navidromeUsername: 'admin',
    navidromePassword: 'hunter2',
    lidarrApiKey: 'lidarr-key',
    lastfmApiKey: '',
    ollamaUrl: 'http://ollama:11434',
  };

  it('blanks every secret field and keeps everything else', () => {
    const { config } = redactConfig(cfg);
    expect(config.navidromePassword).toBe('');
    expect(config.lidarrApiKey).toBe('');
    expect(config.navidromeUrl).toBe('http://navidrome:4533');
    expect(config.navidromeUsername).toBe('admin');
    expect(config.ollamaUrl).toBe('http://ollama:11434');
  });

  it('reports which secrets are set without revealing them', () => {
    const { secretsSet } = redactConfig(cfg);
    expect(secretsSet.navidromePassword).toBe(true);
    expect(secretsSet.lidarrApiKey).toBe(true);
    expect(secretsSet.lastfmApiKey).toBe(false);
    expect(secretsSet.anthropicApiKey).toBe(false);
  });

  it('does not mutate the input', () => {
    redactConfig(cfg);
    expect(cfg.navidromePassword).toBe('hunter2');
  });

  it('leaves no secret value anywhere in the serialized response', () => {
    const full = Object.fromEntries(SECRET_KEYS.map((k) => [k, `secret-${k}`]));
    const serialized = JSON.stringify(redactConfig({ ...full, navidromeUrl: 'x' }));
    for (const k of SECRET_KEYS) expect(serialized).not.toContain(`secret-${k}`);
  });
});
