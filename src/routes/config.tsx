import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/config")({
  component: ConfigPage,
});

function ConfigPage() {
  // Local UI state for configuration fields
  const [config, setConfig] = useState<{
    ollamaUrl?: string;
    navidromeUrl?: string;
    lidarrUrl?: string;
  }>({});

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Connectivity test state
  const [testStatuses, setTestStatuses] = useState<{
    ollamaUrl?: string;
    navidromeUrl?: string;
    lidarrUrl?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  // Load existing config on mount
  useEffect(() => {
    fetch("/api/config", { method: "GET" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.config) {
          setConfig({
            ollamaUrl: data.config.ollamaUrl,
            navidromeUrl: data.config.navidromeUrl,
            lidarrUrl: data.config.lidarrUrl
          });
        }
      })
      .catch(() => {
        // Ignore load errors for now
      });
  }, []);

  const update = (
    key: "ollamaUrl" | "navidromeUrl" | "lidarrUrl",
    value: string
  ) => {
    setConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setStatus(null);
    setLoading(true);

    const payload = {
      ollamaUrl: config.ollamaUrl,
      navidromeUrl: config.navidromeUrl,
      lidarrUrl: config.lidarrUrl
    };

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setStatus("Configuration saved");
      } else {
        setStatus(json?.error ?? "Save failed");
      }
    } catch {
      setStatus("Request failed");
    } finally {
      setLoading(false);
    }
  };

  const runTestConnections = async () => {
    setTesting(true);
    setTestStatuses(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
      const json = await res.json();
      if (res.ok && json?.statuses) {
        setTestStatuses(json.statuses);
      } else {
        setTestStatuses({ ollamaUrl: "unreachable", navidromeUrl: "unreachable", lidarrUrl: "unreachable" });
      }
    } catch {
      setTestStatuses({ ollamaUrl: "unreachable", navidromeUrl: "unreachable", lidarrUrl: "unreachable" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Service Configuration</h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 w-full max-w-lg mx-auto">
        <div className="grid gap-2">
          <Label htmlFor="ollamaUrl">Ollama URL</Label>
          <Input
            id="ollamaUrl"
            name="ollamaUrl"
            type="url"
            placeholder="http://localhost:11434"
            value={config.ollamaUrl ?? ""}
            onChange={(e) => update("ollamaUrl", e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="navidromeUrl">Navidrome URL</Label>
          <Input
            id="navidromeUrl"
            name="navidromeUrl"
            type="url"
            placeholder="http://localhost: Navidrome"
            value={config.navidromeUrl ?? ""}
            onChange={(e) => update("navidromeUrl", e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="lidarrUrl">Lidarr URL</Label>
          <Input
            id="lidarrUrl"
            name="lidarrUrl"
            type="url"
            placeholder="http://localhost:8686"
            value={config.lidarrUrl ?? ""}
            onChange={(e) => update("lidarrUrl", e.target.value)}
          />
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "Saving..." : "Save Configuration"}
        </Button>
      </form>

      {testStatuses && (
        <div className="text-sm text-center">
          Connectivity: Ollama: {testStatuses.ollamaUrl ?? "Not configured"} | Navidrome: {testStatuses.navidromeUrl ?? "Not configured"} | Lidarr: {testStatuses.lidarrUrl ?? "Not configured"}
        </div>
      )}

      <Button type="button" className="w-full" onClick={runTestConnections} disabled={testing}>
        {testing ? "Testing..." : "Test Connections"}
      </Button>

      {status && (
        <div className="text-sm text-center mt-2">{status}</div>
      )}

      <div className="text-sm text-center">
        <Link to="/dashboard">Back to Dashboard</Link>
      </div>
    </div>
  );
}