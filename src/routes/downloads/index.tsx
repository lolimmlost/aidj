import { createFileRoute, redirect, useSearch, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { search } from '@/lib/services/lidarr'
import { search as searchNavidrome } from '@/lib/services/navidrome'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Youtube, Music, Download, Clock, ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/downloads/')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      search: (search.search as string) || '',
    }
  },
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DownloadsPage,
})

interface SearchResult {
  id: string
  name: string
  type: 'artist' | 'album'
  artist?: string
  title?: string
  year?: number
  coverUrl?: string
  inNavidrome: boolean
  inLidarr: boolean
}

function DownloadsPage() {
  const { search: initialSearch } = useSearch({ from: '/downloads/' })
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState(initialSearch || '')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isAdding, setIsAdding] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    try {
      // Search in both Lidarr and Navidrome
      const [lidarrResults, navidromeResults] = await Promise.all([
        search(searchQuery),
        searchNavidrome(searchQuery, 0, 10)
      ])

      const combinedResults: SearchResult[] = []

      // Add Lidarr artists
      lidarrResults.artists.forEach(artist => {
        combinedResults.push({
          id: artist.id,
          name: artist.name,
          type: 'artist',
          inNavidrome: false, // Will be checked below
          inLidarr: true
        })
      })

      // Add Lidarr albums
      lidarrResults.albums.forEach(album => {
        combinedResults.push({
          id: album.id,
          name: album.title,
          type: 'album',
          artist: album.artistId,
          title: album.title,
          year: album.releaseDate ? new Date(album.releaseDate).getFullYear() : undefined,
          inNavidrome: false, // Will be checked below
          inLidarr: true
        })
      })

      // Check Navidrome availability
      navidromeResults.forEach(song => {
        const existing = combinedResults.find(r => 
          r.name.toLowerCase() === song.name.toLowerCase() || 
          (r.artist && r.artist.toLowerCase() === song.artist?.toLowerCase())
        )
        if (existing) {
          existing.inNavidrome = true
        }
      })

      setSearchResults(combinedResults)
    } catch (error) {
      console.error('Search error:', error)
      toast.error('Failed to search. Please try again.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleAddToLidarr = async (item: SearchResult) => {
    if (isAdding) return

    setIsAdding(item.id)
    const toastId = `lidarr-add-${item.id}`

    try {
      toast.loading(`🔍 Searching for "${item.name}"...`, { id: toastId, duration: Infinity })

      const response = await fetch('/api/lidarr/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ song: `${item.name}` }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(`✅ ${data.message || 'Added to download queue'}`, {
          id: toastId,
          description: 'Check Downloads > Status for progress',
          duration: 5000,
        })
        // Remove from results if successfully added
        setSearchResults(prev => prev.filter(r => r.id !== item.id))
      } else {
        toast.error(`❌ ${data.message || 'Failed to add to Lidarr'}`, {
          id: toastId,
          duration: 4000,
        })
      }
    } catch (error) {
      console.error('Add to Lidarr error:', error)
      toast.error('Failed to add to Lidarr. Please try again.', { id: toastId })
    } finally {
      setIsAdding(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // Auto-search when page loads with search param
  useEffect(() => {
    if (initialSearch && initialSearch.trim()) {
      handleSearch()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  return (
    <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          {/* Hidden on mobile since hamburger menu provides navigation */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: '/dashboard' })}
            className="hidden md:flex shrink-0 min-h-[44px] min-w-[44px]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold flex items-center gap-2">
              <Download className="h-5 w-5 sm:h-6 sm:w-6 lg:h-8 lg:w-8" />
              Downloads
            </h1>
            <p className="text-sm text-muted-foreground">
              Add music to your library
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pl-12 sm:pl-0">
          <Button
            variant="outline"
            onClick={() => navigate({ to: '/downloads/status' })}
            className="min-h-[44px] text-sm"
          >
            <Clock className="h-4 w-4 mr-2" />
            Queue
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate({ to: '/downloads/history' })}
            className="min-h-[44px] text-sm"
          >
            History
          </Button>
        </div>
      </div>

      {/* Download Options */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card
          className="cursor-pointer hover:border-primary transition-colors"
          onClick={() => navigate({ to: '/downloads/youtube' })}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Youtube className="h-6 w-6 text-red-500" />
              YouTube / SoundCloud
            </CardTitle>
            <CardDescription>
              Download audio from YouTube, SoundCloud, Bandcamp, and more via MeTube
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="secondary">
              Open YouTube Downloader
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-6 w-6 text-primary" />
              Lidarr Search
            </CardTitle>
            <CardDescription>
              Search and download full albums from Lidarr's music database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">Search below</p>
          </CardContent>
        </Card>
      </div>

      {/* Lidarr Search Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Search Lidarr
          </CardTitle>
          <CardDescription>
            Find artists or albums to add to your download queue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Search for artists or albums..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSearching}
            />
            <Button 
              onClick={handleSearch} 
              disabled={isSearching || !searchQuery.trim()}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search Loading Skeleton */}
      {isSearching && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              <CardTitle>Searching...</CardTitle>
            </div>
            <CardDescription>
              Looking for "{searchQuery}" in Lidarr and your library
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-square" />
                  <CardContent className="p-4 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-9 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {!isSearching && searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
            <CardDescription>
              Click "Add to Queue" to download
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {searchResults.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    {item.coverUrl ? (
                      <img 
                        src={item.coverUrl} 
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-muted-foreground text-4xl">
                        {item.type === 'artist' ? '🎵' : '💿'}
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h3 className="font-medium leading-tight">{item.name}</h3>
                          {item.artist && (
                            <p className="text-sm text-muted-foreground">
                              by {item.artist}
                            </p>
                          )}
                          {item.year && (
                            <p className="text-sm text-muted-foreground">
                              {item.year}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          {item.inNavidrome && (
                            <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              In Library
                            </div>
                          )}
                          <div className={`text-xs px-2 py-1 rounded ${
                            item.type === 'artist' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {item.type}
                          </div>
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        size="sm"
                        onClick={() => handleAddToLidarr(item)}
                        disabled={item.inNavidrome || isAdding === item.id}
                      >
                        {isAdding === item.id ? 'Adding...' : 
                         item.inNavidrome ? 'Already in Library' : 'Add to Queue'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {searchResults.length === 0 && searchQuery && !isSearching && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">
              No results found for "{searchQuery}"
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
