/**
 * LyricsMode — chassis-hosted lyrics view. Ported from the standalone
 * LyricsModal: same fetching, synced-lyrics autoscroll, edit, and LRCLIB
 * search workflows, but without the portal/header chrome since the
 * NowPlayingFullscreen chassis provides those.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Music,
  Loader2,
  Volume2,
  Edit3,
  Save,
  Trash2,
  ExternalLink,
  Search,
  Clock,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getLyrics,
  getCurrentLineIndex,
  parseLRC,
  searchLRCLIB,
  lrclibResultToLRC,
  type LyricsResponse,
  type LyricLine,
  type LRCLIBSearchResult,
} from '@/lib/services/lyrics';
import { useAudioStore } from '@/lib/stores/audio';

const CUSTOM_LYRICS_KEY = 'aidj-custom-lyrics';

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

/* LyricsMode reads currentSong/time/isPlaying from the audio store
 * directly — matches the original LyricsModal data path and avoids
 * widening the chassis NowPlayingSong type with album/duration. */

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

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

const detectChorusLines = (lyrics: LyricLine[]): Set<number> => {
  if (!lyrics || lyrics.length < 4) return new Set();

  const chorusIndices = new Set<number>();
  const lineTexts = lyrics.map(l => l.text.toLowerCase().trim());
  const lineCounts = new Map<string, number[]>();

  lineTexts.forEach((text, index) => {
    if (text.length < 10) return;
    const existing = lineCounts.get(text) || [];
    existing.push(index);
    lineCounts.set(text, existing);
  });

  lineCounts.forEach((indices) => {
    if (indices.length >= 2) {
      indices.forEach(i => chorusIndices.add(i));
    }
  });

  return chorusIndices;
};

export function LyricsMode() {
  const { playlist, currentSongIndex, currentTime, isPlaying } = useAudioStore();
  const song = playlist[currentSongIndex] || null;

  const [lyricsData, setLyricsData] = useState<LyricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [hasCustomLyrics, setHasCustomLyrics] = useState(false);

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LRCLIBSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const lastSongIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!song) return;

    const songId = song.id;
    const customLyrics = getCustomLyrics(songId);
    if (customLyrics) {
      setHasCustomLyrics(true);
      if (customLyrics.includes('[') && /\[\d{2}:\d{2}/.test(customLyrics)) {
        const parsed = parseLRC(customLyrics);
        setLyricsData({
          lyrics: parsed.map(l => l.text).join('\n'),
          syncedLyrics: parsed,
          source: 'navidrome',
        });
      } else {
        setLyricsData({
          lyrics: customLyrics,
          syncedLyrics: null,
          source: 'navidrome',
        });
      }
      setIsLoading(false);
      lastSongIdRef.current = song.id;
      return;
    }

    setHasCustomLyrics(false);

    if (lastSongIdRef.current === song.id && lyricsData) return;
    lastSongIdRef.current = song.id;

    const fetchLyrics = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await getLyrics(
          song.artist || 'Unknown Artist',
          song.name || song.title || 'Unknown',
          {
            songId: song.id,
            album: (song as { album?: string }).album,
            duration: (song as { duration?: number }).duration,
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
  }, [song?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const currentLineIndex = lyricsData?.syncedLyrics
    ? getCurrentLineIndex(lyricsData.syncedLyrics, currentTime)
    : -1;

  useEffect(() => {
    if (activeLineRef.current && lyricsContainerRef.current && !isEditing) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentLineIndex, isEditing]);

  const chorusLines = React.useMemo(() => {
    return lyricsData?.syncedLyrics ? detectChorusLines(lyricsData.syncedLyrics) : new Set<number>();
  }, [lyricsData?.syncedLyrics]);

  const handleStartEdit = () => {
    const customLyrics = getCustomLyrics(song.id);
    if (customLyrics) {
      setEditText(customLyrics);
    } else if (lyricsData?.syncedLyrics) {
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
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleSave = () => {
    if (!editText.trim()) return;

    saveCustomLyrics(song.id, editText.trim());
    setHasCustomLyrics(true);

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

  const handleDelete = () => {
    deleteCustomLyrics(song.id);
    setHasCustomLyrics(false);
    lastSongIdRef.current = null;
    setIsEditing(false);
    setLyricsData(null);
  };

  const handleStartSearch = () => {
    const defaultQuery = `${song.artist || ''} ${song.name || song.title || ''}`.trim();
    setSearchQuery(defaultQuery);
    setSearchResults([]);
    setIsSearching(true);
    handleSearch(defaultQuery);
  };

  const handleSearch = useCallback(async (query?: string) => {
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
  }, [searchQuery]);

  const handleSelectResult = (result: LRCLIBSearchResult) => {
    const lrcContent = lrclibResultToLRC(result);
    if (lrcContent) {
      saveCustomLyrics(song.id, lrcContent);
      setHasCustomLyrics(true);

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

  if (!song) return null;

  return (
    <div className="w-full h-full flex flex-col min-h-0 lg:flex-1">
      {/* In-mode toolbar — source indicator + edit/search actions */}
      <div className="flex items-center justify-between gap-2 px-1 pb-3 flex-shrink-0">
        <div className="min-w-0 flex-1">
          {lyricsData && lyricsData.source !== 'none' && !isEditing && !isSearching && (
            <span className="inline-block text-xs text-white/60 px-2 py-1 bg-white/10 rounded whitespace-nowrap">
              {hasCustomLyrics ? 'Custom' : lyricsData.source === 'navidrome' ? 'Embedded' : 'LRCLIB'}
              {lyricsData.syncedLyrics && ' • Synced'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isSearching ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-white/80 hover:text-white hover:bg-white/10"
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
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/10"
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
                size="icon"
                className="h-9 w-9 text-white/70 hover:text-white hover:bg-white/10"
                onClick={handleStartSearch}
                title="Search LRCLIB for lyrics"
              >
                <Search className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-white/70 hover:text-white hover:bg-white/10"
                onClick={handleStartEdit}
                title={lyricsData?.lyrics || hasCustomLyrics ? 'Edit lyrics' : 'Add lyrics'}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Body — search results, edit textarea, or lyrics */}
      {isSearching ? (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search LRCLIB for lyrics..."
                className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>
            <Button onClick={() => handleSearch()} disabled={isSearchLoading || !searchQuery.trim()}>
              {isSearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {isSearchLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-white/60">Searching LRCLIB...</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <Search className="h-16 w-16 text-white/20" />
                <p className="text-white/60">
                  {searchQuery ? 'No results found. Try a different search.' : 'Enter a search query to find lyrics'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-white/60 mb-3">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                </p>
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleSelectResult(result)}
                    className="w-full text-left p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-white">{result.trackName}</div>
                        <div className="text-sm text-white/60 truncate">
                          {result.artistName}
                          {result.albumName && ` • ${result.albumName}`}
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-white/50">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(result.duration)}
                          </span>
                          {result.syncedLyrics && (
                            <span className="text-green-400 flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              Synced
                            </span>
                          )}
                          {result.instrumental && <span className="text-yellow-400">Instrumental</span>}
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="secondary">Use</Button>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="text-center text-xs text-white/40 pt-2 border-t border-white/10">
            Powered by{' '}
            <a href="https://lrclib.net" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              LRCLIB
            </a>
            {' '}— Free synced lyrics database
          </div>
        </div>
      ) : isEditing ? (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-white/60 min-w-0">
              <p>Paste lyrics below. For synced lyrics, use LRC format:</p>
              <code className="text-xs bg-white/10 px-1 py-0.5 rounded">[00:15.00]First line of lyrics</code>
            </div>
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(`${song.artist || ''} ${song.name || song.title || ''} lyrics`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1 flex-shrink-0"
            >
              Search lyrics <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder={`Paste lyrics here...\n\nFor synced lyrics (karaoke style), use LRC format:\n[00:15.00]First line\n[00:18.50]Second line\n[00:22.00]Third line\n\nOr just paste plain text lyrics.`}
            className="flex-1 w-full p-4 bg-white/10 border border-white/20 rounded-lg resize-none font-mono text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex justify-between items-center text-xs text-white/50">
            <span>
              {editText.includes('[') && /\[\d{2}:\d{2}/.test(editText)
                ? '✓ LRC format detected (synced lyrics)'
                : 'Plain text (no sync)'}
            </span>
            <span>{editText.length} characters</span>
          </div>
        </div>
      ) : (
        <div ref={lyricsContainerRef} className="flex-1 overflow-y-auto min-h-0 px-2">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-white/60">Loading lyrics...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Music className="h-16 w-16 text-white/20" />
              <p className="text-white/60">{error}</p>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    lastSongIdRef.current = null;
                    setError(null);
                    setLyricsData(null);
                  }}
                >
                  <Loader2 className="h-4 w-4 mr-1" />
                  Retry
                </Button>
                <Button variant="outline" size="sm" onClick={handleStartSearch}>
                  <Search className="h-4 w-4 mr-1" />
                  Search LRCLIB
                </Button>
                <Button variant="outline" size="sm" onClick={handleStartEdit}>
                  <Edit3 className="h-4 w-4 mr-1" />
                  Add Manually
                </Button>
              </div>
            </div>
          )}

          {!isLoading && !error && lyricsData && (
            <>
              {lyricsData.instrumental && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <Volume2 className="h-16 w-16 text-primary/50" />
                  <p className="text-xl text-white/60">Instrumental</p>
                </div>
              )}

              {lyricsData.source === 'none' && !lyricsData.instrumental && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <Music className="h-16 w-16 text-primary/50" />
                  <p className="text-xl text-white/60">No lyrics found</p>
                  <p className="text-sm text-white/40 mb-4">Click the pencil to paste lyrics manually</p>
                  <Button onClick={handleStartEdit} variant="outline">
                    <Edit3 className="h-4 w-4 mr-2" />
                    Add Lyrics
                  </Button>
                </div>
              )}

              {lyricsData.syncedLyrics && lyricsData.syncedLyrics.length > 0 && (
                <div className="max-w-2xl mx-auto space-y-4 pt-[30vh] pb-[50vh]">
                  {lyricsData.syncedLyrics.map((line, index) => {
                    const section = getSectionType(line.text);
                    const isChorus = chorusLines.has(index);
                    const isActive = index === currentLineIndex;
                    const isPast = index < currentLineIndex;

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
                              ? 'bg-primary/30 text-primary border border-primary/40'
                              : 'bg-white/10 text-white/70 border border-white/20'
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
                            ? 'text-2xl md:text-3xl font-bold text-white scale-105'
                            : isPast
                              ? 'text-lg md:text-xl text-white/40'
                              : 'text-lg md:text-xl text-white/60',
                          isChorus && !isActive && 'font-medium',
                          isChorus && isActive && 'text-primary'
                        )}
                      >
                        {isChorus && !isActive && (
                          <span className="inline-block w-1 h-1 rounded-full bg-primary/60 mr-2 align-middle" />
                        )}
                        {line.text}
                        {isChorus && !isActive && (
                          <span className="inline-block w-1 h-1 rounded-full bg-primary/60 ml-2 align-middle" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!lyricsData.syncedLyrics && lyricsData.lyrics && (
                <div className="max-w-2xl mx-auto py-8 pb-[30vh]">
                  {lyricsData.lyrics.split('\n').map((line, index) => {
                    const section = getSectionType(line);
                    const trimmedLine = line.trim();

                    if (!trimmedLine) return <div key={index} className="h-6" />;

                    if (section.isSection) {
                      return (
                        <div key={index} className="text-center py-4">
                          <span className={cn(
                            'inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold uppercase tracking-wider',
                            section.type === 'Chorus' || section.type === 'Refrain'
                              ? 'bg-primary/30 text-primary border border-primary/40'
                              : 'bg-white/10 text-white/70 border border-white/20'
                          )}>
                            {section.type === 'Chorus' && '🎵 '}
                            {section.type}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <p
                        key={index}
                        className="text-lg md:text-xl text-center leading-relaxed text-white/90 py-1"
                      >
                        {trimmedLine}
                      </p>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {isPlaying && lyricsData?.syncedLyrics && (
            <div className="sticky bottom-2 flex justify-center pointer-events-none">
              <div className="flex items-center gap-2 px-4 py-2 bg-primary/20 backdrop-blur-sm rounded-full border border-primary/30">
                <div className="flex gap-0.5">
                  <div className="w-1 h-3 bg-primary rounded-full animate-[wave_1s_ease-in-out_infinite]" />
                  <div className="w-1 h-4 bg-primary rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.1s' }} />
                  <div className="w-1 h-3 bg-primary rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }} />
                </div>
                <span className="text-sm text-primary">Now playing</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
