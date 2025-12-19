import { createFileRoute } from "@tanstack/react-router";
import { getConfig, setConfig } from "~/lib/config/config";


export const Route = createFileRoute("/api/config")({
  server: {
    handlers: {
  GET: async () => {
    const cfg = getConfig();
    return new Response(JSON.stringify({ ok: true, config: cfg }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  },
  POST: async ({ request }: { request: Request }) => {
    try {
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

        return new Response(JSON.stringify({ ok: true, statuses }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Accept a subset of keys for configuration
      const allowed: Record<string, any> = {};

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
        return new Response(JSON.stringify({ ok: true, config: getConfig() }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      setConfig(allowed);
      // Persist to DB if configured
      await saveConfigToDb(allowed);
      return new Response(JSON.stringify({ ok: true, config: getConfig() }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch {
      return new Response(JSON.stringify({ error: "Configuration update failed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
    },
  },
});

async function saveConfigToDb(cfg: Record<string, any>): Promise<void> {
  if (!cfg || Object.keys(cfg).length === 0) return;

  // Fallback to db/config.json
  try {
    const pathMod = await import("path");
    const fsMod = await import("fs/promises");
    const CONFIG_PATH = pathMod.resolve(process.cwd(), "db", "config.json");
    await fsMod.mkdir(pathMod.dirname(CONFIG_PATH), { recursive: true });
    let existing: Record<string, any> = {};
    try {
      const raw = await fsMod.readFile(CONFIG_PATH, "utf8");
      existing = JSON.parse(raw) as Record<string, any>;
    } catch {
      existing = {};
    }
    const merged = { ...existing, ...cfg };
    await fsMod.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2));
  } catch {
    // ignore local storage errors
  }
}
