import { Suspense, lazy } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { OllamaErrorBoundary } from '@/components/ollama-error-boundary';
import { SourceModeSelector, SourceBadge } from '@/components/playlist/source-mode-selector';
import { GenerationProgress } from '@/components/ui/generation-progress';
import { SongFeedbackButtons } from '@/components/library/SongFeedbackButtons';
import { STYLE_PRESETS } from '@/components/dashboard/quick-actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Play,
  Plus,
  ListPlus,
  Download,
  ChevronDown,
  ChevronUp,
  Music,
  Sparkles,
  RefreshCw,
  Trash2,
  Search,
  XCircle,
} from 'lucide-react';
import type { SourceMode } from '@/lib/stores/preferences';

const MixCompatibilityBadges = lazy(() =>
  import('@/components/dj/mix-compatibility-badges').then((m) => ({
    default: m.MixCompatibilityBadges,
  })),
);

export interface PlaylistItem {
  song: string;
  explanation: string;
  songId?: string;
  url?: string;
  missing?: boolean;
  isDiscovery?: boolean;
  inLibrary?: boolean;
  discoverySource?: 'lastfm' | 'ollama' | 'library';
  bpm?: number;
  key?: string;
}

interface CustomPlaylistSectionProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  style: string;
  onStyleChange: (style: string) => void;
  trimmedStyle: string;
  debouncedStyle: string;
  sourceMode: SourceMode;
  onSourceModeChange: (mode: SourceMode) => void;
  mixRatio: number;
  onMixRatioChange: (ratio: number) => void;
  data: { data: { playlist: PlaylistItem[] } } | undefined;
  isLoading: boolean;
  error: Error | null;
  generationStage: string;
  activePreset: string | null;
  currentSong: { bpm?: number; key?: string } | null;
  onGenerate: () => void;
  onCancel: () => void;
  onClearCache: () => void;
  onRegenerate: () => void;
  onQueuePlaylist: (position: 'now' | 'next' | 'end') => void;
  onSongQueue: (item: PlaylistItem, position: 'now' | 'next' | 'end') => void;
  onDiscoveryAdd: (item: PlaylistItem, index: number) => void;
  onSearchSimilar: (artist: string) => void;
}

export function CustomPlaylistSection({
  collapsed,
  onToggleCollapse,
  style,
  onStyleChange,
  trimmedStyle,
  debouncedStyle,
  sourceMode,
  onSourceModeChange,
  mixRatio,
  onMixRatioChange,
  data: playlistData,
  isLoading: playlistLoading,
  error: playlistError,
  generationStage,
  activePreset,
  currentSong,
  onGenerate,
  onCancel,
  onClearCache,
  onRegenerate,
  onQueuePlaylist,
  onSongQueue,
  onDiscoveryAdd,
  onSearchSimilar,
}: CustomPlaylistSectionProps) {
  return (
    <OllamaErrorBoundary>
      <section className="glass-card-premium p-5 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-3 text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
              <Music className="w-5 h-5 text-cyan-500" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
                  Custom Playlist
                </span>
                <span className="badge-info text-[10px]">AI</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Describe your vibe, get a playlist
              </p>
            </div>
            {collapsed ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors ml-1" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors ml-1" />
            )}
          </button>
          {!collapsed && (
            <Button
              onClick={onClearCache}
              variant="outline"
              size="sm"
              className="min-h-[44px] w-full sm:w-auto hover:bg-destructive/5 hover:border-destructive/50 transition-all rounded-xl"
              aria-label="Clear playlist cache"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear Cache
            </Button>
          )}
        </div>

        {collapsed && (
          <p className="text-sm text-muted-foreground pl-[52px]">
            Tap to create a custom AI-generated playlist
          </p>
        )}

        {!collapsed && (
          <>
            <div className="space-y-4">
              {/* Source Mode Selector */}
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  Source
                </label>
                <SourceModeSelector
                  value={sourceMode}
                  onChange={onSourceModeChange}
                  mixRatio={mixRatio}
                  onMixRatioChange={onMixRatioChange}
                />
              </div>

              {/* Input Area */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
                  <Input
                    placeholder="Describe your vibe... (e.g., 'Chill Sunday morning', 'Late night coding')"
                    value={style}
                    onChange={(e) => onStyleChange(e.target.value)}
                    className="pl-12 h-12 sm:h-14 bg-background/80 border-border/50 focus:border-primary/50 rounded-xl text-base transition-all"
                    aria-label="Playlist style"
                  />
                </div>
                <button
                  onClick={onGenerate}
                  disabled={!trimmedStyle}
                  className="action-button h-12 sm:h-14 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  aria-label="Generate playlist now"
                >
                  <Sparkles className="mr-2 w-[18px] h-[18px]" />
                  Generate
                </button>
              </div>
            </div>

            {/* Debounce indicator */}
            {trimmedStyle && trimmedStyle !== debouncedStyle && (
              <p className="text-sm text-muted-foreground animate-pulse">
                Typing detected... playlist will generate when you stop typing
              </p>
            )}

            {/* Loading state */}
            {playlistLoading && (
              <Card
                className="bg-card text-card-foreground border-card"
                aria-busy="true"
                aria-live="polite"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      Generating Playlist
                      {activePreset && (
                        <span className="text-sm font-normal text-muted-foreground">
                          &quot;
                          {STYLE_PRESETS.find((p) => p.id === activePreset)
                            ?.label || trimmedStyle}
                          &quot;
                        </span>
                      )}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onCancel}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <GenerationProgress stage={generationStage} />
                </CardContent>
              </Card>
            )}

            {/* Error state */}
            {playlistError && playlistError.message !== 'cancelled' && (
              <p className="text-destructive">
                Error: {playlistError.message}
                {playlistError.message.includes('rate limit') && (
                  <span className="block text-sm mt-1">
                    Please wait a moment before generating another playlist
                  </span>
                )}
              </p>
            )}

            {/* Results */}
            {playlistData && (
              <div className="space-y-4">
                {/* Stats banner */}
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 border border-blue-500/10 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <Music className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Generated Playlist: &quot;{debouncedStyle || style}&quot;
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sourceMode === 'library'
                          ? `${playlistData.data.playlist.filter((item) => item.songId).length} of 5 songs found in your library`
                          : sourceMode === 'discovery'
                            ? `${playlistData.data.playlist.length} new discoveries to explore`
                            : `${playlistData.data.playlist.filter((item) => item.inLibrary).length} library + ${playlistData.data.playlist.filter((item) => item.isDiscovery).length} discoveries`}{' '}
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted">
                          {sourceMode === 'library'
                            ? 'Library Only'
                            : sourceMode === 'discovery'
                              ? 'Discovery'
                              : `Mix ${mixRatio}/${100 - mixRatio}`}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
                          aria-label="Add playlist to queue"
                        >
                          <ListPlus className="mr-1 h-4 w-4" />
                          Queue
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => onQueuePlaylist('now')}
                          className="min-h-[44px]"
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Play Now (First Song)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onQueuePlaylist('next')}
                          className="min-h-[44px]"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add All to Play Next
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onQueuePlaylist('end')}
                          className="min-h-[44px]"
                        >
                          <ListPlus className="mr-2 h-4 w-4" />
                          Add All to End
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRegenerate}
                      aria-label="Regenerate playlist"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate
                    </Button>
                  </div>
                </div>

                {/* Song cards */}
                <div className="grid grid-cols-1 gap-3">
                  {playlistData.data.playlist.map((item, index) => {
                    const hasSong = !!item.songId;
                    const isDiscovery = item.isDiscovery || false;
                    const isLastFm = item.discoverySource === 'lastfm';
                    const cardStyle = hasSong
                      ? 'border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-600/5 hover:border-green-500/50'
                      : isDiscovery
                        ? isLastFm
                          ? 'border-red-500/30 bg-gradient-to-br from-red-500/5 to-pink-500/5 hover:border-red-500/50'
                          : 'border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-pink-500/5 hover:border-purple-500/50'
                        : 'border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-red-500/5 hover:border-orange-500/50';

                    return (
                      <div
                        key={index}
                        className={`group rounded-xl border transition-all duration-300 hover:shadow-md ${cardStyle}`}
                      >
                        <div className="p-4 sm:p-5">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-background/80 text-xs font-medium">
                                  {index + 1}
                                </span>
                                <span className="font-semibold text-base">
                                  {item.song}
                                </span>
                                <SourceBadge
                                  inLibrary={hasSong}
                                  isDiscovery={isDiscovery && !hasSong}
                                  discoverySource={item.discoverySource}
                                />
                                {!hasSong && !isDiscovery && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                                    Not Found
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {item.explanation}
                              </p>
                              {/* Harmonic mixing badges */}
                              {currentSong &&
                                (item.bpm || item.key) && (
                                  <div className="mt-1">
                                    <Suspense
                                      fallback={
                                        <Skeleton className="h-5 w-20" />
                                      }
                                    >
                                      <MixCompatibilityBadges
                                        currentBpm={currentSong.bpm}
                                        currentKey={currentSong.key}
                                        candidateBpm={item.bpm}
                                        candidateKey={item.key}
                                        compact
                                        showLabel
                                      />
                                    </Suspense>
                                  </div>
                                )}
                              {/* Discovery info */}
                              {isDiscovery && !hasSong && (
                                <p
                                  className={`text-xs ${isLastFm ? 'text-red-600 dark:text-red-400' : 'text-purple-600 dark:text-purple-400'}`}
                                >
                                  {isLastFm
                                    ? 'From Last.fm - similar to artists in your library'
                                    : 'AI discovery - search or add to your library'}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <SongFeedbackButtons
                                songId={item.songId || undefined}
                                artistName={
                                  item.song.split(' - ')[0] || 'Unknown'
                                }
                                songTitle={
                                  item.song.split(' - ').slice(1).join(' - ') ||
                                  item.song
                                }
                                source="playlist_generator"
                                likeMessage="Good recommendation"
                                dislikeMessage="Bad recommendation"
                                size="sm"
                              />
                              {hasSong ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
                                    >
                                      <ListPlus className="mr-1 h-4 w-4" />
                                      Queue
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-40"
                                  >
                                    <DropdownMenuItem
                                      onClick={() =>
                                        onSongQueue(item, 'now')
                                      }
                                      className="min-h-[44px]"
                                    >
                                      <Play className="mr-2 h-4 w-4" />
                                      Play Now
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        onSongQueue(item, 'next')
                                      }
                                      className="min-h-[44px]"
                                    >
                                      <Play className="mr-2 h-4 w-4" />
                                      Play Next
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        onSongQueue(item, 'end')
                                      }
                                      className="min-h-[44px]"
                                    >
                                      <Plus className="mr-2 h-4 w-4" />
                                      Add to End
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : isDiscovery ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    onDiscoveryAdd(item, index)
                                  }
                                  className="border-purple-500/30 hover:bg-purple-500/10 text-purple-700 dark:text-purple-300"
                                >
                                  <Download className="mr-1 h-4 w-4" />
                                  Find & Download
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const [artistPart] =
                                      item.song.split(' - ');
                                    if (artistPart) {
                                      onSearchSimilar(artistPart.trim());
                                    }
                                  }}
                                  className="border-orange-500/30 hover:bg-orange-500/10"
                                >
                                  <Search className="mr-1 h-4 w-4" />
                                  Search Similar
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Empty state */}
                {playlistData.data.playlist.length === 0 && (
                  <div className="text-center p-8 border border-dashed rounded-xl">
                    <p className="text-muted-foreground">
                      No matching songs found. Try a different style or theme.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </OllamaErrorBoundary>
  );
}
