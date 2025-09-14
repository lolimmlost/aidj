import defaults from './defaults.json' with { type: 'json' };

interface ServiceConfig {
  ollamaUrl: string;
  navidromeUrl: string;
  lidarrUrl: string;
  navidromeUsername: string;
  navidromePassword: string;
}

let currentConfig: ServiceConfig = { ...defaults };

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
  // Server side - use fs if needed, but for now, use defaults
  // Note: For server, you may need to implement fs logic in API routes
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
  currentConfig = { ...defaults };
  if (typeof window !== 'undefined') {
    localStorage.removeItem('serviceConfig');
  }
}