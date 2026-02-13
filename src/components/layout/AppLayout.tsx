import React, { useState, useCallback, useMemo, memo, useEffect } from 'react';
import { Link, useRouterState, useNavigate } from '@tanstack/react-router';
import {
  Home,
  Search,
  Music,
  ListMusic,
  Radio,
  Download,
  Settings,
  Heart,
  Clock,
  Plus,
  ChevronRight,
  Disc3,
  Sparkles,
  BarChart3,
  RefreshCw,
  ListPlus,
  Play,
  User,
  TrendingUp,
  ListTodo,
  LogOut,
} from 'lucide-react';
import authClient from '@/lib/auth/auth-client';
import { MusicTasteDebugPanel } from '@/components/debug/MusicTasteDebugPanel';
import { ThemeToggle } from '~/components/theme-toggle';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAudioStore } from '@/lib/stores/audio';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlayerBar } from './PlayerBar';
import { QueuePanel } from '@/components/ui/queue-panel';
import { MobileNav } from '@/components/ui/mobile-nav';
import { toast } from 'sonner';
import { useDeferredRender } from '@/lib/utils/lazy-components';

// Helper to get cover art URL from Navidrome
const getCoverArtUrl = (albumId: string | undefined, size: number = 300) => {
  if (!albumId) return null;
  return `/api/navidrome/rest/getCoverArt?id=${albumId}&size=${size}`;
};

// Sidebar Album Art component with auto-fetch for albumId
const SidebarAlbumArt = ({
  albumId,
  songId,
  artist,
  isPlaying = false,
}: {
  albumId?: string;
  songId?: string;
  artist?: string;
  isPlaying?: boolean;
}) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [resolvedAlbumId, setResolvedAlbumId] = useState<string | null>(albumId || null);

  // Fetch albumId from Navidrome if not provided but songId is available
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (albumId) {
      setResolvedAlbumId(albumId);
      return;
    }

    if (!songId) {
      setResolvedAlbumId(null);
      return;
    }

    // Fetch song metadata to get albumId
    const fetchAlbumId = async () => {
      try {
        const response = await fetch(`/api/navidrome/rest/getSong?id=${songId}&f=json`);
        if (response.ok) {
          const data = await response.json();
          const song = data['subsonic-response']?.song;
          if (song?.albumId) {
            setResolvedAlbumId(song.albumId);
          }
        }
      } catch (error) {
        console.error('Failed to fetch album ID:', error);
      }
    };

    fetchAlbumId();
  }, [albumId, songId]);

  // Reset states when albumId changes
  useEffect(() => {
    setImgError(false);
    setImgLoaded(false);
  }, [resolvedAlbumId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const coverUrl = getCoverArtUrl(resolvedAlbumId || undefined, 300);
  const initials = artist?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '♪';

  return (
    <div className="aspect-square rounded-xl bg-gradient-to-br from-primary/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center relative overflow-hidden shadow-lg">
      {coverUrl && !imgError ? (
        <>
          <img
            src={coverUrl}
            alt="Album cover"
            className={cn(
              'w-full h-full object-cover transition-opacity duration-300',
              imgLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Music className="h-12 w-12 text-primary/40 animate-pulse" />
            </div>
          )}
        </>
      ) : (
        <span className="font-bold text-5xl text-primary/40">
          {initials}
        </span>
      )}
      {isPlaying && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
            <div className="w-1 h-4 bg-white/80 rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0s' }} />
            <div className="w-1 h-6 bg-white/80 rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.15s' }} />
            <div className="w-1 h-4 bg-white/80 rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.3s' }} />
            <div className="w-1 h-5 bg-white/80 rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.45s' }} />
          </div>
        </>
      )}
    </div>
  );
};

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Main application layout with three-column design
 * Inspired by modern music players like Spotify, Melo, Playcloud
 *
 * Layout:
 * - Left sidebar: Navigation + Playlists (~220px)
 * - Center: Main content (flexible)
 * - Right sidebar: Now Playing + Recommendations (~280px)
 * - Bottom: Fixed audio player bar
 */
export function AppLayout({ children }: AppLayoutProps) {
  const { playlist, currentSongIndex } = useAudioStore();
  const hasActiveSong = playlist.length > 0 && currentSongIndex >= 0;

  // Debug panel state with localStorage persistence
  const [showDebugPanel, setShowDebugPanel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('music-taste-debug-panel') === 'true';
    }
    return false;
  });

  // Persist debug panel visibility to localStorage
  useEffect(() => {
    localStorage.setItem('music-taste-debug-panel', showDebugPanel.toString());
  }, [showDebugPanel]);

  // Keyboard shortcut: Ctrl+Shift+D to toggle debug panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setShowDebugPanel((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background">
      {/* Mobile Navigation - Only visible below md breakpoint */}
      <MobileNav />

      {/* Main content area with sidebars */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Navigation & Playlists */}
        <LeftSidebar />

        {/* Center - Main Content */}
        <main className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className={cn(
              "min-h-full",
              hasActiveSong ? "pb-24" : "pb-6"
            )}>
              {children}
            </div>
          </ScrollArea>
        </main>

        {/* Right Sidebar - Now Playing & Recommendations */}
        <RightSidebar />
      </div>

      {/* Bottom Player Bar - Fixed to viewport bottom on all screen sizes */}
      {/* CRITICAL: Always render PlayerBar to preserve audio elements across state changes.
         Unmounting destroys <audio> elements and kills playback. Hide visually instead. */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]",
        !hasActiveSong && "hidden"
      )}>
        <PlayerBar />
      </div>

      {/* Queue Panel - Slide-out drawer */}
      <QueuePanel />

      {/* Music Taste Debug Panel - Toggle with Ctrl+Shift+D */}
      {showDebugPanel && (
        <MusicTasteDebugPanel onClose={() => setShowDebugPanel(false)} />
      )}
    </div>
  );
}

/**
 * Left Sidebar Component
 * Contains: Logo, Navigation, Your Music section, Playlists
 */
function LeftSidebar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSyncingLiked, setIsSyncingLiked] = useState(false);

  // Fetch user playlists
  const { data: playlistsData } = useQuery({
    queryKey: ['playlists'],
    queryFn: async () => {
      const response = await fetch('/api/playlists');
      if (!response.ok) return { playlists: [] };
      const json = await response.json();
      return json.data || { playlists: [] };
    },
  });

  const playlists = playlistsData?.playlists || [];

  // Find the Liked Songs playlist
  const likedSongsPlaylist = playlists.find(
    (p: { name: string }) => p.name === '❤️ Liked Songs'
  );

  // Sync Liked Songs from Navidrome
  const handleSyncLikedSongs = useCallback(async () => {
    setIsSyncingLiked(true);
    try {
      const response = await fetch('/api/playlists/liked-songs/sync', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Sync failed');
      const data = await response.json();
      toast.success(`Synced ${data.data?.songCount || 0} liked songs`);
      // Refresh playlists
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      // Navigate to the liked songs playlist if it exists
      if (data.data?.playlist?.id) {
        navigate({ to: `/playlists/${data.data.playlist.id}` });
      }
    } catch (error) {
      toast.error('Failed to sync liked songs');
      console.error(error);
    } finally {
      setIsSyncingLiked(false);
    }
  }, [queryClient, navigate]);

  return (
    <aside className="hidden md:flex flex-col w-56 border-r bg-card/30 flex-shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b">
        <Link to="/dashboard" className="flex items-center gap-2 group">
          <div className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Disc3 className="h-5 w-5 text-primary" />
          </div>
          <span className="font-bold text-lg tracking-tight">AIDJ</span>
        </Link>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-6">
          {/* Main Navigation */}
          <nav className="space-y-1">
            <NavItem
              to="/dashboard"
              icon={<Home className="h-4 w-4" />}
              label="Home"
              active={currentPath === '/dashboard' || currentPath === '/dashboard/'}
            />
            <NavItem
              to="/dashboard/discover"
              icon={<Sparkles className="h-4 w-4" />}
              label="Discover"
              active={currentPath.includes('/dashboard/discover')}
            />
            <NavItem
              to="/library/search"
              icon={<Search className="h-4 w-4" />}
              label="Search"
              active={currentPath.includes('/library/search')}
            />
            <NavItem
              to="/library/artists"
              icon={<Music className="h-4 w-4" />}
              label="Browse"
              active={currentPath.includes('/library/artists')}
            />
            <NavItem
              to="/dj"
              icon={<Radio className="h-4 w-4" />}
              label="DJ Mode"
              active={currentPath.startsWith('/dj')}
            />
          </nav>

          {/* Your Music Section */}
          <div>
            <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Your Music
            </h3>
            <nav className="space-y-1">
              <NavItem
                to="/playlists"
                icon={<ListMusic className="h-4 w-4" />}
                label="Playlists"
                active={currentPath === '/playlists'}
              />
              {/* Liked Songs - navigates to playlist or syncs if not exists */}
              {likedSongsPlaylist ? (
                <Link
                  to={`/playlists/${likedSongsPlaylist.id}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
                    currentPath === `/playlists/${likedSongsPlaylist.id}`
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Heart className="h-4 w-4 fill-current text-red-500" />
                  <span>Liked Songs</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 ml-auto hover:bg-primary/10"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSyncLikedSongs();
                    }}
                    disabled={isSyncingLiked}
                  >
                    <RefreshCw className={cn("h-3 w-3", isSyncingLiked && "animate-spin")} />
                  </Button>
                </Link>
              ) : (
                <button
                  onClick={handleSyncLikedSongs}
                  disabled={isSyncingLiked}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors w-full",
                    "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Heart className="h-4 w-4" />
                  <span>{isSyncingLiked ? 'Syncing...' : 'Sync Liked Songs'}</span>
                  {isSyncingLiked && <RefreshCw className="h-3 w-3 ml-auto animate-spin" />}
                </button>
              )}
              <NavItem
                to="/dashboard/analytics"
                icon={<BarChart3 className="h-4 w-4" />}
                label="Analytics"
                active={currentPath.includes('/analytics')}
              />
              <NavItem
                to="/music-identity"
                icon={<User className="h-4 w-4" />}
                label="Music Identity"
                active={currentPath.startsWith('/music-identity')}
              />
              <NavItem
                to="/downloads"
                icon={<Download className="h-4 w-4" />}
                label="Downloads"
                active={currentPath.startsWith('/downloads')}
              />
              <NavItem
                to="/tasks"
                icon={<ListTodo className="h-4 w-4" />}
                label="Tasks"
                active={currentPath.startsWith('/tasks')}
              />
              <NavItem
                to="/dashboard/library-growth"
                icon={<TrendingUp className="h-4 w-4" />}
                label="Library Growth"
                active={currentPath.includes('/library-growth')}
              />
            </nav>
          </div>

          {/* Recently Played Section */}
          <RecentlyPlayedSection />

          {/* Playlists Section */}
          <div>
            <div className="flex items-center justify-between px-3 mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Playlists
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-primary/10"
                asChild
              >
                <Link to="/playlists">
                  <Plus className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
            <nav className="space-y-0.5">
              {playlists
                ?.filter((p: { name: string }) => p.name !== '❤️ Liked Songs')
                .slice(0, 8)
                .map((playlist: { id: string; name: string; songCount?: number }) => (
                <Link
                  key={playlist.id}
                  to={`/playlists/${playlist.id}`}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors group/playlist",
                    "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                    currentPath === `/playlists/${playlist.id}` && "bg-accent text-foreground"
                  )}
                >
                  <div className="w-8 h-8 rounded bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                    {playlist.name.includes('❤️') ? (
                      <Heart className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <ListMusic className="h-3.5 w-3.5 text-primary/70" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 scroll-text-container">
                    <span className="scroll-text">{playlist.name}</span>
                  </div>
                </Link>
              ))}
              {playlists?.filter((p: { name: string }) => p.name !== '❤️ Liked Songs').length > 8 && (
                <Link
                  to="/playlists"
                  className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>See all playlists</span>
                  <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </nav>
          </div>
        </div>
      </ScrollArea>

      {/* Bottom Settings & Sign Out */}
      <div className="p-3 border-t space-y-1">
        <div className="flex items-center gap-2">
          <NavItem
            to="/settings"
            icon={<Settings className="h-4 w-4" />}
            label="Settings"
            active={currentPath.startsWith('/settings')}
          />
          <ThemeToggle />
        </div>
        <button
          onClick={async () => {
            await authClient.signOut();
            navigate({ to: '/login' });
          }}
          className="flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

/**
 * Right Sidebar Component
 * Layout based on reference image 1:
 * - Now Playing (large album art) at top
 * - Top Artists (numbered 1-5)
 * - Most Played Songs
 * - Recommendations at bottom
 *
 * Uses deferred data loading to reduce initial page load time.
 * Non-critical sidebar data is fetched after the main content renders.
 */
function RightSidebar() {
  const { playlist, currentSongIndex, isPlaying, playNow } = useAudioStore();
  const currentSong = playlist[currentSongIndex];

  // Deferred loading: Wait before fetching non-critical sidebar data
  const shouldFetchSidebarData = useDeferredRender(800);

  // Fetch top artists - deferred to reduce initial load
  const { data: topArtists } = useQuery({
    queryKey: ['top-artists'],
    queryFn: async () => {
      const response = await fetch('/api/library/top-artists?limit=5');
      if (!response.ok) return [];
      const data = await response.json();
      return data.artists || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: shouldFetchSidebarData, // Defer until after initial render
  });

  // Fetch most played songs - deferred
  const { data: mostPlayedSongs } = useQuery({
    queryKey: ['most-played-songs'],
    queryFn: async () => {
      const response = await fetch('/api/library/most-played?limit=5');
      if (!response.ok) return [];
      const data = await response.json();
      return data.songs || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: shouldFetchSidebarData, // Defer until after initial render
  });

  // Fetch recommendations - deferred with longer delay (lowest priority)
  const shouldFetchRecommendations = useDeferredRender(1500);
  const { data: recommendations } = useQuery({
    queryKey: ['sidebar-recommendations'],
    queryFn: async () => {
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'recommend popular songs' }),
      });
      if (!response.ok) return null;
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: shouldFetchRecommendations, // Defer even more - lowest priority
  });

  // Rank colors for top artists
  const rankColors = [
    'text-yellow-500', // 1st - gold
    'text-gray-400',   // 2nd - silver
    'text-amber-600',  // 3rd - bronze
    'text-primary/70', // 4th
    'text-primary/50', // 5th
  ];

  return (
    <aside className="hidden xl:flex flex-col w-72 border-l bg-card/30 flex-shrink-0">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Now Playing - Large Album Art at Top */}
          {currentSong && (
            <div className="space-y-2">
              {/* Large Album Art */}
              <SidebarAlbumArt
                albumId={currentSong.albumId}
                songId={currentSong.id}
                artist={currentSong.artist}
                isPlaying={isPlaying}
              />
              {/* Song Info Below Art */}
              <div className="text-center px-2">
                <h4 className="font-semibold truncate">{currentSong.name || currentSong.title}</h4>
                <p className="text-sm text-muted-foreground truncate">{currentSong.artist || 'Unknown Artist'}</p>
              </div>
            </div>
          )}

          {/* Top Artists - Numbered List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Top Artists
              </h3>
              <Link to="/library/artists" className="text-xs text-primary hover:underline">
                See all
              </Link>
            </div>
            <div className="space-y-1">
              {topArtists?.length > 0 ? (
                topArtists.slice(0, 5).map((artist: { id: string; name: string; albumCount?: number; songCount?: number; totalPlays?: number }, index: number) => (
                  <Link
                    key={artist.id}
                    to={`/library/artists/${artist.id}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors group"
                  >
                    <span className={cn("font-bold text-lg w-5", rankColors[index])}>
                      {index + 1}
                    </span>
                    <div className="w-10 h-10 rounded-md bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-orange-500/70">
                        {artist.name.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {artist.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {artist.totalPlays ? `${artist.totalPlays} plays` : `${artist.songCount || 0} songs`}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))
              ) : (
                // Loading placeholder
                [...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                    <div className="w-5 h-5 bg-muted rounded" />
                    <div className="w-10 h-10 rounded-md bg-muted" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 bg-muted rounded w-3/4" />
                      <div className="h-2 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Most Played Songs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Most Played
              </h3>
            </div>
            <div className="space-y-1">
              {mostPlayedSongs?.length > 0 ? (
                mostPlayedSongs.slice(0, 5).map((song: { id: string; name: string; artist: string; album?: string; url: string }, index: number) => (
                  <div
                    key={song.id}
                    onClick={() => playNow(song.id, {
                      id: song.id,
                      name: song.name,
                      artist: song.artist,
                      url: song.url,
                      albumId: '',
                      duration: 0,
                      track: 0,
                    })}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer group"
                  >
                    <span className={cn("font-bold text-lg w-5", rankColors[index])}>
                      {index + 1}
                    </span>
                    <div className="w-10 h-10 rounded-md bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-green-500/70">
                        {song.artist?.slice(0, 2).toUpperCase() || '♪'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {song.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                  </div>
                ))
              ) : (
                // Loading placeholder
                [...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                    <div className="w-5 h-5 bg-muted rounded" />
                    <div className="w-10 h-10 rounded-md bg-muted" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 bg-muted rounded w-3/4" />
                      <div className="h-2 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recently Played Songs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recently Played
              </h3>
            </div>
            <div className="space-y-1">
              {playlist.length > 0 ? (
                // Show from current playlist/queue
                playlist.slice(0, 5).map((song, index) => (
                  <div
                    key={`${song.id}-${index}`}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg transition-colors cursor-pointer",
                      "hover:bg-accent/50",
                      index === currentSongIndex && "bg-accent"
                    )}
                  >
                    <div className="w-10 h-10 rounded-md bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-blue-500/70">
                        {song.artist?.slice(0, 2).toUpperCase() || '♪'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{song.name || song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                    {index === currentSongIndex && isPlaying && (
                      <div className="flex gap-0.5">
                        <div className="w-0.5 h-3 bg-primary animate-[wave_1s_ease-in-out_infinite]" />
                        <div className="w-0.5 h-4 bg-primary animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.1s' }} />
                        <div className="w-0.5 h-3 bg-primary animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }} />
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground px-2">No songs played yet</p>
              )}
            </div>
          </div>

          {/* Recommendations */}
          <RecommendationsSection recommendations={recommendations} />
        </div>
      </ScrollArea>
    </aside>
  );
}

/**
 * Recommendations Section with Queue buttons
 */
interface Recommendation {
  song: string;
  foundInLibrary?: boolean;
  songId?: string;
  url?: string;
  actualSong?: {
    id: string;
    url: string;
    name: string;
    artist: string;
    album?: string;
    albumId?: string;
    duration?: number;
    track?: number;
  };
}

const RecommendationsSection = memo(function RecommendationsSection({ recommendations }: { recommendations: Recommendation[] }) {
  const { addToQueueEnd, addPlaylist } = useAudioStore();

  const handleAddToQueue = useCallback((rec: Recommendation) => {
    if (rec.actualSong || (rec.songId && rec.url)) {
      const song = rec.actualSong || {
        id: rec.songId!,
        url: rec.url!,
        name: rec.song.split(' - ')[1] || rec.song,
        artist: rec.song.split(' - ')[0] || 'Unknown',
        albumId: '',
        duration: 0,
        track: 0,
      };
      addToQueueEnd(song);
      toast.success(`Added to queue: ${song.name}`);
    } else {
      toast.error('Song not available in library');
    }
  }, [addToQueueEnd]);

  const handlePlayNow = useCallback((rec: Recommendation) => {
    if (rec.actualSong || (rec.songId && rec.url)) {
      const song = rec.actualSong || {
        id: rec.songId!,
        url: rec.url!,
        name: rec.song.split(' - ')[1] || rec.song,
        artist: rec.song.split(' - ')[0] || 'Unknown',
        albumId: '',
        duration: 0,
        track: 0,
      };
      // Use addPlaylist which sets playlist, currentSongIndex, and isPlaying atomically
      addPlaylist([song]);
      toast.success(`Now playing: ${song.name}`);
    } else {
      toast.error('Song not available in library');
    }
  }, [addPlaylist]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Recommended
        </h3>
        <Link to="/dashboard" className="text-xs text-primary hover:underline">
          See all
        </Link>
      </div>
      <div className="space-y-1">
        {recommendations?.data?.recommendations?.slice(0, 4).map((rec: Recommendation, index: number) => (
          <div
            key={index}
            className={cn(
              "flex items-center gap-2 p-2 rounded-lg transition-colors group",
              "hover:bg-accent/50",
              rec.foundInLibrary && "border-l-2 border-green-500"
            )}
          >
            <div className="w-10 h-10 rounded-md bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-4 w-4 text-purple-500/70" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{rec.song.split(' - ')[1] || rec.song}</p>
              <p className="text-xs text-muted-foreground truncate">{rec.song.split(' - ')[0]}</p>
            </div>
            {/* Action buttons - show on hover */}
            {rec.foundInLibrary && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-primary/20 hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayNow(rec);
                  }}
                  title="Play now"
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-primary/20 hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToQueue(rec);
                  }}
                  title="Add to queue"
                >
                  <ListPlus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )) || (
          [...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
              <div className="w-10 h-10 rounded-md bg-muted" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-2 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

/**
 * Recently Played Section for Left Sidebar - memoized to prevent unnecessary re-renders
 * Shows songs in the order they were actually played (most recent first)
 */
const RecentlyPlayedSection = memo(function RecentlyPlayedSection() {
  const { playlist, currentSongIndex, isPlaying, recentlyPlayedIds } = useAudioStore();

  // Build a map of all songs we know about (from current playlist)
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const songMap = useMemo(() => {
    const map = new Map<string, typeof playlist[0]>();
    playlist.forEach(song => map.set(song.id, song));
    return map;
  }, [playlist]);

  // Get recently played songs in order (most recent first)
  // Filter to only songs we have data for
  /* eslint-disable react-hooks/preserve-manual-memoization */
  const recentSongs = useMemo(() => {
    return recentlyPlayedIds
      .slice(0, 5)
      .map(id => songMap.get(id))
      .filter((song): song is NonNullable<typeof song> => song !== undefined);
  }, [recentlyPlayedIds, songMap]);
  /* eslint-enable react-hooks/preserve-manual-memoization */

  // Get the currently playing song (if any)
  const currentSong = playlist[currentSongIndex];

  if (recentSongs.length === 0) return null;

  return (
    <div>
      <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Recently Played
      </h3>
      <div className="space-y-1">
        {recentSongs.map((song, index) => {
          const isCurrentlyPlaying = currentSong?.id === song.id;
          return (
            <div
              key={`${song.id}-${index}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors cursor-pointer",
                "hover:bg-accent/50",
                isCurrentlyPlaying && "bg-accent/30"
              )}
            >
              <div className="w-9 h-9 rounded bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
                {isCurrentlyPlaying && isPlaying ? (
                  <div className="flex gap-0.5">
                    <div className="w-0.5 h-2.5 bg-primary animate-[wave_1s_ease-in-out_infinite]" />
                    <div className="w-0.5 h-3.5 bg-primary animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.1s' }} />
                    <div className="w-0.5 h-2.5 bg-primary animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }} />
                  </div>
                ) : (
                  <Clock className="h-3.5 w-3.5 text-blue-500/70" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{song.name || song.title}</p>
                <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

/**
 * Navigation Item Component - memoized to prevent unnecessary re-renders
 */
interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}

const NavItem = memo(function NavItem({ to, icon, label, active }: NavItemProps) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
});
