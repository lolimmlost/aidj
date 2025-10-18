import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { monitorDownloads, cancelDownload } from '@/lib/services/lidarr'

export const Route = createFileRoute('/downloads/status')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DownloadStatusPage,
})

interface DownloadStatus {
  queue: Array<{
    id: string
    artistName: string
    foreignArtistId: string
    status: 'queued' | 'downloaded' | 'failed' | 'downloading'
    progress?: number
    estimatedCompletion?: string
    addedAt: string
    startedAt?: string
    completedAt?: string
    errorMessage?: string
  }>
  history: Array<{
    id: string
    artistName: string
    foreignArtistId: string
    status: 'completed' | 'failed'
    addedAt: string
    completedAt: string
    size?: number
    errorMessage?: string
  }>
  stats: {
    totalQueued: number
    totalDownloading: number
    totalCompleted: number
    totalFailed: number
    totalSize: number
  }
}

function DownloadStatusPage() {
  const [status, setStatus] = useState<DownloadStatus>({
    queue: [],
    history: [],
    stats: {
      totalQueued: 0,
      totalDownloading: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalSize: 0,
    }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchStatus = async () => {
    try {
      const data = await monitorDownloads()
      setStatus(data)
    } catch (error) {
      console.error('Error fetching download status:', error)
      toast.error('Failed to fetch download status')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  const handleCancelDownload = async (downloadId: string) => {
    try {
      const success = await cancelDownload(downloadId)
      if (success) {
        toast.success('Download cancelled successfully')
        await fetchStatus() // Refresh status
      } else {
        toast.error('Failed to cancel download')
      }
    } catch (error) {
      console.error('Error cancelling download:', error)
      toast.error('Failed to cancel download')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued':
        return 'bg-yellow-100 text-yellow-800'
      case 'downloading':
        return 'bg-blue-100 text-blue-800'
      case 'downloaded':
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

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
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Download Status</h1>
        <p className="text-muted-foreground">
          Monitor your download queue and history
        </p>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-5">
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Download Queue</CardTitle>
                <CardDescription>
                  Currently {status.queue.length} item(s) in queue
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setIsRefreshing(true)
                  fetchStatus()
                }}
                disabled={isRefreshing}
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {status.queue.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{item.artistName}</h3>
                      <span className={`text-xs px-2 py-1 rounded ${getStatusColor(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                    
                    {item.progress !== undefined && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Progress</span>
                          <span>{item.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
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
                      <p className="text-xs text-red-600">
                        Error: {item.errorMessage}
                      </p>
                    )}
                  </div>
                  
                  {item.status === 'queued' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleCancelDownload(item.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Download History */}
      {status.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Download History</CardTitle>
            <CardDescription>
              Recently completed downloads
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {status.history.slice(0, 10).map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{item.artistName}</h3>
                      <span className={`text-xs px-2 py-1 rounded ${getStatusColor(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                    
                    {item.size && (
                      <p className="text-sm text-muted-foreground">
                        Size: {formatFileSize(item.size)}
                      </p>
                    )}
                    
                    <div className="text-xs text-muted-foreground">
                      <p>Added: {formatDate(item.addedAt)}</p>
                      <p>Completed: {formatDate(item.completedAt)}</p>
                    </div>
                    
                    {item.errorMessage && (
                      <p className="text-xs text-red-600">
                        Error: {item.errorMessage}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {status.queue.length === 0 && status.history.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-6xl mb-4">📁</div>
            <h3 className="text-lg font-medium mb-2">No Downloads</h3>
            <p className="text-muted-foreground mb-4">
              Your download queue is empty. Start by adding some music to download.
            </p>
            <Button onClick={() => window.location.href = '/downloads'}>
              Browse Music
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}