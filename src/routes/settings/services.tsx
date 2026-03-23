import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Server } from 'lucide-react';
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
import { Download, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { queryKeys } from '@/lib/query/keys';

type LLMProviderType = 'ollama' | 'openrouter' | 'glm' | 'anthropic';

type TestStatus = 'connected' | 'not configured' | 'unreachable' | 'bad API key' | 'bad credentials' | string;

function StatusBadge({ status }: { status?: TestStatus }) {
  if (!status) return null;
  const isOk = status === 'connected';
  const isWarn = status === 'not configured';
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
        isOk
          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
          : isWarn
          ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
          : 'bg-destructive/10 text-destructive'
      }`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${isOk ? 'bg-green-500' : isWarn ? 'bg-yellow-500' : 'bg-destructive'}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

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
    lidarrApiKey?: string;
    metubeUrl?: string;
    lastfmApiKey?: string;
  }>({});

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Per-service test statuses & loading flags
  const [testStatuses, setTestStatuses] = useState<Record<string, TestStatus>>({});
  const [testingService, setTestingService] = useState<string | null>(null);
  const [lastfmTesting, setLastfmTesting] = useState(false);

  // Last.fm backfill state
  const [backfillUsername, setBackfillUsername] = useState('');
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{
    success: boolean;
    imported?: number;
    skipped?: number;
    scores?: number;
    error?: string;
  } | null>(null);
  const [backfillProgress, setBackfillProgress] = useState<{
    phase: string;
    detail: string;
  } | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();
  const importStatsRef = useRef<{ imported: number; skipped: number }>({ imported: 0, skipped: 0 });

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
            lidarrApiKey: data.config.lidarrApiKey,
            metubeUrl: data.config.metubeUrl,
            lastfmApiKey: data.config.lastfmApiKey,
          });
        }
      })
      .catch(() => {});
  }, []);

  const update = (key: keyof typeof config, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
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
      lidarrApiKey: config.lidarrApiKey,
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

  // Test a single service via targeted API
  const testService = async (serviceKey: string) => {
    setTestingService(serviceKey);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: serviceKey }),
      });
      const json = await res.json();
      if (res.ok && json?.statuses) {
        setTestStatuses(prev => ({ ...prev, ...json.statuses }));
      } else {
        setTestStatuses(prev => ({ ...prev, [serviceKey]: 'unreachable' }));
      }
    } catch {
      setTestStatuses(prev => ({ ...prev, [serviceKey]: 'unreachable' }));
    } finally {
      setTestingService(null);
    }
  };

  // Test Last.fm connection via dedicated endpoint
  const testLastFmConnection = async () => {
    setLastfmTesting(true);
    try {
      const res = await fetch('/api/lastfm/test', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setTestStatuses(prev => ({ ...prev, lastfmApiKey: 'connected' }));
      } else {
        setTestStatuses(prev => ({
          ...prev,
          lastfmApiKey: json.code === 'LASTFM_NOT_CONFIGURED' ? 'not configured' : 'error',
        }));
      }
    } catch {
      setTestStatuses(prev => ({ ...prev, lastfmApiKey: 'unreachable' }));
    } finally {
      setLastfmTesting(false);
    }
  };

  const invalidateCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['listening-by-hour'] });
    queryClient.invalidateQueries({ queryKey: ['album-ages'] });
    queryClient.invalidateQueries({ queryKey: ['longest-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['interest-over-time'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.recommendations.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.musicIdentity.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.discoveryFeed.all() });
  }, [queryClient]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/lastfm/backfill?jobId=${jobId}`);
        if (!res.ok) {
          if (res.status === 404) {
            stopPolling();
            setBackfillRunning(running => {
              if (running) {
                setBackfillProgress(null);
                setBackfillResult({
                  success: true,
                  imported: importStatsRef.current.imported,
                  skipped: importStatsRef.current.skipped,
                });
                invalidateCaches();
              }
              return false;
            });
          }
          return;
        }

        const json = await res.json();
        const data = json.event;
        if (!data) return;

        if (data.phase === 'import' && !data.status) {
          importStatsRef.current = { imported: data.imported, skipped: data.skipped };
          setBackfillProgress({
            phase: 'import',
            detail: `Importing scrobbles... Page ${data.page}/${data.totalPages} (${data.imported.toLocaleString()} imported)`,
          });
        } else if (data.phase === 'import' && data.status === 'completed') {
          importStatsRef.current = { imported: data.imported, skipped: data.skipped };
          setBackfillProgress({
            phase: 'import',
            detail: `Import complete: ${data.imported.toLocaleString()} imported, ${data.skipped.toLocaleString()} skipped`,
          });
        } else if (data.phase === 'similarity' && !data.status) {
          setBackfillProgress({
            phase: 'similarity',
            detail: `Building recommendations... ${data.processed}/${data.total} tracks analyzed`,
          });
        } else if (data.phase === 'similarity' && data.status === 'completed') {
          setBackfillProgress({
            phase: 'similarity',
            detail: `Similarity analysis complete: ${data.processed} tracks processed`,
          });
        } else if (data.phase === 'scoring' && data.status === 'running') {
          setBackfillProgress({
            phase: 'scoring',
            detail: 'Updating your profile...',
          });
        } else if (data.phase === 'scoring' && data.status === 'completed') {
          setBackfillProgress({
            phase: 'scoring',
            detail: `Profile updated with ${data.scores} scores`,
          });
        } else if (data.phase === 'done') {
          stopPolling();
          setBackfillRunning(false);
          setBackfillProgress(null);
          setBackfillResult({
            success: true,
            imported: importStatsRef.current.imported,
            skipped: importStatsRef.current.skipped,
          });
          invalidateCaches();
        } else if (data.phase === 'error') {
          stopPolling();
          setBackfillRunning(false);
          setBackfillProgress(null);
          setBackfillResult({ success: false, error: data.error });
        }
      } catch {
        // Network blip — keep polling, don't fail the UI
      }
    }, 2000);
  }, [invalidateCaches, stopPolling]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Run Last.fm scrobble backfill
  const runBackfill = async () => {
    if (!backfillUsername.trim() || backfillRunning) return;
    setBackfillRunning(true);
    setBackfillResult(null);
    setBackfillProgress({ phase: 'starting', detail: 'Starting backfill...' });
    importStatsRef.current = { imported: 0, skipped: 0 };

    try {
      const res = await fetch('/api/lastfm/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: backfillUsername.trim(), maxPages: 50 }),
      });
      const json = await res.json();

      if (res.status === 202 && json.jobId) {
        startPolling(json.jobId);
      } else if (res.status === 409 && json.jobId) {
        startPolling(json.jobId);
      } else {
        setBackfillRunning(false);
        setBackfillProgress(null);
        setBackfillResult({
          success: false,
          error: json.error || 'Failed to start backfill',
        });
      }
    } catch {
      setBackfillRunning(false);
      setBackfillProgress(null);
      setBackfillResult({ success: false, error: 'Request failed' });
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Service Configuration
        </CardTitle>
        <CardDescription>
          Configure the LLM provider and external services that power AI recommendations, music playback, and automatic music management
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Configuration Form */}
        <form onSubmit={onSubmit} className="space-y-6">
          {/* LLM Provider Section */}
          <div className="p-4 border rounded-lg space-y-4 bg-muted/50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">AI Provider Configuration</h3>
              <div className="flex items-center gap-2">
                <StatusBadge status={testStatuses.llmProvider} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => testService('llmProvider')}
                  disabled={testingService === 'llmProvider'}
                >
                  {testingService === 'llmProvider' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test'}
                </Button>
              </div>
            </div>

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
              <p className="text-sm text-muted-foreground mt-1">
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
                  <p className="text-sm text-muted-foreground mt-1">
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
                  <p className="text-sm text-muted-foreground mt-1">
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
                  <p className="text-sm text-muted-foreground mt-1">
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
                  <p className="text-sm text-muted-foreground mt-1">
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
                  <p className="text-sm text-muted-foreground mt-1">
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
                  <p className="text-sm text-muted-foreground mt-1">
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
                  <p className="text-sm text-muted-foreground mt-1">
                    Use <code className="bg-muted px-1 rounded">https://api.z.ai/api/anthropic</code> for z.ai proxy
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
                  <p className="text-sm text-muted-foreground mt-1">
                    Claude models (Haiku is fastest/cheapest, Opus is most capable)
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Music Services Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Music Services</h3>

            {/* Navidrome */}
            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Navidrome</Label>
                <div className="flex items-center gap-2">
                  <StatusBadge status={testStatuses.navidromeUrl} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => testService('navidromeUrl')}
                    disabled={testingService === 'navidromeUrl'}
                  >
                    {testingService === 'navidromeUrl' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test'}
                  </Button>
                </div>
              </div>
              <Input
                id="navidromeUrl"
                name="navidromeUrl"
                type="url"
                placeholder="http://localhost:4533"
                value={config.navidromeUrl ?? ''}
                onChange={(e) => update('navidromeUrl', e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Music server for streaming and library management
              </p>
            </div>

            {/* Lidarr */}
            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Lidarr</Label>
                <div className="flex items-center gap-2">
                  <StatusBadge status={testStatuses.lidarrUrl} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => testService('lidarrUrl')}
                    disabled={testingService === 'lidarrUrl'}
                  >
                    {testingService === 'lidarrUrl' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test'}
                  </Button>
                </div>
              </div>
              <Input
                id="lidarrUrl"
                name="lidarrUrl"
                type="url"
                placeholder="http://localhost:8686"
                value={config.lidarrUrl ?? ''}
                onChange={(e) => update('lidarrUrl', e.target.value)}
              />
              <div>
                <Label htmlFor="lidarrApiKey">API Key</Label>
                <Input
                  id="lidarrApiKey"
                  name="lidarrApiKey"
                  type="password"
                  placeholder="Lidarr API key"
                  value={config.lidarrApiKey ?? ''}
                  onChange={(e) => update('lidarrApiKey', e.target.value)}
                  className="mt-1"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Automatic music collection management
              </p>
            </div>

            {/* MeTube */}
            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">MeTube</Label>
                <div className="flex items-center gap-2">
                  <StatusBadge status={testStatuses.metubeUrl} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => testService('metubeUrl')}
                    disabled={testingService === 'metubeUrl'}
                  >
                    {testingService === 'metubeUrl' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test'}
                  </Button>
                </div>
              </div>
              <Input
                id="metubeUrl"
                name="metubeUrl"
                type="url"
                placeholder="http://localhost:8081"
                value={config.metubeUrl ?? ''}
                onChange={(e) => update('metubeUrl', e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
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

          {/* Discovery Services Section */}
          <div className="p-4 border rounded-lg space-y-4 bg-purple-50 dark:bg-purple-900/10">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Discovery Services
            </h3>
            <p className="text-sm text-muted-foreground">
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
              <p className="text-sm text-muted-foreground mt-1">
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
              {testStatuses.lastfmApiKey && (
                <div className="mt-2">
                  <StatusBadge status={testStatuses.lastfmApiKey} />
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
            <p className="text-sm text-muted-foreground">
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
                  {backfillRunning ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Running...</>
                  ) : 'Import Scrobbles'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Your public Last.fm profile username. Imports up to 50 pages of recent scrobbles.
              </p>
            </div>

            {backfillProgress && (
              <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <div>{backfillProgress.detail}</div>
              </div>
            )}

            {backfillResult && (
              <div
                className={`flex items-start gap-2 p-3 rounded-md text-sm ${
                  backfillResult.success
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'bg-destructive/10 text-destructive'
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
                      Imported <strong>{backfillResult.imported?.toLocaleString()}</strong> scrobbles
                      {backfillResult.skipped ? ` (${backfillResult.skipped.toLocaleString()} duplicates skipped)` : ''}
                      . Recommendations and profile updated.
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
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {status}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
