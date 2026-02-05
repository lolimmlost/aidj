import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLayout } from '@/components/ui/page-layout';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Youtube, Download, Music, Video, List, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { queryKeys, queryPresets, createSmartPollingInterval } from '@/lib/query';

export const Route = createFileRoute('/downloads/youtube')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: YouTubeDownloadPage,
});

interface MeTubeStatus {
  connected: boolean;
  version?: string;
  error?: string;
  history: Array<{
    id: string;
    title: string;
    url: string;
    status: 'finished' | 'error';
    filename?: string;
    folder?: string;
    timestamp?: string;
  }>;
  queue: Record<string, {
    id: string;
    title: string;
    url: string;
    status: string;
    percent?: number;
    speed?: string;
    eta?: string;
  }>;
  done: Record<string, unknown>;
  stats: {
    totalInQueue: number;
    totalCompleted: number;
    totalHistory: number;
  };
}

function YouTubeDownloadPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<'mp3' | 'mp4'>('mp3');
  const [isPlaylist, setIsPlaylist] = useState(false);

  // Fetch MeTube status with smart polling
  // - Polls every 5 seconds when tab is visible
  // - Polls every 15 seconds when tab is in background
  // - Stops polling when offline
  const { data: status, isLoading: statusLoading, error: statusError } = useQuery<MeTubeStatus>({
    queryKey: queryKeys.downloads.youtube.status(),
    queryFn: async () => {
      const res = await fetch('/api/metube/status');
      if (!res.ok) throw new Error('Failed to fetch MeTube status');
      return res.json();
    },
    // Smart polling: slower when tab is in background, stops when offline
    refetchInterval: createSmartPollingInterval(5000, {
      backgroundMultiplier: 3, // 15s in background
      maxInterval: 30000,
      stopWhenOffline: true,
    }),
    ...queryPresets.realtime,
  });

  // Add download mutation
  const addDownload = useMutation({
    mutationFn: async (data: { url: string; format: 'mp3' | 'mp4'; isPlaylist: boolean }) => {
      const res = await fetch('/api/metube/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to add download');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Download added to queue');
      setUrl('');
      queryClient.invalidateQueries({ queryKey: queryKeys.downloads.youtube.status() });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete download mutation
  const deleteDownload = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/metube/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, where: 'done' }),
      });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Deleted from history');
      queryClient.invalidateQueries({ queryKey: queryKeys.downloads.youtube.status() });
    },
    onError: () => {
      toast.error('Failed to delete');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    // Auto-detect if it's a playlist URL
    const isPlaylistUrl = url.includes('list=') || url.includes('/playlist');
    addDownload.mutate({ url: url.trim(), format, isPlaylist: isPlaylist || isPlaylistUrl });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <PageLayout
      title="YouTube / SoundCloud"
      description="Download from video platforms via MeTube"
      icon={<Youtube className="h-5 w-5" />}
      backLink="/downloads"
      backLabel="Downloads"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: '/downloads' })}>
            Lidarr Downloads
          </Button>
          <Button variant="outline" onClick={() => navigate({ to: '/downloads/status' })}>
            Download Status
          </Button>
        </div>
      }
    >
      {/* Connection Status */}
      {statusError ? (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>MeTube not configured or unreachable. Please check your settings.</span>
              <Button variant="link" onClick={() => navigate({ to: '/settings/services' })}>
                Configure MeTube
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : status && !status.connected ? (
        <Card className="border-yellow-500">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-yellow-600">
              <AlertCircle className="h-5 w-5" />
              <span>{status.error || 'MeTube connection failed'}</span>
              <Button variant="link" onClick={() => navigate({ to: '/settings/services' })}>
                Configure MeTube
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : status?.connected ? (
        <Card className="border-green-500">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span>MeTube connected (v{status.version})</span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Download Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add Download</CardTitle>
          <CardDescription>
            Paste a YouTube, SoundCloud, or Bandcamp URL to download
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="https://youtube.com/watch?v=... or search term"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={addDownload.isPending || !status?.connected}
                className="flex-1"
              />
              <Select value={format} onValueChange={(v) => setFormat(v as 'mp3' | 'mp4')}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp3">
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4" />
                      MP3
                    </div>
                  </SelectItem>
                  <SelectItem value="mp4">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      MP4
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="submit"
                disabled={addDownload.isPending || !url.trim() || !status?.connected}
              >
                {addDownload.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download
              </Button>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPlaylist}
                  onChange={(e) => setIsPlaylist(e.target.checked)}
                  className="rounded"
                />
                <List className="h-4 w-4" />
                Download as playlist
              </label>
              <span>Supported: YouTube, SoundCloud, Bandcamp, Vimeo, Dailymotion</span>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Queue Status */}
      {statusLoading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : status && Object.keys(status.queue).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Downloading ({Object.keys(status.queue).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.values(status.queue).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.title || 'Downloading...'}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{item.status}</span>
                      {item.percent !== undefined && <span>{item.percent}%</span>}
                      {item.speed && <span>{item.speed}</span>}
                      {item.eta && <span>ETA: {item.eta}</span>}
                    </div>
                  </div>
                  {item.percent !== undefined && (
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Download History */}
      {status && Array.isArray(status.history) && status.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Downloads ({status.history.length})</CardTitle>
            <CardDescription>
              Downloaded files are saved to your MeTube output folder
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {status.history.slice(0, 20).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {item.status === 'finished' ? (
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.title}</p>
                      {item.filename && (
                        <p className="text-sm text-muted-foreground truncate">{item.filename}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteDownload.mutate([item.id])}
                    disabled={deleteDownload.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {status && (!Array.isArray(status.history) || status.history.length === 0) && Object.keys(status.queue || {}).length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Youtube className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-semibold text-lg mb-2">No downloads yet</h3>
            <p className="text-muted-foreground">
              Paste a YouTube URL above to start downloading music
            </p>
          </CardContent>
        </Card>
      )}
    </PageLayout>
  );
}
