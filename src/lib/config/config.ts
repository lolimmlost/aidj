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

  // Last.fm Configuration (Story 7.2)
  lastfmApiKey: string;
}

let currentConfig: ServiceConfig = { ...defaults, lidarrApiKey: '', openrouterApiKey: '', glmApiKey: '', anthropicApiKey: '', anthropicBaseUrl: 'https://api.anthropic.com/v1', lastfmApiKey: '' };

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
    lastfmApiKey: process.env.LASTFM_API_KEY || fileConfig.lastfmApiKey || '',
  };
}

// Cache for server-side config loaded asynchronously
let serverConfigLoaded = false;

// Server-side async config loader
async function loadServerConfigAsync(): Promise<void> {
  if (typeof window !== 'undefined' || serverConfigLoaded) {
    return;
  }

  try {
    const fs = await import('fs');
    const path = await import('path');
    const configPath = path.resolve(process.cwd(), 'db', 'config.json');

    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const fileConfig = JSON.parse(raw) as Partial<ServiceConfig>;
      console.log('[Config] Loaded lastfmApiKey length:', fileConfig.lastfmApiKey?.length || 0);

      currentConfig = {
        ...defaults,
        ...fileConfig,
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
        lastfmApiKey: process.env.LASTFM_API_KEY || fileConfig.lastfmApiKey || '',
      };
      serverConfigLoaded = true;
    }
  } catch (err) {
    console.error('[Config] Error loading config:', err);
  }
}

// Eagerly load config on server startup
if (typeof window === 'undefined') {
  loadServerConfigAsync();
}

export function getConfig(): ServiceConfig {
  return currentConfig;
}

// Async version for ensuring config is loaded before use
export async function getConfigAsync(): Promise<ServiceConfig> {
  if (typeof window === 'undefined' && !serverConfigLoaded) {
    await loadServerConfigAsync();
  }
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
  currentConfig = { ...defaults, lidarrApiKey: '', openrouterApiKey: '', glmApiKey: '', anthropicApiKey: '', anthropicBaseUrl: 'https://api.anthropic.com/v1', lastfmApiKey: '' };
  if (typeof window !== 'undefined') {
    localStorage.removeItem('serviceConfig');
  }
}

// Export type for use in other modules
export type { ServiceConfig };