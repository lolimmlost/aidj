import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export function ServicesSettings() {
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
    fetch('/api/config', { method: 'GET' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.config) {
          setConfig({
            ollamaUrl: data.config.ollamaUrl,
            navidromeUrl: data.config.navidromeUrl,
            lidarrUrl: data.config.lidarrUrl,
          });
        }
      })
      .catch(() => {
        // Ignore load errors for now
      });
  }, []);

  const update = (
    key: 'ollamaUrl' | 'navidromeUrl' | 'lidarrUrl',
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
      lidarrUrl: config.lidarrUrl,
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setStatus('Configuration saved successfully');
      } else {
        setStatus(json?.error ?? 'Save failed');
      }
    } catch {
      setStatus('Request failed');
    } finally {
      setLoading(false);
    }
  };

  const runTestConnections = async () => {
    setTesting(true);
    setTestStatuses(null);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });
      const json = await res.json();
      if (res.ok && json?.statuses) {
        setTestStatuses(json.statuses);
      } else {
        setTestStatuses({
          ollamaUrl: 'unreachable',
          navidromeUrl: 'unreachable',
          lidarrUrl: 'unreachable',
        });
      }
    } catch {
      setTestStatuses({
        ollamaUrl: 'unreachable',
        navidromeUrl: 'unreachable',
        lidarrUrl: 'unreachable',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-6">Service Configuration</h2>

      <div className="space-y-6">
        {/* Info Message */}
        <div className="p-4 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
          <p className="text-sm">
            Configure the URLs for external services. These services power AI recommendations,
            music playback, and automatic music management.
          </p>
        </div>

        {/* Configuration Form */}
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Ollama URL */}
          <div>
            <Label htmlFor="ollamaUrl">Ollama URL</Label>
            <Input
              id="ollamaUrl"
              name="ollamaUrl"
              type="url"
              placeholder="http://localhost:11434"
              value={config.ollamaUrl ?? ''}
              onChange={(e) => update('ollamaUrl', e.target.value)}
              className="mt-2"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Local AI service for music recommendations
            </p>
          </div>

          {/* Navidrome URL */}
          <div>
            <Label htmlFor="navidromeUrl">Navidrome URL</Label>
            <Input
              id="navidromeUrl"
              name="navidromeUrl"
              type="url"
              placeholder="http://localhost:4533"
              value={config.navidromeUrl ?? ''}
              onChange={(e) => update('navidromeUrl', e.target.value)}
              className="mt-2"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Music server for streaming and library management
            </p>
          </div>

          {/* Lidarr URL */}
          <div>
            <Label htmlFor="lidarrUrl">Lidarr URL</Label>
            <Input
              id="lidarrUrl"
              name="lidarrUrl"
              type="url"
              placeholder="http://localhost:8686"
              value={config.lidarrUrl ?? ''}
              onChange={(e) => update('lidarrUrl', e.target.value)}
              className="mt-2"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Automatic music collection management
            </p>
          </div>

          {/* Save Button */}
          <div className="pt-4">
            <Button type="submit" className="w-full sm:w-auto" disabled={loading}>
              {loading ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </form>

        {/* Status Message */}
        {status && (
          <div
            className={`p-4 rounded-md ${
              status.includes('success')
                ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            }`}
          >
            {status}
          </div>
        )}

        {/* Test Connections */}
        <div className="space-y-3 pt-4 border-t">
          <Button
            type="button"
            className="w-full"
            variant="outline"
            onClick={runTestConnections}
            disabled={testing}
          >
            {testing ? 'Testing Connections...' : 'Test Service Connections'}
          </Button>

          {testStatuses && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="text-center">
                <div className="font-medium mb-1">Ollama</div>
                <div
                  className={`text-sm px-2 py-1 rounded ${
                    testStatuses.ollamaUrl === 'connected'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : testStatuses.ollamaUrl === 'not configured'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                  }`}
                >
                  {testStatuses.ollamaUrl || 'Not configured'}
                </div>
              </div>
              <div className="text-center">
                <div className="font-medium mb-1">Navidrome</div>
                <div
                  className={`text-sm px-2 py-1 rounded ${
                    testStatuses.navidromeUrl === 'connected'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : testStatuses.navidromeUrl === 'not configured'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                  }`}
                >
                  {testStatuses.navidromeUrl || 'Not configured'}
                </div>
              </div>
              <div className="text-center">
                <div className="font-medium mb-1">Lidarr</div>
                <div
                  className={`text-sm px-2 py-1 rounded ${
                    testStatuses.lidarrUrl === 'connected'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : testStatuses.lidarrUrl === 'not configured'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                  }`}
                >
                  {testStatuses.lidarrUrl || 'Not configured'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
