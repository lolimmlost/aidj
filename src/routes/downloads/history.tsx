import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getDownloadHistory, exportDownloadHistory, clearDownloadHistory } from '@/lib/services/lidarr'

export const Route = createFileRoute('/downloads/history')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DownloadHistoryPage,
})

interface DownloadHistoryItem {
  id: string
  artistName: string
  foreignArtistId: string
  status: 'completed' | 'failed'
  addedAt: string
  completedAt: string
  size?: number
  errorMessage?: string
}

function DownloadHistoryPage() {
  const [history, setHistory] = useState<DownloadHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  const fetchHistory = async () => {
    try {
      const data = await getDownloadHistory()
      setHistory(data)
    } catch (error) {
      console.error('Error fetching download history:', error)
      toast.error('Failed to fetch download history')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportHistory = async () => {
    setIsExporting(true)
    try {
      const csvContent = await exportDownloadHistory()
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lidarr-history-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Download history exported successfully')
    } catch (error) {
      console.error('Error exporting history:', error)
      toast.error('Failed to export download history')
    } finally {
      setIsExporting(false)
    }
  }

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear all download history? This action cannot be undone.')) {
      return
    }

    setIsClearing(true)
    try {
      const success = await clearDownloadHistory()
      if (success) {
        setHistory([])
        toast.success('Download history cleared successfully')
      } else {
        toast.error('Failed to clear download history')
      }
    } catch (error) {
      console.error('Error clearing history:', error)
      toast.error('Failed to clear download history')
    } finally {
      setIsClearing(false)
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
    return status === 'completed' 
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800'
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading download history...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Download History</h1>
        <p className="text-muted-foreground">
          View and manage your download history
        </p>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>History Management</CardTitle>
          <CardDescription>
            Export or clear your download history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button
              onClick={handleExportHistory}
              disabled={isExporting || history.length === 0}
              variant="outline"
            >
              {isExporting ? 'Exporting...' : 'Export to CSV'}
            </Button>
            <Button
              onClick={handleClearHistory}
              disabled={isClearing || history.length === 0}
              variant="destructive"
            >
              {isClearing ? 'Clearing...' : 'Clear History'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      {history.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">
                {history.filter(h => h.status === 'completed').length}
              </div>
              <p className="text-sm text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600">
                {history.filter(h => h.status === 'failed').length}
              </div>
              <p className="text-sm text-muted-foreground">Failed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">
                {formatFileSize(history.reduce((sum, item) => sum + (item.size || 0), 0))}
              </div>
              <p className="text-sm text-muted-foreground">Total Size</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History List */}
      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Download History</CardTitle>
            <CardDescription>
              Showing {history.length} download records
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {history.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1 space-y-2">
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
                    
                    <div className="text-xs text-muted-foreground space-y-1">
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
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-lg font-medium mb-2">No Download History</h3>
            <p className="text-muted-foreground mb-4">
              Your download history is empty. Downloads will appear here once they complete.
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