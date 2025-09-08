import { createServerFileRoute } from "@tanstack/react-start/server";
import { getConfig, setConfig } from "~/lib/config/config";


export const ServerRoute = createServerFileRoute("/api/config").methods({
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
            statuses[label] = "Not configured";
            return;
          }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3500);
          try {
            const res = await fetch(url, { method: "GET", signal: controller.signal });
            clearTimeout(timeout);
            statuses[label] = res.ok ? "reachable" : `http ${res.status}`;
          } catch {
            statuses[label] = "unreachable";
          }
        };

        await Promise.all([
          test("ollamaUrl", cfg.ollamaUrl),
          test("navidromeUrl", cfg.navidromeUrl),
          test("lidarrUrl", cfg.lidarrUrl),
        ]);

        return new Response(JSON.stringify({ ok: true, statuses }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Accept a subset of keys for configuration
      const allowed: Partial<{ ollamaUrl: string; navidromeUrl: string; lidarrUrl: string; navidromeUsername: string; navidromePassword: string }> = {};
      if (typeof body.ollamaUrl === "string") allowed.ollamaUrl = body.ollamaUrl;
      if (typeof body.navidromeUrl === "string") allowed.navidromeUrl = body.navidromeUrl;
      if (typeof body.lidarrUrl === "string") allowed.lidarrUrl = body.lidarrUrl;
      if (typeof body.navidromeUsername === "string") allowed.navidromeUsername = body.navidromeUsername;
      if (typeof body.navidromePassword === "string") allowed.navidromePassword = body.navidromePassword;

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
});

async function saveConfigToDb(
  cfg: Partial<{ ollamaUrl: string; navidromeUrl: string; lidarrUrl: string; navidromeUsername: string; navidromePassword: string }>
): Promise<void> {
  if (!cfg || Object.keys(cfg).length === 0) return;
  const hasAny = !!(cfg.ollamaUrl || cfg.navidromeUrl || cfg.lidarrUrl || cfg.navidromeUsername || cfg.navidromePassword);
  if (!hasAny) return;

  // fallback to local storage

  // Fallback to db/config.json
  try {
    const pathMod = await import("path");
    const fsMod = await import("fs/promises");
    const CONFIG_PATH = pathMod.resolve(process.cwd(), "db", "config.json");
    await fsMod.mkdir(pathMod.dirname(CONFIG_PATH), { recursive: true });
    let existing: Partial<{ ollamaUrl: string; navidromeUrl: string; lidarrUrl: string; navidromeUsername: string; navidromePassword: string }> = {};
    try {
      const raw = await fsMod.readFile(CONFIG_PATH, "utf8");
      existing = JSON.parse(raw) as Partial<{ ollamaUrl: string; navidromeUrl: string; lidarrUrl: string; navidromeUsername: string; navidromePassword: string }>;
    } catch {
      existing = {};
    }
    const merged = { ...existing, ...cfg };
    await fsMod.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2));
  } catch {
    // ignore local storage errors
  }
}
