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

    // In-band test — supports `test: true` (all) or `test: "serviceName"` (single)
    if (body?.test) {
      const cfg = getConfig();
      const statuses: Record<string, string> = {};
      const target = typeof body.test === 'string' ? body.test : null; // null = test all

      const timedFetch = async (url: string, init?: RequestInit): Promise<Response> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        try {
          const res = await fetch(url, { ...init, signal: controller.signal });
          clearTimeout(timeout);
          return res;
        } catch (err) {
          clearTimeout(timeout);
          throw err;
        }
      };

      // Test Navidrome using Subsonic ping API with auth
      const testNavidrome = async () => {
        if (!cfg.navidromeUrl) { statuses.navidromeUrl = "not configured"; return; }
        try {
          const u = cfg.navidromeUsername || '';
          const p = cfg.navidromePassword || '';
          const pingUrl = `${cfg.navidromeUrl}/rest/ping?v=1.16.1&c=aidj&f=json&u=${encodeURIComponent(u)}&p=${encodeURIComponent(p)}`;
          const res = await timedFetch(pingUrl);
          if (res.ok) {
            const json = await res.json().catch(() => null);
            const status = json?.['subsonic-response']?.status;
            statuses.navidromeUrl = status === 'ok' ? 'connected' : `http ${res.status}`;
          } else {
            statuses.navidromeUrl = res.status === 401 || res.status === 403 ? 'bad credentials' : `http ${res.status}`;
          }
        } catch { statuses.navidromeUrl = "unreachable"; }
      };

      // Test Lidarr with API key header
      const testLidarr = async () => {
        if (!cfg.lidarrUrl) { statuses.lidarrUrl = "not configured"; return; }
        try {
          const res = await timedFetch(`${cfg.lidarrUrl}/api/v1/system/status`, {
            headers: cfg.lidarrApiKey ? { 'X-Api-Key': cfg.lidarrApiKey } : {},
          });
          if (res.ok) {
            statuses.lidarrUrl = 'connected';
          } else {
            statuses.lidarrUrl = res.status === 401 || res.status === 403 ? 'bad API key' : `http ${res.status}`;
          }
        } catch { statuses.lidarrUrl = "unreachable"; }
      };

      // Test MeTube (no auth needed)
      const testMeTube = async () => {
        if (!cfg.metubeUrl) { statuses.metubeUrl = "not configured"; return; }
        try {
          const res = await timedFetch(cfg.metubeUrl);
          statuses.metubeUrl = res.ok ? "connected" : `http ${res.status}`;
        } catch { statuses.metubeUrl = "unreachable"; }
      };

      // Test LLM Provider — actually probe the endpoint
      const testLLMProvider = async () => {
        const provider = cfg.llmProvider || 'ollama';
        try {
          if (provider === 'ollama') {
            if (!cfg.ollamaUrl) { statuses.llmProvider = "not configured"; return; }
            const res = await timedFetch(`${cfg.ollamaUrl}/api/tags`);
            statuses.llmProvider = res.ok ? "connected" : `http ${res.status}`;
          } else if (provider === 'openrouter') {
            if (!cfg.openrouterApiKey) { statuses.llmProvider = "not configured"; return; }
            const res = await timedFetch('https://openrouter.ai/api/v1/models', {
              headers: { 'Authorization': `Bearer ${cfg.openrouterApiKey}` },
            });
            statuses.llmProvider = res.ok ? "connected" : res.status === 401 || res.status === 403 ? "bad API key" : `http ${res.status}`;
          } else if (provider === 'anthropic') {
            if (!cfg.anthropicApiKey) { statuses.llmProvider = "not configured"; return; }
            const baseUrl = cfg.anthropicBaseUrl || 'https://api.anthropic.com/v1';
            const res = await timedFetch(`${baseUrl}/models`, {
              headers: { 'x-api-key': cfg.anthropicApiKey, 'anthropic-version': '2023-06-01' },
            });
            statuses.llmProvider = res.ok ? "connected" : res.status === 401 || res.status === 403 ? "bad API key" : `http ${res.status}`;
          } else if (provider === 'glm') {
            if (!cfg.glmApiKey) { statuses.llmProvider = "not configured"; return; }
            const res = await timedFetch('https://open.bigmodel.cn/api/paas/v4/models', {
              headers: { 'Authorization': `Bearer ${cfg.glmApiKey}` },
            });
            statuses.llmProvider = res.ok ? "connected" : res.status === 401 || res.status === 403 ? "bad API key" : `http ${res.status}`;
          } else {
            statuses.llmProvider = "not configured";
          }
        } catch { statuses.llmProvider = "unreachable"; }
      };

      // Run targeted or all tests
      const tests: Promise<void>[] = [];
      if (!target || target === 'llmProvider') tests.push(testLLMProvider());
      if (!target || target === 'navidromeUrl') tests.push(testNavidrome());
      if (!target || target === 'lidarrUrl') tests.push(testLidarr());
      if (!target || target === 'metubeUrl') tests.push(testMeTube());
      await Promise.all(tests);

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
    if (typeof body.lidarrApiKey === "string") allowed.lidarrApiKey = body.lidarrApiKey;
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
