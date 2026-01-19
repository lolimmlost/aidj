import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  type DownloadStatus,
  formatFileSize,
  formatDate,
  getStatusColor,
  STATUS_REFRESH_INTERVAL,
} from '@/lib/utils/downloads'

export const Route = createFileRoute('/downloads/status')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DownloadStatusPage,
})

function DownloadStatusPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<DownloadStatus>({
    queue: [],
    history: [],
    wanted: [],
    stats: {
      totalQueued: 0,
      totalDownloading: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalWanted: 0,
      totalSize: 0,
    }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/lidarr/status')
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to fetch download status')
      }
      const data = await response.json()
      setStatus(data)
    } catch (error) {
      console.error('Error fetching download status:', error)
      toast.error('Failed to fetch download status')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  const handleCancelDownload = async (downloadId: string) => {
    try {
      const response = await fetch('/api/lidarr/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadId }),
      })
      if (response.ok) {
        toast.success('Download cancelled successfully')
        await fetchStatus() // Refresh status
      } else {
        const errorData = await response.json().catch(() => ({}))
        toast.error(errorData.message || 'Failed to cancel download')
      }
    } catch (error) {
      console.error('Error cancelling download:', error)
      toast.error('Failed to cancel download')
    }
  }

  const handleRetryDownload = async (downloadId: string, artistName: string) => {
    try {
      toast.loading(`Retrying download for ${artistName}...`, { id: 'retry-download' })
      const response = await fetch('/api/lidarr/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadId }),
      })
      if (response.ok) {
        toast.success(`Retry initiated for ${artistName}`, { id: 'retry-download' })
        await fetchStatus() // Refresh status
      } else {
        const errorData = await response.json().catch(() => ({}))
        toast.error(errorData.message || 'Failed to retry download', { id: 'retry-download' })
      }
    } catch (error) {
      console.error('Error retrying download:', error)
      toast.error('Failed to retry download', { id: 'retry-download' })
    }
  }

  const handleSearchAlbum = async (albumId: string, albumTitle: string) => {
    try {
      toast.loading(`Searching for "${albumTitle}"...`, { id: 'album-search' })
      const response = await fetch('/api/lidarr/search-album', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumId }),
      })

      if (response.ok) {
        toast.success(`Search initiated for "${albumTitle}"`, { id: 'album-search' })
        // Refresh after a short delay to allow search to start
        // Clean up any existing timeout first
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current)
        }
        searchTimeoutRef.current = setTimeout(() => fetchStatus(), 2000)
      } else {
        const data = await response.json()
        toast.error(data.message || 'Failed to search', { id: 'album-search' })
      }
    } catch (error) {
      console.error('Error searching album:', error)
      toast.error('Failed to trigger search', { id: 'album-search' })
    }
  }

  const handleUnmonitorAlbum = async (albumId: string, albumTitle: string) => {
    try {
      toast.loading(`Unmonitoring "${albumTitle}"...`, { id: 'unmonitor-album' })
      const response = await fetch('/api/lidarr/unmonitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumId }),
      })

      if (response.ok) {
        toast.success(`"${albumTitle}" unmonitored - it will no longer be downloaded`, { id: 'unmonitor-album' })
        await fetchStatus() // Refresh to remove from wanted list
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to unmonitor album', { id: 'unmonitor-album' })
      }
    } catch (error) {
      console.error('Error unmonitoring album:', error)
      toast.error('Failed to unmonitor album', { id: 'unmonitor-album' })
    }
  }

  // Auto-refresh and cleanup
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, STATUS_REFRESH_INTERVAL)
    return () => {
      clearInterval(interval)
      // Clean up search timeout on unmount
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [fetchStatus])

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading download status...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Download Status</h1>
          <p className="text-muted-foreground">
            Monitor your download queue and history
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => navigate({ to: '/dashboard' })}
          >
            ← Dashboard
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate({ to: '/downloads' })}
          >
            Search Music
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setIsRefreshing(true)
              fetchStatus()
            }}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-yellow-600">{status.stats.totalQueued}</div>
            <p className="text-sm text-muted-foreground">Queued</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{status.stats.totalDownloading}</div>
            <p className="text-sm text-muted-foreground">Downloading</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-orange-600">{status.stats.totalWanted}</div>
            <p className="text-sm text-muted-foreground">Searching</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{status.stats.totalCompleted}</div>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{status.stats.totalFailed}</div>
            <p className="text-sm text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{formatFileSize(status.stats.totalSize)}</div>
            <p className="text-sm text-muted-foreground">Total Size</p>
          </CardContent>
        </Card>
      </div>

      {/* Current Queue */}
      {status.queue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Download Queue</CardTitle>
            <CardDescription>
              Currently {status.queue.length} item(s) in queue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {status.queue.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 p-4 border border-border/50 rounded-lg bg-card/50">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-foreground">{item.artistName}</h3>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStatusColor(item.status)}`}>
                        {item.status}
                      </span>
                    </div>

                    {item.progress !== undefined && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Progress</span>
                          <span>{item.progress}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{ width: `${item.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {item.estimatedCompletion && (
                      <p className="text-sm text-muted-foreground">
                        Estimated completion: {formatDate(item.estimatedCompletion)}
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Added: {formatDate(item.addedAt)}
                    </p>

                    {item.errorMessage && (
                      <p className="text-xs text-red-500 dark:text-red-400">
                        Error: {item.errorMessage}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    {item.status === 'failed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetryDownload(item.id, item.artistName)}
                        className="border-orange-500/50 text-orange-600 hover:bg-orange-500/10 dark:text-orange-400"
                      >
                        Retry
                      </Button>
                    )}
                    {(item.status === 'queued' || item.status === 'downloading' || item.status === 'failed') && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleCancelDownload(item.id)}
                      >
                        {item.status === 'failed' ? 'Remove' : 'Cancel'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Download History Link */}
      {status.history.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{status.history.length} completed downloads</p>
                <p className="text-sm text-muted-foreground">View your full download history</p>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate({ to: '/downloads/history' })}
              >
                View History
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wanted/Missing Albums */}
      {status.wanted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Searching for Albums</span>
              <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                {status.wanted.length} missing
              </span>
              {status.wanted.some(a => a.searchStatus === 'searching') && (
                <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 animate-pulse">
                  Active searches
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Albums that Lidarr is searching for via Soulseek. "Searching" means actively querying, "Searched" means waiting for results.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {status.wanted.slice(0, 20).map((album) => {
                // Determine status styling
                const isSearching = album.searchStatus === 'searching';
                const wasSearchedRecently = album.searchStatus === 'searched_recently';
                const borderClass = isSearching
                  ? 'border-blue-300 dark:border-blue-700'
                  : wasSearchedRecently
                    ? 'border-green-200 dark:border-green-900/50'
                    : 'border-orange-200 dark:border-orange-900/50';
                const bgClass = isSearching
                  ? 'bg-blue-50/50 dark:bg-blue-900/10'
                  : wasSearchedRecently
                    ? 'bg-green-50/50 dark:bg-green-900/10'
                    : 'bg-orange-50/50 dark:bg-orange-900/10';

                return (
                  <div key={album.id} className={`flex items-center justify-between p-4 border rounded-lg ${borderClass} ${bgClass}`}>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">{album.title}</h3>
                        {/* Search Status Badge */}
                        {isSearching && (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1">
                            <span className="animate-spin h-3 w-3 border border-blue-600 border-t-transparent rounded-full"></span>
                            Searching...
                          </span>
                        )}
                        {wasSearchedRecently && (
                          <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            Searched - Awaiting Results
                          </span>
                        )}
                        {!isSearching && !wasSearchedRecently && album.monitored && (
                          <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                            Waiting
                          </span>
                        )}
                        {album.grabbed && (
                          <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                            Grabbed
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        by {album.artistName}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {album.releaseDate && (
                          <span>Released: {new Date(album.releaseDate).toLocaleDateString()}</span>
                        )}
                        {album.lastSearched && (
                          <span>Last searched: {new Date(album.lastSearched).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSearchAlbum(album.id, album.title)}
                        disabled={isSearching}
                        className={isSearching
                          ? 'opacity-50 cursor-not-allowed'
                          : 'border-orange-500/50 text-orange-600 hover:bg-orange-500/10'
                        }
                      >
                        {isSearching ? 'Searching...' : 'Search Again'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnmonitorAlbum(album.id, album.title)}
                        className="border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                      >
                        Unmonitor
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {status.queue.length === 0 && status.history.length === 0 && status.wanted.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-6xl mb-4">📁</div>
            <h3 className="text-lg font-medium mb-2">No Downloads</h3>
            <p className="text-muted-foreground mb-4">
              Your download queue is empty. Start by adding some music to download.
            </p>
            <Button onClick={() => navigate({ to: '/downloads' })}>
              Browse Music
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}