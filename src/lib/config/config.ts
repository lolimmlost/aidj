import defaults from './defaults.json' with { type: 'json' };

export type LLMProviderType = 'ollama' | 'openrouter' | 'glm';

interface ServiceConfig {
  // LLM Provider Configuration
  llmProvider: LLMProviderType;

  // Ollama Configuration (local)
  ollamaUrl: string;
  ollamaModel: string;

  // OpenRouter Configuration (cloud)
  openrouterApiKey: string;
  openrouterModel: string;

  // GLM Configuration (cloud)
  glmApiKey: string;
  glmModel: string;

  // Other Services
  navidromeUrl: string;
  lidarrUrl: string;
  lidarrApiKey: string;
  navidromeUsername: string;
  navidromePassword: string;
  lidarrQualityProfileId?: number;
  lidarrRootFolderPath?: string;
}

let currentConfig: ServiceConfig = { ...defaults, lidarrApiKey: '', openrouterApiKey: '', glmApiKey: '' };

if (typeof window !== 'undefined') {
  // Client side - load from localStorage
  // Note: API keys stored client-side are user's responsibility for security
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
    // LLM Provider selection
    llmProvider: (process.env.LLM_PROVIDER as LLMProviderType) || defaults.llmProvider,

    // Ollama config
    ollamaModel: process.env.OLLAMA_MODEL || defaults.ollamaModel,

    // OpenRouter config (server-side API key from env)
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openrouterModel: process.env.OPENROUTER_MODEL || defaults.openrouterModel,

    // GLM config (server-side API key from env)
    glmApiKey: process.env.GLM_API_KEY || '',
    glmModel: process.env.GLM_MODEL || defaults.glmModel,

    // Other services
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
  currentConfig = { ...defaults, lidarrApiKey: '', openrouterApiKey: '', glmApiKey: '' };
  if (typeof window !== 'undefined') {
    localStorage.removeItem('serviceConfig');
  }
}

// Export type for use in other modules
export type { ServiceConfig };