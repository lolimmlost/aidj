import { createFileRoute } from "@tanstack/react-router";
import { getConfig, setConfig } from "~/lib/config/config";
import {
  withErrorHandling,
  jsonResponse,
} from '../../lib/utils/api-response';

const GET = withErrorHandling(
  async () => {
    const cfg = getConfig();
    return jsonResponse({ ok: true, config: cfg });
  },
  {
    service: 'config',
    operation: 'get',
    defaultCode: 'CONFIG_FETCH_ERROR',
    defaultMessage: 'Failed to fetch configuration',
  }
);

const POST = withErrorHandling(
  async ({ request }: { request: Request }) => {
    const body = await request.json();

    // In-band test
    if (body?.test === true) {
      const cfg = getConfig();
      const statuses: Record<string, string> = {};

      const test = async (label: string, url?: string) => {
        if (!url) {
          statuses[label] = "not configured";
          return;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        try {
          const res = await fetch(url, { method: "GET", signal: controller.signal });
          clearTimeout(timeout);
          statuses[label] = res.ok ? "connected" : `http ${res.status}`;
        } catch {
          statuses[label] = "unreachable";
        }
      };

      // Test LLM Provider
      const testLLMProvider = async () => {
        const provider = cfg.llmProvider || 'ollama';
        if (provider === 'ollama') {
          statuses.llmProvider = cfg.ollamaUrl ? "configured (Ollama)" : "not configured";
        } else if (provider === 'openrouter') {
          statuses.llmProvider = cfg.openrouterApiKey ? "configured (OpenRouter)" : "not configured";
        } else if (provider === 'glm') {
          statuses.llmProvider = cfg.glmApiKey ? "configured (GLM)" : "not configured";
        } else if (provider === 'anthropic') {
          statuses.llmProvider = cfg.anthropicApiKey ? "configured (Anthropic)" : "not configured";
        } else {
          statuses.llmProvider = "not configured";
        }
      };

      await Promise.all([
        testLLMProvider(),
        test("ollamaUrl", cfg.ollamaUrl),
        test("navidromeUrl", cfg.navidromeUrl),
        test("lidarrUrl", cfg.lidarrUrl),
        test("metubeUrl", cfg.metubeUrl),
      ]);

      return jsonResponse({ ok: true, statuses });
    }

    // Accept a subset of keys for configuration
    const allowed: Record<string, string> = {};

    // LLM Provider configuration
    if (typeof body.llmProvider === "string") allowed.llmProvider = body.llmProvider;
    if (typeof body.ollamaUrl === "string") allowed.ollamaUrl = body.ollamaUrl;
    if (typeof body.ollamaModel === "string") allowed.ollamaModel = body.ollamaModel;
    if (typeof body.openrouterApiKey === "string") allowed.openrouterApiKey = body.openrouterApiKey;
    if (typeof body.openrouterModel === "string") allowed.openrouterModel = body.openrouterModel;
    if (typeof body.glmApiKey === "string") allowed.glmApiKey = body.glmApiKey;
    if (typeof body.glmModel === "string") allowed.glmModel = body.glmModel;
    if (typeof body.anthropicApiKey === "string") allowed.anthropicApiKey = body.anthropicApiKey;
    if (typeof body.anthropicModel === "string") allowed.anthropicModel = body.anthropicModel;
    if (typeof body.anthropicBaseUrl === "string") allowed.anthropicBaseUrl = body.anthropicBaseUrl;

    // Music services
    if (typeof body.navidromeUrl === "string") allowed.navidromeUrl = body.navidromeUrl;
    if (typeof body.lidarrUrl === "string") allowed.lidarrUrl = body.lidarrUrl;
    if (typeof body.metubeUrl === "string") allowed.metubeUrl = body.metubeUrl;
    if (typeof body.navidromeUsername === "string") allowed.navidromeUsername = body.navidromeUsername;
    if (typeof body.navidromePassword === "string") allowed.navidromePassword = body.navidromePassword;

    // Discovery services (Story 7.2)
    if (typeof body.lastfmApiKey === "string") allowed.lastfmApiKey = body.lastfmApiKey;

    if (!Object.keys(allowed).length) {
      // No keys provided; return current config without error
      return jsonResponse({ ok: true, config: getConfig() });
    }

    setConfig(allowed);
    // Persist to DB if configured
    await saveConfigToDb(allowed);
    return jsonResponse({ ok: true, config: getConfig() });
  },
  {
    service: 'config',
    operation: 'update',
    defaultCode: 'CONFIG_UPDATE_ERROR',
    defaultMessage: 'Configuration update failed',
  }
);

export const Route = createFileRoute("/api/config")({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
});

async function saveConfigToDb(cfg: Record<string, string>): Promise<void> {
  if (!cfg || Object.keys(cfg).length === 0) return;

  // Fallback to db/config.json
  try {
    const pathMod = await import("path");
    const fsMod = await import("fs/promises");
    const CONFIG_PATH = pathMod.resolve(process.cwd(), "db", "config.json");
    await fsMod.mkdir(pathMod.dirname(CONFIG_PATH), { recursive: true });
    let existing: Record<string, string> = {};
    try {
      const raw = await fsMod.readFile(CONFIG_PATH, "utf8");
      existing = JSON.parse(raw) as Record<string, string>;
    } catch {
      existing = {};
    }
    const merged = { ...existing, ...cfg };
    await fsMod.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2));
  } catch {
    // ignore local storage errors
  }
}
