import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Music,
  ExternalLink,
  FolderOpen,
} from 'lucide-react';

interface DownloadQueueItem {
  id: string;
  artistName: string;
  foreignArtistId?: string;
  status: 'queued' | 'downloading' | 'downloaded' | 'failed';
  progress?: number;
  estimatedCompletion?: string;
  errorMessage?: string;
}

interface MeTubeDownload {
  id: string;
  title: string;
  url: string;
  status: 'pending' | 'downloading' | 'finished' | 'error';
  percent?: number;
  speed?: string;
  eta?: string;
  filename?: string;
  folder?: string;
}

export function DownloadQueuePanel() {
  const [activeTab, setActiveTab] = useState<'lidarr' | 'metube'>('lidarr');
  const queryClient = useQueryClient();

  // Fetch download status
  const { data: downloadStatus, isLoading, refetch } = useQuery({
    queryKey: ['download-queue'],
    queryFn: async () => {
      const response = await fetch('/api/playlists/download');
      if (!response.ok) throw new Error('Failed to fetch download status');
      return response.json();
    },
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Cancel download mutation
  const cancelMutation = useMutation({
    mutationFn: async ({ downloadId, service }: { downloadId: string; service: 'lidarr' | 'metube' }) => {
      const response = await fetch(`/api/playlists/download?downloadId=${downloadId}&service=${service}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to cancel download');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Download cancelled');
      queryClient.invalidateQueries({ queryKey: ['download-queue'] });
    },
    onError: (error: Error) => {
      toast.error('Failed to cancel download', { description: error.message });
    },
  });

  const lidarrQueue = downloadStatus?.data?.lidarrQueue || [];
  const lidarrHistory = downloadStatus?.data?.lidarrHistory || [];
  const metubeQueue = downloadStatus?.data?.metubeQueue || [];
  const metubeDone = downloadStatus?.data?.metubeDone || [];

  const lidarrStats = downloadStatus?.data?.services?.lidarr?.stats;
  const metubeStats = downloadStatus?.data?.services?.metube;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Download className="h-5 w-5" />
          Download Queue
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'lidarr' | 'metube')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="lidarr" className="flex items-center gap-2">
            <Music className="h-4 w-4" />
            Lidarr
            {lidarrStats && (
              <Badge variant="secondary" className="ml-1">
                {lidarrStats.totalQueued + lidarrStats.totalDownloading}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="metube" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            MeTube
            {metubeStats && (
              <Badge variant="secondary" className="ml-1">
                {metubeStats.queueCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Lidarr Tab */}
        <TabsContent value="lidarr" className="mt-4">
          {lidarrStats && (
            <div className="grid grid-cols-4 gap-2 mb-4 text-center text-sm">
              <div className="p-2 rounded bg-muted">
                <p className="font-medium">{lidarrStats.totalQueued}</p>
                <p className="text-xs text-muted-foreground">Queued</p>
              </div>
              <div className="p-2 rounded bg-muted">
                <p className="font-medium">{lidarrStats.totalDownloading}</p>
                <p className="text-xs text-muted-foreground">Downloading</p>
              </div>
              <div className="p-2 rounded bg-muted">
                <p className="font-medium">{lidarrStats.totalCompleted}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="p-2 rounded bg-muted">
                <p className="font-medium">{lidarrStats.totalFailed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          )}

          <ScrollArea className="h-[300px]">
            {lidarrQueue.length === 0 && lidarrHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Music className="h-12 w-12 mb-2 opacity-50" />
                <p>No active downloads</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Active queue */}
                {lidarrQueue.map((item: DownloadQueueItem) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.artistName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge status={item.status} />
                          {item.estimatedCompletion && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {item.estimatedCompletion}
                            </span>
                          )}
                        </div>
                      </div>
                      {(item.status === 'queued' || item.status === 'downloading') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelMutation.mutate({ downloadId: item.id, service: 'lidarr' })}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {item.status === 'downloading' && typeof item.progress === 'number' && (
                      <Progress value={item.progress} className="mt-2 h-1" />
                    )}
                    {item.status === 'failed' && item.errorMessage && (
                      <p className="text-xs text-destructive mt-2">{item.errorMessage}</p>
                    )}
                  </div>
                ))}

                {/* Recent history */}
                {lidarrHistory.length > 0 && (
                  <>
                    <div className="text-xs text-muted-foreground pt-2 pb-1">Recent History</div>
                    {lidarrHistory.slice(0, 10).map((item: { id: string; artistName: string; status: 'completed' | 'failed'; completedAt: string }) => (
                      <div
                        key={item.id}
                        className="p-2 rounded-lg border bg-muted/50 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{item.artistName}</span>
                          {item.status === 'completed' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* MeTube Tab */}
        <TabsContent value="metube" className="mt-4">
          <div className="p-3 rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-sm mb-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Manual Organization Required</p>
                <p className="text-xs mt-1">
                  MeTube downloads are saved to a default location. You'll need to organize them manually.
                </p>
              </div>
            </div>
          </div>

          <ScrollArea className="h-[250px]">
            {metubeQueue.length === 0 && metubeDone.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Download className="h-12 w-12 mb-2 opacity-50" />
                <p>No YouTube downloads</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Active queue */}
                {metubeQueue.map((item: MeTubeDownload) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge status={item.status} />
                          {item.speed && (
                            <span className="text-xs text-muted-foreground">
                              {item.speed}
                            </span>
                          )}
                          {item.eta && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {item.eta}
                            </span>
                          )}
                        </div>
                      </div>
                      {(item.status === 'pending' || item.status === 'downloading') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelMutation.mutate({ downloadId: item.id, service: 'metube' })}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {item.status === 'downloading' && typeof item.percent === 'number' && (
                      <Progress value={item.percent} className="mt-2 h-1" />
                    )}
                  </div>
                ))}

                {/* Completed downloads */}
                {metubeDone.length > 0 && (
                  <>
                    <div className="text-xs text-muted-foreground pt-2 pb-1">
                      Completed (needs organization)
                    </div>
                    {metubeDone.slice(0, 10).map((item: MeTubeDownload) => (
                      <div
                        key={item.id}
                        className="p-2 rounded-lg border bg-green-500/5 border-green-500/30 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="truncate block">{item.title}</span>
                            {item.filename && (
                              <span className="text-xs text-muted-foreground truncate block">
                                {item.filename}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                // Open folder would require system integration
                                toast.info('Open the MeTube downloads folder to organize this file');
                              }}
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'queued':
    case 'pending':
      return (
        <Badge variant="secondary" className="text-xs">
          <Clock className="h-3 w-3 mr-1" />
          Queued
        </Badge>
      );
    case 'downloading':
      return (
        <Badge variant="default" className="text-xs bg-blue-500">
          <Download className="h-3 w-3 mr-1 animate-pulse" />
          Downloading
        </Badge>
      );
    case 'downloaded':
    case 'finished':
      return (
        <Badge variant="default" className="text-xs bg-green-500">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Complete
        </Badge>
      );
    case 'failed':
    case 'error':
      return (
        <Badge variant="destructive" className="text-xs">
          <AlertCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
