declare module 'pg';
import { createServerFileRoute } from "@tanstack/react-start/server";
import { getConfig, setConfig } from "~/lib/config/config";

type PgClientLike = {
  connect(): Promise<void>;
  query(text: string, params?: unknown[]): Promise<unknown>;
  end(): Promise<void>;
}
type PgClientCtor = new (opts: { connectionString: string }) => PgClientLike;
type PgModule = { Client: PgClientCtor };

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
      const allowed: Partial<{ ollamaUrl: string; navidromeUrl: string; lidarrUrl: string }> = {};
      if (typeof body.ollamaUrl === "string") allowed.ollamaUrl = body.ollamaUrl;
      if (typeof body.navidromeUrl === "string") allowed.navidromeUrl = body.navidromeUrl;
      if (typeof body.lidarrUrl === "string") allowed.lidarrUrl = body.lidarrUrl;

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
  cfg: Partial<{ ollamaUrl: string; navidromeUrl: string; lidarrUrl: string }>
): Promise<void> {
  if (!cfg || Object.keys(cfg).length === 0) return;
  const hasAny = !!(cfg.ollamaUrl || cfg.navidromeUrl || cfg.lidarrUrl);
  if (!hasAny) return;

  // Try PostgreSQL if available
  try {
    let ClientCtor: PgClientCtor | null = null;
    try {
      const mod = await import("pg");
      ClientCtor = (mod as PgModule).Client;
    } catch {
      ClientCtor = null;
    }
    if (ClientCtor) {
      const connectionString = (process as { env: { DATABASE_URL?: string } }).env.DATABASE_URL;
      if (!connectionString) return;
      const client = new ClientCtor({ connectionString });
      await client.connect();

      // Migration: move local fallback config to DB if present
      await migrateLocalConfigToDbIfNeeded(client);

      try {
        await client.query(
          `INSERT INTO config (id, ollama_url, navidrome_url, lidarr_url) VALUES (TRUE, $1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET
             ollama_url = EXCLUDED.ollama_url,
             navidrome_url = EXCLUDED.navidrome_url,
             lidarr_url = EXCLUDED.lidarr_url`,
          [cfg.ollamaUrl ?? null, cfg.navidromeUrl ?? null, cfg.lidarrUrl ?? null]
        );
      } catch {
        // ignore
      }

      await client.end();
      return;
    }
  } catch {
    // fallback to local storage
  }

  // Fallback to db/config.json
  try {
    const pathMod = await import("path");
    const fsMod = await import("fs/promises");
    const CONFIG_PATH = pathMod.resolve(process.cwd(), "db", "config.json");
    await fsMod.mkdir(pathMod.dirname(CONFIG_PATH), { recursive: true });
    let existing: Partial<{ ollamaUrl: string; navidromeUrl: string; lidarrUrl: string }> = {};
    try {
      const raw = await fsMod.readFile(CONFIG_PATH, "utf8");
      existing = JSON.parse(raw) as Partial<{ ollamaUrl: string; navidromeUrl: string; lidarrUrl: string }>;
    } catch {
      existing = {};
    }
    const merged = { ...existing, ...cfg };
    await fsMod.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2));
  } catch {
    // ignore local storage errors
  }
}

async function migrateLocalConfigToDbIfNeeded(client: PgClientLike): Promise<void> {
  try {
    const pathMod = await import("path");
    const fsMod = await import("fs/promises");
    const markerPath = pathMod.resolve(process.cwd(), "db", ".config_migrated_to_pg");
    try {
      await fsMod.access(markerPath);
      // migration already done
      return;
    } catch {
      // marker not present
    }

    const CONFIG_PATH = pathMod.resolve(process.cwd(), "db", "config.json");
    let local: Partial<{ ollamaUrl: string; navidromeUrl: string; lidarrUrl: string }> = {};
    try {
      const raw = await fsMod.readFile(CONFIG_PATH, "utf8");
      local = JSON.parse(raw) as Partial<{ ollamaUrl: string; navidromeUrl: string; lidarrUrl: string }>;
    } catch {
      // no local config
    }

    if (local.ollamaUrl || local.navidromeUrl || local.lidarrUrl) {
      await client.query(
        `INSERT INTO config (id, ollama_url, navidrome_url, lidarr_url) VALUES (TRUE, $1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET
           ollama_url = EXCLUDED.ollama_url,
           navidrome_url = EXCLUDED.navidrome_url,
           lidarr_url = EXCLUDED.lidarr_url`,
        [local.ollamaUrl ?? null, local.navidromeUrl ?? null, local.lidarrUrl ?? null]
      );
    }

    try {
      await fsMod.mkdir(pathMod.dirname(markerPath), { recursive: true });
      await fsMod.writeFile(markerPath, JSON.stringify({ migratedAt: new Date().toISOString() }), "utf8");
    } catch {
      // ignore marker write errors
    }
  } catch {
    // ignore migration errors
  }
}