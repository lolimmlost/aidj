import defaults from './defaults.json' with { type: 'json' };

export type LLMProviderType = 'ollama' | 'openrouter' | 'glm' | 'anthropic';

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

  // Anthropic Configuration (cloud - supports z.ai proxy)
  anthropicApiKey: string;
  anthropicModel: string;
  anthropicBaseUrl: string;

  // Other Services
  navidromeUrl: string;
  lidarrUrl: string;
  lidarrApiKey: string;
  navidromeUsername: string;
  navidromePassword: string;
  lidarrQualityProfileId?: number;
  lidarrRootFolderPath?: string;
}

let currentConfig: ServiceConfig = { ...defaults, lidarrApiKey: '', openrouterApiKey: '', glmApiKey: '', anthropicApiKey: '', anthropicBaseUrl: 'https://api.anthropic.com/v1' };

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
  // Server side - load from db/config.json first, then override with env vars
  let fileConfig: Partial<ServiceConfig> = {};
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.resolve(process.cwd(), 'db', 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      fileConfig = JSON.parse(raw);
    }
  } catch {
    // Ignore file read errors
  }

  currentConfig = {
    ...defaults,
    ...fileConfig, // Load from db/config.json
    // Override with environment variables if set
    llmProvider: (process.env.LLM_PROVIDER as LLMProviderType) || fileConfig.llmProvider || defaults.llmProvider,
    ollamaModel: process.env.OLLAMA_MODEL || fileConfig.ollamaModel || defaults.ollamaModel,
    openrouterApiKey: process.env.OPENROUTER_API_KEY || fileConfig.openrouterApiKey || '',
    openrouterModel: process.env.OPENROUTER_MODEL || fileConfig.openrouterModel || defaults.openrouterModel,
    glmApiKey: process.env.GLM_API_KEY || fileConfig.glmApiKey || '',
    glmModel: process.env.GLM_MODEL || fileConfig.glmModel || defaults.glmModel,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || fileConfig.anthropicApiKey || '',
    anthropicModel: process.env.ANTHROPIC_MODEL || fileConfig.anthropicModel || defaults.anthropicModel || 'claude-sonnet-4-5-20250514',
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || fileConfig.anthropicBaseUrl || defaults.anthropicBaseUrl || 'https://api.anthropic.com/v1',
    lidarrApiKey: process.env.LIDARR_API_KEY || fileConfig.lidarrApiKey || '',
    navidromeUsername: process.env.NAVIDROME_USERNAME || fileConfig.navidromeUsername || defaults.navidromeUsername,
    navidromePassword: process.env.NAVIDROME_PASSWORD || fileConfig.navidromePassword || defaults.navidromePassword,
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
  currentConfig = { ...defaults, lidarrApiKey: '', openrouterApiKey: '', glmApiKey: '', anthropicApiKey: '', anthropicBaseUrl: 'https://api.anthropic.com/v1' };
  if (typeof window !== 'undefined') {
    localStorage.removeItem('serviceConfig');
  }
}

// Export type for use in other modules
export type { ServiceConfig };