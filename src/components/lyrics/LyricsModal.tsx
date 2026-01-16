import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Music, Loader2, ChevronDown, Volume2, Edit3, Save, Trash2, ExternalLink, Search, Clock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getLyrics, getCurrentLineIndex, parseLRC, searchLRCLIB, lrclibResultToLRC, type LyricsResponse, type LyricLine, type LRCLIBSearchResult } from '@/lib/services/lyrics';
import { useAudioStore } from '@/lib/stores/audio';

// Helper to get cover art URL from Navidrome
const getCoverArtUrl = (albumId: string | undefined, size: number = 512) => {
  if (!albumId) return null;
  return `/api/navidrome/rest/getCoverArt?id=${albumId}&size=${size}`;
};

// Local storage key for custom lyrics
const CUSTOM_LYRICS_KEY = 'aidj-custom-lyrics';

// Get custom lyrics from local storage
function getCustomLyrics(songId: string): string | null {
  try {
    const stored = localStorage.getItem(CUSTOM_LYRICS_KEY);
    if (stored) {
      const lyrics = JSON.parse(stored);
      return lyrics[songId] || null;
    }
  } catch (e) {
    console.error('Error reading custom lyrics:', e);
  }
  return null;
}

// Save custom lyrics to local storage
function saveCustomLyrics(songId: string, lyrics: string): void {
  try {
    const stored = localStorage.getItem(CUSTOM_LYRICS_KEY);
    const allLyrics = stored ? JSON.parse(stored) : {};
    allLyrics[songId] = lyrics;
    localStorage.setItem(CUSTOM_LYRICS_KEY, JSON.stringify(allLyrics));
  } catch (e) {
    console.error('Error saving custom lyrics:', e);
  }
}

// Delete custom lyrics from local storage
function deleteCustomLyrics(songId: string): void {
  try {
    const stored = localStorage.getItem(CUSTOM_LYRICS_KEY);
    if (stored) {
      const allLyrics = JSON.parse(stored);
      delete allLyrics[songId];
      localStorage.setItem(CUSTOM_LYRICS_KEY, JSON.stringify(allLyrics));
    }
  } catch (e) {
    console.error('Error deleting custom lyrics:', e);
  }
}

interface LyricsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LyricsModal({ isOpen, onClose }: LyricsModalProps) {
  const {
    playlist,
    currentSongIndex,
    currentTime,
    isPlaying,
  } = useAudioStore();

  const currentSong = playlist[currentSongIndex] || null;

  const [lyricsData, setLyricsData] = useState<LyricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [hasCustomLyrics, setHasCustomLyrics] = useState(false);

  // LRCLIB search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LRCLIBSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const lastSongIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch lyrics when song changes
  useEffect(() => {
    if (!currentSong || !isOpen) return;

    // Check for custom lyrics first
    const customLyrics = getCustomLyrics(currentSong.id);
    if (customLyrics) {
      setHasCustomLyrics(true);
      // Check if it's LRC format
      if (customLyrics.includes('[') && /\[\d{2}:\d{2}/.test(customLyrics)) {
        const parsed = parseLRC(customLyrics);
        setLyricsData({
          lyrics: parsed.map(l => l.text).join('\n'),
          syncedLyrics: parsed,
          source: 'navidrome', // Show as "Custom" in UI
        });
      } else {
        setLyricsData({
          lyrics: customLyrics,
          syncedLyrics: null,
          source: 'navidrome',
        });
      }
      setIsLoading(false);
      lastSongIdRef.current = currentSong.id;
      return;
    }

    setHasCustomLyrics(false);

    // Don't refetch for same song
    if (lastSongIdRef.current === currentSong.id && lyricsData) return;
    lastSongIdRef.current = currentSong.id;

    const fetchLyrics = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await getLyrics(
          currentSong.artist || 'Unknown Artist',
          currentSong.name || currentSong.title || 'Unknown',
          {
            songId: currentSong.id,
            album: currentSong.album,
            duration: currentSong.duration,
          }
        );
        setLyricsData(result);
      } catch (err) {
        console.error('Error fetching lyrics:', err);
        setError('Failed to load lyrics');
      } finally {
        setIsLoading(false);
      }
    };

    fetchLyrics();
  }, [currentSong?.id, isOpen]);

  // Auto-scroll to current line
  const currentLineIndex = lyricsData?.syncedLyrics
    ? getCurrentLineIndex(lyricsData.syncedLyrics, currentTime)
    : -1;

  useEffect(() => {
    if (autoScroll && activeLineRef.current && lyricsContainerRef.current && !isEditing) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentLineIndex, autoScroll, isEditing]);

  // Handle user scroll to disable auto-scroll temporarily
  const handleScroll = useCallback(() => {
    // Could implement logic to detect manual scroll and disable auto-scroll
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSearching) {
          setIsSearching(false);
          setSearchResults([]);
        } else if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose, isEditing, isSearching]);

  // Start editing
  const handleStartEdit = () => {
    if (!currentSong) return;

    // Pre-fill with existing lyrics if available
    const customLyrics = getCustomLyrics(currentSong.id);
    if (customLyrics) {
      setEditText(customLyrics);
    } else if (lyricsData?.syncedLyrics) {
      // Convert synced lyrics back to LRC format
      const lrcText = lyricsData.syncedLyrics.map(line => {
        const mins = Math.floor(line.time / 60);
        const secs = Math.floor(line.time % 60);
        const ms = Math.floor((line.time % 1) * 100);
        return `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}]${line.text}`;
      }).join('\n');
      setEditText(lrcText);
    } else if (lyricsData?.lyrics) {
      setEditText(lyricsData.lyrics);
    } else {
      setEditText('');
    }

    setIsEditing(true);
    // Focus textarea after render
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  // Save lyrics
  const handleSave = () => {
    if (!currentSong || !editText.trim()) return;

    saveCustomLyrics(currentSong.id, editText.trim());
    setHasCustomLyrics(true);

    // Update displayed lyrics
    if (editText.includes('[') && /\[\d{2}:\d{2}/.test(editText)) {
      const parsed = parseLRC(editText);
      setLyricsData({
        lyrics: parsed.map(l => l.text).join('\n'),
        syncedLyrics: parsed,
        source: 'navidrome',
      });
    } else {
      setLyricsData({
        lyrics: editText.trim(),
        syncedLyrics: null,
        source: 'navidrome',
      });
    }

    setIsEditing(false);
  };

  // Delete custom lyrics
  const handleDelete = () => {
    if (!currentSong) return;

    deleteCustomLyrics(currentSong.id);
    setHasCustomLyrics(false);
    lastSongIdRef.current = null; // Force refetch
    setIsEditing(false);

    // Trigger refetch
    setLyricsData(null);
  };

  // Start LRCLIB search
  const handleStartSearch = () => {
    if (!currentSong) return;
    const defaultQuery = `${currentSong.artist || ''} ${currentSong.name || currentSong.title || ''}`.trim();
    setSearchQuery(defaultQuery);
    setSearchResults([]);
    setIsSearching(true);
    // Auto-search with the default query
    handleSearch(defaultQuery);
  };

  // Perform LRCLIB search
  const handleSearch = async (query?: string) => {
    const q = query || searchQuery;
    if (!q.trim()) return;

    setIsSearchLoading(true);
    try {
      const results = await searchLRCLIB(q.trim());
      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    } finally {
      setIsSearchLoading(false);
    }
  };

  // Select a search result
  const handleSelectResult = (result: LRCLIBSearchResult) => {
    if (!currentSong) return;

    const lrcContent = lrclibResultToLRC(result);
    if (lrcContent) {
      saveCustomLyrics(currentSong.id, lrcContent);
      setHasCustomLyrics(true);

      // Update displayed lyrics
      if (result.syncedLyrics) {
        const parsed = parseLRC(result.syncedLyrics);
        setLyricsData({
          lyrics: result.plainLyrics || parsed.map(l => l.text).join('\n'),
          syncedLyrics: parsed,
          source: 'lrclib',
        });
      } else if (result.plainLyrics) {
        setLyricsData({
          lyrics: result.plainLyrics,
          syncedLyrics: null,
          source: 'lrclib',
        });
      }
    }

    setIsSearching(false);
    setSearchResults([]);
  };

  // Format duration for display
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Detect if a line is a section marker (Chorus, Verse, Bridge, etc.)
  const getSectionType = (text: string): { isSection: boolean; type: string | null } => {
    const sectionPatterns = [
      { pattern: /^\[?(chorus|hook)\]?:?$/i, type: 'Chorus' },
      { pattern: /^\[?(verse|v)[\s]*\d*\]?:?$/i, type: 'Verse' },
      { pattern: /^\[?(bridge)\]?:?$/i, type: 'Bridge' },
      { pattern: /^\[?(pre-?chorus)\]?:?$/i, type: 'Pre-Chorus' },
      { pattern: /^\[?(outro)\]?:?$/i, type: 'Outro' },
      { pattern: /^\[?(intro)\]?:?$/i, type: 'Intro' },
      { pattern: /^\[?(refrain)\]?:?$/i, type: 'Refrain' },
    ];

    const trimmedText = text.trim();
    for (const { pattern, type } of sectionPatterns) {
      if (pattern.test(trimmedText)) {
        return { isSection: true, type };
      }
    }
    return { isSection: false, type: null };
  };

  // Detect if we're in a chorus section based on repeated lyrics
  const detectChorusLines = (lyrics: LyricLine[]): Set<number> => {
    if (!lyrics || lyrics.length < 4) return new Set();

    const chorusIndices = new Set<number>();
    const lineTexts = lyrics.map(l => l.text.toLowerCase().trim());
    const lineCounts = new Map<string, number[]>();

    // Count occurrences of each line
    lineTexts.forEach((text, index) => {
      if (text.length < 10) return; // Skip very short lines
      const existing = lineCounts.get(text) || [];
      existing.push(index);
      lineCounts.set(text, existing);
    });

    // Find lines that repeat 2+ times (likely chorus)
    lineCounts.forEach((indices, _text) => {
      if (indices.length >= 2) {
        indices.forEach(i => chorusIndices.add(i));
      }
    });

    return chorusIndices;
  };

  // Memoize chorus detection
  const chorusLines = React.useMemo(() => {
    return lyricsData?.syncedLyrics ? detectChorusLines(lyricsData.syncedLyrics) : new Set<number>();
  }, [lyricsData?.syncedLyrics]);

  // Don't render on server or if not open
  if (!isOpen || typeof document === 'undefined') return null;

  const coverUrl = getCoverArtUrl(currentSong?.albumId, 512);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
      {/* Background with album art blur */}
      {coverUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 blur-3xl scale-125"
          style={{ backgroundImage: `url(${coverUrl})` }}
        />
      )}

      {/* Solid overlay to prevent gradient banding */}
      <div className="absolute inset-0 bg-background/70" />

      {/* Subtle vignette effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, hsl(var(--background)) 100%)',
        }}
      />

      {/* Content */}
      <div className="relative flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-4">
            {/* Album Art */}
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Album cover"
                className="w-14 h-14 rounded-lg object-cover shadow-lg"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                <Music className="h-6 w-6 text-primary/60" />
              </div>
            )}

            {/* Song Info */}
            <div>
              <h2 className="font-semibold text-lg">
                {currentSong?.name || currentSong?.title || 'Unknown Song'}
              </h2>
              <p className="text-muted-foreground">
                {currentSong?.artist || 'Unknown Artist'}
                {currentSong?.album && ` • ${currentSong.album}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Source indicator */}
            {lyricsData && lyricsData.source !== 'none' && !isEditing && (
              <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
                {hasCustomLyrics ? 'Custom' : lyricsData.source === 'navidrome' ? 'Embedded' : 'LRCLIB'}
                {lyricsData.syncedLyrics && ' • Synced'}
              </span>
            )}

            {/* Edit/Save/Search buttons */}
            {isSearching ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setIsSearching(false); setSearchResults([]); }}
              >
                Cancel
              </Button>
            ) : isEditing ? (
              <>
                {hasCustomLyrics && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  disabled={!editText.trim()}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStartSearch}
                  title="Search LRCLIB for lyrics"
                >
                  <Search className="h-4 w-4 mr-1" />
                  Search
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStartEdit}
                  title="Add or edit lyrics"
                >
                  <Edit3 className="h-4 w-4 mr-1" />
                  {lyricsData?.lyrics || hasCustomLyrics ? 'Edit' : 'Add'}
                </Button>
              </>
            )}

            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-10 w-10"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Search Mode */}
        {isSearching ? (
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
            {/* Search input */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search LRCLIB for lyrics..."
                  className="w-full pl-10 pr-4 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>
              <Button
                onClick={() => handleSearch()}
                disabled={isSearchLoading || !searchQuery.trim()}
              >
                {isSearchLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Search'
                )}
              </Button>
            </div>

            {/* Search results */}
            <div className="flex-1 overflow-y-auto">
              {isSearchLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">Searching LRCLIB...</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <Search className="h-16 w-16 text-muted-foreground/30" />
                  <p className="text-muted-foreground">
                    {searchQuery ? 'No results found. Try a different search.' : 'Enter a search query to find lyrics'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-3">
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                  </p>
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSelectResult(result)}
                      className="w-full text-left p-4 bg-muted/30 hover:bg-muted/50 border border-border rounded-lg transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{result.trackName}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {result.artistName}
                            {result.albumName && ` • ${result.albumName}`}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(result.duration)}
                            </span>
                            {result.syncedLyrics && (
                              <span className="text-green-500 flex items-center gap-1">
                                <Check className="h-3 w-3" />
                                Synced
                              </span>
                            )}
                            {result.instrumental && (
                              <span className="text-yellow-500">Instrumental</span>
                            )}
                          </div>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" variant="secondary">
                            Use
                          </Button>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* LRCLIB attribution */}
            <div className="text-center text-xs text-muted-foreground pt-2 border-t border-border">
              Powered by{' '}
              <a
                href="https://lrclib.net"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                LRCLIB
              </a>
              {' '}— Free synced lyrics database
            </div>
          </div>
        ) : isEditing ? (
          /* Edit Mode */
          <div className="flex-1 flex flex-col p-4 gap-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <p>Paste lyrics below. For synced lyrics, use LRC format:</p>
                <code className="text-xs bg-muted px-1 py-0.5 rounded">[00:15.00]First line of lyrics</code>
              </div>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`${currentSong?.artist || ''} ${currentSong?.name || currentSong?.title || ''} lyrics`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Search lyrics <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder={`Paste lyrics here...\n\nFor synced lyrics (karaoke style), use LRC format:\n[00:15.00]First line\n[00:18.50]Second line\n[00:22.00]Third line\n\nOr just paste plain text lyrics.`}
              className="flex-1 w-full p-4 bg-muted/50 border border-border rounded-lg resize-none font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>
                {editText.includes('[') && /\[\d{2}:\d{2}/.test(editText)
                  ? '✓ LRC format detected (synced lyrics)'
                  : 'Plain text (no sync)'}
              </span>
              <span>{editText.length} characters</span>
            </div>
          </div>
        ) : (
          <>
            {/* Lyrics Content */}
            <div
              ref={lyricsContainerRef}
              className="flex-1 overflow-y-auto px-4 py-8"
              onScroll={handleScroll}
            >
              {isLoading && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">Loading lyrics...</p>
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <p className="text-muted-foreground">{error}</p>
                </div>
              )}

              {!isLoading && !error && lyricsData && (
                <>
                  {lyricsData.instrumental && (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                      <Volume2 className="h-16 w-16 text-primary/40" />
                      <p className="text-xl text-muted-foreground">Instrumental</p>
                    </div>
                  )}

                  {lyricsData.source === 'none' && !lyricsData.instrumental && (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                      <Music className="h-16 w-16 text-primary/40" />
                      <p className="text-xl text-muted-foreground">No lyrics found</p>
                      <p className="text-sm text-muted-foreground/60 mb-4">
                        Click "Add" to paste lyrics manually
                      </p>
                      <Button onClick={handleStartEdit} variant="outline">
                        <Edit3 className="h-4 w-4 mr-2" />
                        Add Lyrics
                      </Button>
                    </div>
                  )}

                  {/* Synced Lyrics */}
                  {lyricsData.syncedLyrics && lyricsData.syncedLyrics.length > 0 && (
                    <div className="max-w-2xl mx-auto space-y-4 pt-[30vh] pb-[50vh]">
                      {lyricsData.syncedLyrics.map((line, index) => {
                        const section = getSectionType(line.text);
                        const isChorus = chorusLines.has(index);
                        const isActive = index === currentLineIndex;
                        const isPast = index < currentLineIndex;

                        // Render section markers differently
                        if (section.isSection) {
                          return (
                            <div
                              key={`${line.time}-${index}`}
                              ref={isActive ? activeLineRef : null}
                              className={cn(
                                'text-center py-4 transition-all duration-300',
                                isActive ? 'opacity-100' : isPast ? 'opacity-40' : 'opacity-60'
                              )}
                            >
                              <span className={cn(
                                'inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold uppercase tracking-wider',
                                section.type === 'Chorus' || section.type === 'Refrain'
                                  ? 'bg-primary/20 text-primary border border-primary/30'
                                  : 'bg-muted text-muted-foreground border border-border'
                              )}>
                                {section.type === 'Chorus' && '🎵 '}
                                {section.type}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={`${line.time}-${index}`}
                            ref={isActive ? activeLineRef : null}
                            className={cn(
                              'text-center transition-all duration-300 py-2',
                              isActive
                                ? 'text-2xl md:text-3xl font-bold text-foreground scale-105'
                                : isPast
                                  ? 'text-lg md:text-xl text-muted-foreground/50'
                                  : 'text-lg md:text-xl text-muted-foreground/70',
                              // Chorus styling - slightly bolder and highlighted
                              isChorus && !isActive && 'font-medium',
                              isChorus && isActive && 'text-primary'
                            )}
                          >
                            {/* Chorus indicator for repeated lines */}
                            {isChorus && !isActive && (
                              <span className="inline-block w-1 h-1 rounded-full bg-primary/50 mr-2 align-middle" />
                            )}
                            {line.text}
                            {isChorus && !isActive && (
                              <span className="inline-block w-1 h-1 rounded-full bg-primary/50 ml-2 align-middle" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Plain Lyrics (no sync) */}
                  {!lyricsData.syncedLyrics && lyricsData.lyrics && (
                    <div className="max-w-2xl mx-auto py-8 pb-[30vh]">
                      {lyricsData.lyrics.split('\n').map((line, index) => {
                        const section = getSectionType(line);
                        const trimmedLine = line.trim();

                        // Empty line = paragraph break
                        if (!trimmedLine) {
                          return <div key={index} className="h-6" />;
                        }

                        // Section markers
                        if (section.isSection) {
                          return (
                            <div key={index} className="text-center py-4">
                              <span className={cn(
                                'inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold uppercase tracking-wider',
                                section.type === 'Chorus' || section.type === 'Refrain'
                                  ? 'bg-primary/20 text-primary border border-primary/30'
                                  : 'bg-muted text-muted-foreground border border-border'
                              )}>
                                {section.type === 'Chorus' && '🎵 '}
                                {section.type}
                              </span>
                            </div>
                          );
                        }

                        // Regular lyrics line
                        return (
                          <p
                            key={index}
                            className="text-lg md:text-xl text-center leading-relaxed text-foreground/90 py-1"
                          >
                            {trimmedLine}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer with playback indicator */}
            {isPlaying && lyricsData?.syncedLyrics && (
              <div className="sticky bottom-4 flex justify-center pointer-events-none">
                <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 backdrop-blur-sm rounded-full border border-primary/20">
                  <div className="flex gap-0.5">
                    <div className="w-1 h-3 bg-primary rounded-full animate-[wave_1s_ease-in-out_infinite]" />
                    <div className="w-1 h-4 bg-primary rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.1s' }} />
                    <div className="w-1 h-3 bg-primary rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }} />
                  </div>
                  <span className="text-sm text-primary">Now playing</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
