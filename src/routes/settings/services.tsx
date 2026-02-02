import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, CheckCircle2, AlertCircle } from 'lucide-react';

type LLMProviderType = 'ollama' | 'openrouter' | 'glm' | 'anthropic';

export function ServicesSettings() {
  const [config, setConfig] = useState<{
    llmProvider?: LLMProviderType;
    ollamaUrl?: string;
    ollamaModel?: string;
    openrouterApiKey?: string;
    openrouterModel?: string;
    glmApiKey?: string;
    glmModel?: string;
    anthropicApiKey?: string;
    anthropicModel?: string;
    anthropicBaseUrl?: string;
    navidromeUrl?: string;
    lidarrUrl?: string;
    metubeUrl?: string;
    lastfmApiKey?: string;
  }>({});

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Connectivity test state
  const [testStatuses, setTestStatuses] = useState<{
    llmProvider?: string;
    ollamaUrl?: string;
    navidromeUrl?: string;
    lidarrUrl?: string;
    metubeUrl?: string;
    lastfmApiKey?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [lastfmTesting, setLastfmTesting] = useState(false);

  // Last.fm backfill state
  const [backfillUsername, setBackfillUsername] = useState('');
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{
    success: boolean;
    imported?: number;
    skipped?: number;
    totalScrobbles?: number;
    error?: string;
  } | null>(null);

  // Load existing config on mount
  useEffect(() => {
    fetch('/api/config', { method: 'GET' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.config) {
          setConfig({
            llmProvider: data.config.llmProvider,
            ollamaUrl: data.config.ollamaUrl,
            ollamaModel: data.config.ollamaModel,
            openrouterApiKey: data.config.openrouterApiKey,
            openrouterModel: data.config.openrouterModel,
            glmApiKey: data.config.glmApiKey,
            glmModel: data.config.glmModel,
            anthropicApiKey: data.config.anthropicApiKey,
            anthropicModel: data.config.anthropicModel,
            anthropicBaseUrl: data.config.anthropicBaseUrl,
            navidromeUrl: data.config.navidromeUrl,
            lidarrUrl: data.config.lidarrUrl,
            metubeUrl: data.config.metubeUrl,
            lastfmApiKey: data.config.lastfmApiKey,
          });
        }
      })
      .catch(() => {
        // Ignore load errors for now
      });
  }, []);

  const update = (
    key: keyof typeof config,
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
      llmProvider: config.llmProvider,
      ollamaUrl: config.ollamaUrl,
      ollamaModel: config.ollamaModel,
      openrouterApiKey: config.openrouterApiKey,
      openrouterModel: config.openrouterModel,
      glmApiKey: config.glmApiKey,
      glmModel: config.glmModel,
      anthropicApiKey: config.anthropicApiKey,
      anthropicModel: config.anthropicModel,
      anthropicBaseUrl: config.anthropicBaseUrl,
      navidromeUrl: config.navidromeUrl,
      lidarrUrl: config.lidarrUrl,
      metubeUrl: config.metubeUrl,
      lastfmApiKey: config.lastfmApiKey,
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
          llmProvider: 'unreachable',
          ollamaUrl: 'unreachable',
          navidromeUrl: 'unreachable',
          lidarrUrl: 'unreachable',
          metubeUrl: 'unreachable',
          lastfmApiKey: 'unreachable',
        });
      }
    } catch {
      setTestStatuses({
        llmProvider: 'unreachable',
        ollamaUrl: 'unreachable',
        navidromeUrl: 'unreachable',
        lidarrUrl: 'unreachable',
        metubeUrl: 'unreachable',
        lastfmApiKey: 'unreachable',
      });
    } finally {
      setTesting(false);
    }
  };

  // Test Last.fm connection specifically
  const testLastFmConnection = async () => {
    setLastfmTesting(true);
    try {
      const res = await fetch('/api/lastfm/test', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setTestStatuses(prev => ({
          ...prev,
          lastfmApiKey: 'connected',
        }));
      } else {
        setTestStatuses(prev => ({
          ...prev,
          lastfmApiKey: json.code === 'LASTFM_NOT_CONFIGURED' ? 'not configured' : 'error',
        }));
      }
    } catch {
      setTestStatuses(prev => ({
        ...prev,
        lastfmApiKey: 'unreachable',
      }));
    } finally {
      setLastfmTesting(false);
    }
  };

  // Run Last.fm scrobble backfill
  const runBackfill = async () => {
    if (!backfillUsername.trim() || backfillRunning) return;
    setBackfillRunning(true);
    setBackfillResult(null);

    try {
      const res = await fetch('/api/lastfm/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: backfillUsername.trim(), maxPages: 50 }),
      });
      const json = await res.json();
      if (json.success) {
        setBackfillResult({
          success: true,
          imported: json.data.imported,
          skipped: json.data.skipped,
          totalScrobbles: json.data.totalScrobbles,
        });
      } else {
        setBackfillResult({
          success: false,
          error: json.data?.error || json.error || 'Backfill failed',
        });
      }
    } catch {
      setBackfillResult({ success: false, error: 'Request failed' });
    } finally {
      setBackfillRunning(false);
    }
  };

  // Model options for each provider
  const ollamaModels = ['llama2', 'llama3', 'llama3.1', 'llama3.2', 'qwen2.5', 'mixtral', 'codellama', 'mistral', 'gemma2'];
  const openrouterModels = [
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3-opus',
    'anthropic/claude-3-haiku',
    'openai/gpt-4-turbo',
    'openai/gpt-4o',
    'openai/gpt-3.5-turbo',
    'meta-llama/llama-3.1-70b-instruct',
    'google/gemini-pro',
    'nvidia/nemotron-nano-12b-v2-vl:free',
    'minimax/minimax-m2:free',
    'alibaba/tongyi-deepresearch-30b-a3b:free',
  ];
  const glmModels = [
    'glm-4-plus',
    'glm-4.6',
    'glm-4-0520',
    'glm-4',
    'glm-4-air',
    'glm-4-airx',
    'glm-4-flash',
    'glm-3-turbo'
  ];
  const anthropicModels = [
    'claude-sonnet-4-5-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ];

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-6">Service Configuration</h2>

      <div className="space-y-6">
        {/* Info Message */}
        <div className="p-4 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
          <p className="text-sm">
            Configure the LLM provider and external services. These services power AI recommendations,
            music playback, and automatic music management.
          </p>
        </div>

        {/* Configuration Form */}
        <form onSubmit={onSubmit} className="space-y-6">
          {/* LLM Provider Section */}
          <div className="p-4 border rounded-lg space-y-4 bg-gray-50 dark:bg-gray-800/50">
            <h3 className="text-lg font-semibold">AI Provider Configuration</h3>

            {/* Provider Selection */}
            <div>
              <Label htmlFor="llmProvider">LLM Provider</Label>
              <Select
                value={config.llmProvider || 'ollama'}
                onValueChange={(value) => update('llmProvider', value)}
              >
                <SelectTrigger className="mt-2 w-full">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">Ollama (Local)</SelectItem>
                  <SelectItem value="openrouter">OpenRouter (Cloud)</SelectItem>
                  <SelectItem value="glm">GLM / Zhipu AI (Cloud)</SelectItem>
                  <SelectItem value="anthropic">Anthropic / z.ai (Cloud)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Choose between local (Ollama) or cloud-based AI providers
              </p>
            </div>

            {/* Ollama Configuration */}
            {config.llmProvider === 'ollama' && (
              <>
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
                    Local Ollama server URL
                  </p>
                </div>
                <div>
                  <Label htmlFor="ollamaModel">Model</Label>
                  <Select
                    value={config.ollamaModel || 'llama2'}
                    onValueChange={(value) => update('ollamaModel', value)}
                  >
                    <SelectTrigger className="mt-2 w-full">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {ollamaModels.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* OpenRouter Configuration */}
            {config.llmProvider === 'openrouter' && (
              <>
                <div>
                  <Label htmlFor="openrouterApiKey">OpenRouter API Key</Label>
                  <Input
                    id="openrouterApiKey"
                    name="openrouterApiKey"
                    type="password"
                    placeholder="sk-or-..."
                    value={config.openrouterApiKey ?? ''}
                    onChange={(e) => update('openrouterApiKey', e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Get your API key from{' '}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      openrouter.ai/keys
                    </a>
                  </p>
                </div>
                <div>
                  <Label htmlFor="openrouterModel">Model</Label>
                  <Select
                    value={config.openrouterModel || 'anthropic/claude-3.5-sonnet'}
                    onValueChange={(value) => update('openrouterModel', value)}
                  >
                    <SelectTrigger className="mt-2 w-full">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {openrouterModels.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Pay-per-use pricing varies by model
                  </p>
                </div>
              </>
            )}

            {/* GLM Configuration */}
            {config.llmProvider === 'glm' && (
              <>
                <div>
                  <Label htmlFor="glmApiKey">GLM API Key</Label>
                  <Input
                    id="glmApiKey"
                    name="glmApiKey"
                    type="password"
                    placeholder="..."
                    value={config.glmApiKey ?? ''}
                    onChange={(e) => update('glmApiKey', e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Get your API key from{' '}
                    <a
                      href="https://open.bigmodel.cn"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      open.bigmodel.cn
                    </a>
                  </p>
                </div>
                <div>
                  <Label htmlFor="glmModel">Model</Label>
                  <Select
                    value={config.glmModel || 'glm-4-plus'}
                    onValueChange={(value) => update('glmModel', value)}
                  >
                    <SelectTrigger className="mt-2 w-full">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {glmModels.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Zhipu AI models (glm-4-plus recommended for best performance)
                  </p>
                </div>
              </>
            )}

            {/* Anthropic Configuration */}
            {config.llmProvider === 'anthropic' && (
              <>
                <div>
                  <Label htmlFor="anthropicApiKey">API Key</Label>
                  <Input
                    id="anthropicApiKey"
                    name="anthropicApiKey"
                    type="password"
                    placeholder="sk-ant-..."
                    value={config.anthropicApiKey ?? ''}
                    onChange={(e) => update('anthropicApiKey', e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Your Anthropic or z.ai API key
                  </p>
                </div>
                <div>
                  <Label htmlFor="anthropicBaseUrl">API Base URL</Label>
                  <Input
                    id="anthropicBaseUrl"
                    name="anthropicBaseUrl"
                    type="url"
                    placeholder="https://api.anthropic.com/v1"
                    value={config.anthropicBaseUrl ?? 'https://api.anthropic.com/v1'}
                    onChange={(e) => update('anthropicBaseUrl', e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">https://api.z.ai/api/anthropic</code> for z.ai proxy
                  </p>
                </div>
                <div>
                  <Label htmlFor="anthropicModel">Model</Label>
                  <Select
                    value={config.anthropicModel || 'claude-sonnet-4-5-20250514'}
                    onValueChange={(value) => update('anthropicModel', value)}
                  >
                    <SelectTrigger className="mt-2 w-full">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {anthropicModels.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Claude models (Haiku is fastest/cheapest, Opus is most capable)
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Music Services Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Music Services</h3>

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

            {/* MeTube URL */}
            <div>
              <Label htmlFor="metubeUrl">MeTube URL</Label>
              <Input
                id="metubeUrl"
                name="metubeUrl"
                type="url"
                placeholder="http://localhost:8081"
                value={config.metubeUrl ?? ''}
                onChange={(e) => update('metubeUrl', e.target.value)}
                className="mt-2"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                YouTube/SoundCloud downloader via{' '}
                <a
                  href="https://github.com/alexta69/metube"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  MeTube
                </a>
              </p>
            </div>
          </div>

          {/* Discovery Services Section - Story 7.2 */}
          <div className="p-4 border rounded-lg space-y-4 bg-purple-50 dark:bg-purple-900/10">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Discovery Services
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Optional services to help you discover new music similar to what you already enjoy.
            </p>

            {/* Last.fm API Key */}
            <div>
              <Label htmlFor="lastfmApiKey">Last.fm API Key</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="lastfmApiKey"
                  name="lastfmApiKey"
                  type="password"
                  placeholder="Your Last.fm API key"
                  value={config.lastfmApiKey ?? ''}
                  onChange={(e) => update('lastfmApiKey', e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={testLastFmConnection}
                  disabled={lastfmTesting || !config.lastfmApiKey}
                >
                  {lastfmTesting ? 'Testing...' : 'Test'}
                </Button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Get your free API key from{' '}
                <a
                  href="https://www.last.fm/api/account/create"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 dark:text-purple-400 hover:underline"
                >
                  last.fm/api
                </a>
                {' '}- Used for Discovery mode recommendations
              </p>
              {testStatuses?.lastfmApiKey && (
                <div
                  className={`mt-2 text-sm px-2 py-1 rounded inline-block ${
                    testStatuses.lastfmApiKey === 'connected'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : testStatuses.lastfmApiKey === 'not configured'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                  }`}
                >
                  {testStatuses.lastfmApiKey === 'connected'
                    ? 'Connected successfully'
                    : testStatuses.lastfmApiKey === 'not configured'
                    ? 'Not configured'
                    : 'Connection failed - check API key'}
                </div>
              )}
            </div>
          </div>

          {/* Last.fm Scrobble Backfill Section */}
          <div className="p-4 border rounded-lg space-y-4 bg-indigo-50 dark:bg-indigo-900/10">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Last.fm Scrobble Backfill
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Import your listening history from Last.fm to enrich analytics and recommendations.
              This syncs your scrobbles into the local listening history database.
            </p>

            <div>
              <Label htmlFor="backfillUsername">Last.fm Username</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="backfillUsername"
                  placeholder="your-lastfm-username"
                  value={backfillUsername}
                  onChange={(e) => setBackfillUsername(e.target.value)}
                  className="flex-1"
                  disabled={backfillRunning}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={runBackfill}
                  disabled={backfillRunning || !backfillUsername.trim()}
                >
                  {backfillRunning ? 'Importing...' : 'Import Scrobbles'}
                </Button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Your public Last.fm profile username. Imports up to 50 pages of recent scrobbles.
              </p>
            </div>

            {backfillResult && (
              <div
                className={`flex items-start gap-2 p-3 rounded-md text-sm ${
                  backfillResult.success
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                }`}
              >
                {backfillResult.success ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                )}
                <div>
                  {backfillResult.success ? (
                    <>
                      Imported <strong>{backfillResult.imported}</strong> scrobbles
                      {backfillResult.skipped ? ` (${backfillResult.skipped} duplicates skipped)` : ''}
                      {backfillResult.totalScrobbles ? ` out of ${backfillResult.totalScrobbles} total` : ''}
                    </>
                  ) : (
                    <>Backfill failed: {backfillResult.error}</>
                  )}
                </div>
              </div>
            )}
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="text-center">
                <div className="font-medium mb-1">AI Provider</div>
                <div
                  className={`text-sm px-2 py-1 rounded ${
                    testStatuses.llmProvider === 'connected'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : testStatuses.llmProvider === 'not configured'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                  }`}
                >
                  {testStatuses.llmProvider || 'Not configured'}
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
              <div className="text-center">
                <div className="font-medium mb-1">MeTube</div>
                <div
                  className={`text-sm px-2 py-1 rounded ${
                    testStatuses.metubeUrl === 'connected'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : testStatuses.metubeUrl === 'not configured'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                  }`}
                >
                  {testStatuses.metubeUrl || 'Not configured'}
                </div>
              </div>
              <div className="text-center">
                <div className="font-medium mb-1">
                  {config.llmProvider === 'ollama' ? 'Ollama' : config.llmProvider === 'openrouter' ? 'OpenRouter' : config.llmProvider === 'anthropic' ? 'Anthropic' : 'GLM'}
                </div>
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
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
