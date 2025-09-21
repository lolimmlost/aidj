import defaults from './defaults.json' with { type: 'json' };

interface ServiceConfig {
  ollamaUrl: string;
  navidromeUrl: string;
  lidarrUrl: string;
  lidarrApiKey: string;
  navidromeUsername: string;
  navidromePassword: string;
  lidarrQualityProfileId?: number;
  lidarrRootFolderPath?: string;
}

let currentConfig: ServiceConfig = { ...defaults, lidarrApiKey: '' };

if (typeof window !== 'undefined') {
  // Client side
  const stored = localStorage.getItem('serviceConfig');
  if (stored) {
    try {
      currentConfig = { ...currentConfig, ...JSON.parse(stored) };
    } catch (e) {
      // Ignore invalid stored config
      console.warn('Invalid config in localStorage:', e);
    }
  }
} else {
  // Server side - load sensitive config from process.env
  currentConfig = {
    ...defaults,
    lidarrApiKey: process.env.LIDARR_API_KEY || '',
    navidromeUsername: process.env.NAVIDROME_USERNAME || defaults.navidromeUsername,
    navidromePassword: process.env.NAVIDROME_PASSWORD || defaults.navidromePassword,
  };
}

export function getConfig(): ServiceConfig {
  return currentConfig;
}

export function setConfig(cfg: Partial<ServiceConfig>): void {
  currentConfig = { ...currentConfig, ...cfg };
  if (typeof window !== 'undefined') {
    localStorage.setItem('serviceConfig', JSON.stringify(currentConfig));
  }
  // For server, handle in API
}

export function resetConfig(): void {
  currentConfig = { ...defaults, lidarrApiKey: '' };
  if (typeof window !== 'undefined') {
    localStorage.removeItem('serviceConfig');
  }
}