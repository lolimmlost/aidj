import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { exportDownloadHistory, clearDownloadHistory } from '@/lib/services/lidarr'
import {
  type DownloadHistoryItem,
  formatFileSize,
  formatDate,
  getStatusColor,
  calculateHistoryStats,
} from '@/lib/utils/downloads'

export const Route = createFileRoute('/downloads/history')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DownloadHistoryPage,
})

function DownloadHistoryPage() {
  const navigate = useNavigate()
  const [history, setHistory] = useState<DownloadHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  const fetchHistory = useCallback(async () => {
    try {
      // Fetch from status endpoint which has richer data
      const response = await fetch('/api/lidarr/status')
      if (!response.ok) {
        throw new Error('Failed to fetch download status')
      }
      const data = await response.json()
      setHistory(data.history || [])
    } catch (error) {
      console.error('Error fetching download history:', error)
      toast.error('Failed to fetch download history')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  // Memoize statistics to avoid recalculating on every render
  const stats = useMemo(() => calculateHistoryStats(history), [history])

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

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchHistory()
  }

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Download History</h1>
          <p className="text-muted-foreground">
            View and manage your completed downloads
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
            onClick={() => navigate({ to: '/downloads/status' })}
          >
            Queue & Status
          </Button>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Statistics */}
      {history.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {stats.completedCount}
              </div>
              <p className="text-sm text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {stats.failedCount}
              </div>
              <p className="text-sm text-muted-foreground">Failed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">
                {formatFileSize(stats.totalSize)}
              </div>
              <p className="text-sm text-muted-foreground">Total Size</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actions */}
      {history.length > 0 && (
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
                disabled={isExporting}
                variant="outline"
              >
                {isExporting ? 'Exporting...' : 'Export to CSV'}
              </Button>
              <Button
                onClick={handleClearHistory}
                disabled={isClearing}
                variant="destructive"
              >
                {isClearing ? 'Clearing...' : 'Clear History'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History List */}
      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent Downloads</CardTitle>
            <CardDescription>
              Showing {history.length} download records
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="flex items-start justify-between p-4 border border-border/50 rounded-lg bg-card/50">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-foreground">{item.artistName}</h3>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStatusColor(item.status)}`}>
                        {item.status}
                      </span>
                    </div>

                    {item.size !== undefined && item.size > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Size: {formatFileSize(item.size)}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Added: {formatDate(item.addedAt)}</span>
                      <span>Completed: {formatDate(item.completedAt)}</span>
                    </div>

                    {item.errorMessage && (
                      <p className="text-xs text-red-500 dark:text-red-400">
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
            <Button onClick={() => navigate({ to: '/downloads' })}>
              Browse Music
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
