import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';

export type ServiceConfig = {
  ollamaUrl?: string;
  navidromeUrl?: string;
  lidarrUrl?: string;
};

const CONFIG_PATH = path.resolve(__dirname, 'defaults.json');

let currentConfig: ServiceConfig = {};

function loadFromFile(): ServiceConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? (parsed as ServiceConfig) : {};
    }
  } catch {
    // ignore parse errors
  }
  return {};
}

// Initialize from file on module load
currentConfig = loadFromFile();

export function getConfig(): ServiceConfig {
  return currentConfig;
}

export function setConfig(cfg: Partial<ServiceConfig> | ServiceConfig): void {
  currentConfig = { ...currentConfig, ...cfg };
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(currentConfig, null, 2));
  } catch {
    // ignore write errors for now
  }
}

export function resetConfig(): void {
  currentConfig = {};
  try {
    if (existsSync(CONFIG_PATH)) {
      unlinkSync(CONFIG_PATH);
    }
  } catch {
    // ignore
  }
}