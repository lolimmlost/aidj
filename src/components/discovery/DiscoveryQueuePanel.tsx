// Story 7.3: Discovery Queue Panel
// Displays pending and ready discovery items

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDiscoveryQueueStore, type DiscoveryItem } from '@/lib/stores/discovery-queue';
import { useDiscoveryMonitor } from '@/hooks/useDiscoveryMonitor';
import { useAudioStore } from '@/lib/stores/audio';
import { Play, Trash2, RefreshCw, Music, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Simple relative time formatter without date-fns
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function DiscoveryQueuePanel() {
  const { items, removeItem, clearCompleted } = useDiscoveryQueueStore();
  const { checkNow, pendingCount, readyCount } = useDiscoveryMonitor();
  const { playNow, setAIUserActionInProgress } = useAudioStore();

  const handlePlayReady = (item: DiscoveryItem) => {
    if (!item.navidromeSongId) {
      toast.error('Song not yet available in library');
      return;
    }

    setAIUserActionInProgress(true);

    const songForPlayer = {
      id: item.navidromeSongId,
      name: item.title,
      title: item.title,
      artist: item.artist,
      albumId: '',
      duration: 0,
      track: 1,
      url: '',
    };

    playNow(item.navidromeSongId, songForPlayer);
    toast.success(`Now playing: ${item.title}`);

    setTimeout(() => setAIUserActionInProgress(false), 2000);
  };

  const getStatusIcon = (status: DiscoveryItem['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'downloading':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: DiscoveryItem['status']) => {
    const variants: Record<DiscoveryItem['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'secondary',
      downloading: 'default',
      completed: 'default',
      ready: 'default',
      failed: 'destructive',
    };

    const labels: Record<DiscoveryItem['status'], string> = {
      pending: 'Searching...',
      downloading: 'Downloading',
      completed: 'Imported',
      ready: 'Ready to Play',
      failed: 'Failed',
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    );
  };

  if (items.length === 0) {
    return null; // Don't show panel if empty
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Discovery Queue</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {pendingCount} pending
              </Badge>
            )}
            {readyCount > 0 && (
              <Badge variant="default" className="text-xs bg-green-600">
                {readyCount} ready
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          Songs being downloaded from your discoveries
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkNow()}
            className="text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Check Now
          </Button>
          {readyCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearCompleted()}
              className="text-xs"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear Ready
            </Button>
          )}
        </div>

        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getStatusIcon(item.status)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.artist}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTimeAgo(item.requestedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-2">
                  {getStatusBadge(item.status)}

                  {item.status === 'ready' && (
                    <Button
                      variant="default"
                      size="icon"
                      className="h-8 w-8 bg-green-600 hover:bg-green-700"
                      onClick={() => handlePlayReady(item)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
