import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/config")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
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
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold tracking-tight">Service Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
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

            <div className="space-y-2">
              <Label htmlFor="navidromeUrl">Navidrome URL</Label>
              <Input
                id="navidromeUrl"
                name="navidromeUrl"
                type="url"
                placeholder="http://localhost:4533"
                value={config.navidromeUrl ?? ""}
                onChange={(e) => update("navidromeUrl", e.target.value)}
              />
            </div>

            <div className="space-y-2">
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

          {status && (
            <div className={`text-sm text-center p-3 rounded-md ${status.includes('saved') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {status}
            </div>
          )}

          <div className="space-y-3">
            <Button type="button" className="w-full" variant="outline" onClick={runTestConnections} disabled={testing}>
              {testing ? "Testing Connections..." : "Test Service Connections"}
            </Button>
            
            {testStatuses && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <div className="font-medium mb-1">Ollama</div>
                  <div className={`text-sm px-2 py-1 rounded ${testStatuses.ollamaUrl === 'connected' ? 'bg-green-100 text-green-800' : testStatuses.ollamaUrl === 'not configured' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-800'}`}>
                    {testStatuses.ollamaUrl || 'Not configured'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium mb-1">Navidrome</div>
                  <div className={`text-sm px-2 py-1 rounded ${testStatuses.navidromeUrl === 'connected' ? 'bg-green-100 text-green-800' : testStatuses.navidromeUrl === 'not configured' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-800'}`}>
                    {testStatuses.navidromeUrl || 'Not configured'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium mb-1">Lidarr</div>
                  <div className={`text-sm px-2 py-1 rounded ${testStatuses.lidarrUrl === 'connected' ? 'bg-green-100 text-green-800' : testStatuses.lidarrUrl === 'not configured' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-800'}`}>
                    {testStatuses.lidarrUrl || 'Not configured'}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="text-center pt-4 border-t">
            <Link to="/dashboard" className="text-primary hover:underline">← Back to Dashboard</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}