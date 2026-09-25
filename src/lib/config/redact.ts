/**
 * Service-config fields that are credentials. They never leave the server:
 * `/api/config` used to return the raw config to anyone — no session check —
 * which put the Navidrome admin password, Lidarr API key, etc. on the public
 * internet. Responses blank these fields and report only whether each one is
 * set; POST treats a blank secret as "unchanged" so the settings form's
 * round-trip can't wipe a stored value.
 */
export const SECRET_KEYS = [
  'navidromePassword',
  'lidarrApiKey',
  'openrouterApiKey',
  'glmApiKey',
  'anthropicApiKey',
  'lastfmApiKey',
  'spotifyClientSecret',
  'youtubeApiKey',
  'youtubeClientSecret',
  'aurralPassword',
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

export function redactConfig<T extends object>(cfg: T): {
  config: T;
  secretsSet: Record<SecretKey, boolean>;
} {
  const config = { ...cfg };
  const secretsSet = {} as Record<SecretKey, boolean>;
  for (const key of SECRET_KEYS) {
    secretsSet[key] = Boolean((cfg as Record<string, unknown>)[key]);
    if (key in config) (config as Record<string, unknown>)[key] = '';
  }
  return { config, secretsSet };
}
