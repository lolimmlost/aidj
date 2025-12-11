/**
 * Shared utilities and types for download pages
 */

// Auto-refresh interval for status page (30 seconds)
export const STATUS_REFRESH_INTERVAL = 30000

// Types
export interface DownloadHistoryItem {
  id: string
  artistName: string
  foreignArtistId: string
  status: 'completed' | 'failed'
  addedAt: string
  completedAt: string
  size?: number
  errorMessage?: string
}

export interface DownloadQueueItem {
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
}

export interface WantedAlbum {
  id: string
  title: string
  artistName: string
  artistId: string
  releaseDate?: string
  monitored: boolean
}

export interface DownloadStats {
  totalQueued: number
  totalDownloading: number
  totalCompleted: number
  totalFailed: number
  totalWanted: number
  totalSize: number
}

export interface DownloadStatus {
  queue: DownloadQueueItem[]
  history: DownloadHistoryItem[]
  wanted: WantedAlbum[]
  stats: DownloadStats
}

// Utility functions
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString()
}

export type DownloadStatusType = 'queued' | 'downloading' | 'downloaded' | 'completed' | 'failed'

export function getStatusColor(status: DownloadStatusType | string): string {
  switch (status) {
    case 'queued':
      return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
    case 'downloading':
      return 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
    case 'downloaded':
    case 'completed':
      return 'bg-green-500/20 text-green-700 dark:text-green-400'
    case 'failed':
      return 'bg-red-500/20 text-red-700 dark:text-red-400'
    default:
      return 'bg-gray-500/20 text-gray-700 dark:text-gray-400'
  }
}

// Statistics helpers
export function calculateHistoryStats(history: DownloadHistoryItem[]) {
  return {
    completedCount: history.filter(h => h.status === 'completed').length,
    failedCount: history.filter(h => h.status === 'failed').length,
    totalSize: history.reduce((sum, item) => sum + (item.size || 0), 0),
  }
}
