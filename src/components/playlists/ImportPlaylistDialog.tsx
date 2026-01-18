import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Music,
  Loader2,
} from 'lucide-react';

interface ImportPlaylistDialogProps {
  trigger?: React.ReactNode;
  onImportComplete?: (playlistId: string) => void;
}

type ImportStep = 'upload' | 'validate' | 'matching' | 'review' | 'complete';

interface MatchResult {
  originalSong: {
    title: string;
    artist: string;
    album?: string;
  };
  matches: Array<{
    platform: string;
    platformId: string;
    title: string;
    artist: string;
    confidence: string;
    matchScore: number;
  }>;
  selectedMatch?: {
    platform: string;
    platformId: string;
  };
  status: 'matched' | 'pending_review' | 'no_match' | 'skipped';
}

export function ImportPlaylistDialog({
  trigger,
  onImportComplete,
}: ImportPlaylistDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ImportStep>('upload');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [playlistName, setPlaylistName] = useState<string>('');
  const [format, setFormat] = useState<string>('');
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [importJobId, setImportJobId] = useState<string>('');
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    playlist?: {
      name: string;
      description?: string;
      songCount: number;
    };
  } | null>(null);

  const queryClient = useQueryClient();

  // Handle file upload
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    // Detect format from extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'm3u' || ext === 'm3u8') {
      setFormat('m3u');
    } else if (ext === 'xspf') {
      setFormat('xspf');
    } else if (ext === 'json') {
      setFormat('json');
    } else if (ext === 'csv') {
      setFormat('csv');
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileContent(content);
      setStep('validate');
    };
    reader.readAsText(file);
  }, []);

  // Handle paste content
  const handlePasteContent = useCallback((content: string) => {
    setFileContent(content);
    setFileName('pasted-content');

    // Auto-detect format
    const trimmed = content.trim();
    if (trimmed.startsWith('#EXTM3U') || trimmed.startsWith('#')) {
      setFormat('m3u');
    } else if (trimmed.startsWith('<?xml') || trimmed.startsWith('<playlist')) {
      setFormat('xspf');
    } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      setFormat('json');
    } else {
      // Check for CSV (Spotify Exportify format)
      const firstLine = trimmed.split(/\r?\n/)[0]?.toLowerCase() || '';
      if (
        (firstLine.includes('track') && firstLine.includes('artist')) ||
        firstLine.includes('track uri') ||
        firstLine.includes('track name')
      ) {
        setFormat('csv');
      }
    }

    setStep('validate');
  }, []);

  // Validate mutation
  const validateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/playlists/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: fileContent,
          format: format || undefined,
          playlistName: playlistName || undefined,
          targetPlatform: 'navidrome',
          autoMatch: true,
          createPlaylist: false, // Don't create yet, just validate and match
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to validate playlist');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setImportJobId(data.data.importJobId);
      setPlaylistName(data.data.playlistName);

      // Fetch match results
      fetchMatchResults(data.data.importJobId);
    },
    onError: (error: Error) => {
      toast.error('Validation failed', {
        description: error.message,
      });
    },
  });

  // Fetch match results
  const fetchMatchResults = async (jobId: string) => {
    try {
      const response = await fetch(`/api/playlists/import?importJobId=${jobId}`);
      const data = await response.json();

      if (data.data?.importJob?.matchResults) {
        setMatchResults(data.data.importJob.matchResults);
        setStep('review');
      }
    } catch (error) {
      console.error('Error fetching match results:', error);
    }
  };

  // Confirm import mutation
  const confirmMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/playlists/import', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importJobId,
          matchResults: matchResults.map(r => ({
            originalSong: r.originalSong,
            selectedMatch: r.selectedMatch,
            status: r.status,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to import playlist');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast.success('Playlist imported successfully', {
        description: `Added ${data.data.songsAdded} songs to "${playlistName}"`,
      });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      setStep('complete');

      if (onImportComplete && data.data.playlistId) {
        onImportComplete(data.data.playlistId);
      }
    },
    onError: (error: Error) => {
      toast.error('Import failed', {
        description: error.message,
      });
    },
  });

  // Handle match selection
  const handleSelectMatch = (songIndex: number, matchIndex: number) => {
    setMatchResults(prev => {
      const updated = [...prev];
      const song = updated[songIndex];
      const match = song.matches[matchIndex];

      updated[songIndex] = {
        ...song,
        selectedMatch: {
          platform: match.platform,
          platformId: match.platformId,
        },
        status: 'matched',
      };

      return updated;
    });
  };

  // Handle skip song
  const handleSkipSong = (songIndex: number) => {
    setMatchResults(prev => {
      const updated = [...prev];
      updated[songIndex] = {
        ...updated[songIndex],
        selectedMatch: undefined,
        status: 'skipped',
      };
      return updated;
    });
  };

  // Reset dialog
  const resetDialog = () => {
    setStep('upload');
    setFileContent('');
    setFileName('');
    setPlaylistName('');
    setFormat('');
    setMatchResults([]);
    setImportJobId('');
    setValidationResult(null);
  };

  // Stats
  const matchStats = {
    total: matchResults.length,
    matched: matchResults.filter(r => r.status === 'matched').length,
    pending: matchResults.filter(r => r.status === 'pending_review').length,
    noMatch: matchResults.filter(r => r.status === 'no_match').length,
    skipped: matchResults.filter(r => r.status === 'skipped').length,
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetDialog();
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="min-h-[44px]">
            <Upload className="mr-2 h-4 w-4" />
            Import Playlist
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Import Playlist'}
            {step === 'validate' && 'Validating Playlist'}
            {step === 'matching' && 'Matching Songs'}
            {step === 'review' && 'Review Matches'}
            {step === 'complete' && 'Import Complete'}
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a playlist file or paste playlist content to import.'}
            {step === 'validate' && 'Validating playlist format and content...'}
            {step === 'matching' && 'Finding songs in your library...'}
            {step === 'review' && 'Review and confirm song matches before importing.'}
            {step === 'complete' && 'Your playlist has been imported successfully.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Upload Step */}
          {step === 'upload' && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="file">Upload File</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="file"
                    type="file"
                    accept=".m3u,.m3u8,.xspf,.json,.csv"
                    onChange={handleFileUpload}
                    className="min-h-[44px]"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Supported formats: M3U, M3U8, XSPF, JSON, CSV (Spotify export)
                </p>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or paste content
                  </span>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="content">Paste Playlist Content</Label>
                <Textarea
                  id="content"
                  placeholder="Paste M3U, XSPF, JSON, or CSV playlist content here..."
                  rows={6}
                  onChange={(e) => {
                    if (e.target.value.trim()) {
                      handlePasteContent(e.target.value);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Validate Step */}
          {step === 'validate' && (
            <div className="grid gap-4 py-4">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                <span>{fileName}</span>
                {format && <Badge variant="secondary">{format.toUpperCase()}</Badge>}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="playlistName">Playlist Name</Label>
                <Input
                  id="playlistName"
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  placeholder="Enter playlist name"
                  className="min-h-[44px]"
                />
              </div>

              {validationResult && !validationResult.valid && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive">
                  <p className="font-medium">Validation Errors:</p>
                  <ul className="list-disc list-inside text-sm mt-1">
                    {validationResult.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult?.warnings && validationResult.warnings.length > 0 && (
                <div className="p-3 rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                  <p className="font-medium">Warnings:</p>
                  <ul className="list-disc list-inside text-sm mt-1">
                    {validationResult.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Matching Step */}
          {step === 'matching' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Finding songs in your library...</p>
              <Progress value={validateMutation.isPending ? 50 : 0} className="w-full max-w-xs" />
            </div>
          )}

          {/* Review Step */}
          {step === 'review' && (
            <div className="flex flex-col gap-4 py-2">
              {/* Stats */}
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">
                  <Music className="h-3 w-3 mr-1" />
                  {matchStats.total} songs
                </Badge>
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {matchStats.matched} matched
                </Badge>
                {matchStats.pending > 0 && (
                  <Badge variant="secondary">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {matchStats.pending} need review
                  </Badge>
                )}
                {matchStats.noMatch > 0 && (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    {matchStats.noMatch} no match
                  </Badge>
                )}
              </div>

              {/* Song list */}
              <ScrollArea className="h-[300px] border rounded-lg">
                <div className="p-2 space-y-2">
                  {matchResults.map((result, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        result.status === 'matched'
                          ? 'border-green-500/30 bg-green-500/5'
                          : result.status === 'no_match'
                          ? 'border-red-500/30 bg-red-500/5'
                          : result.status === 'skipped'
                          ? 'border-gray-500/30 bg-gray-500/5'
                          : 'border-yellow-500/30 bg-yellow-500/5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {result.originalSong.title}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {result.originalSong.artist}
                            {result.originalSong.album && ` - ${result.originalSong.album}`}
                          </p>
                        </div>

                        {result.status === 'matched' && result.selectedMatch && (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 shrink-0">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Matched
                          </Badge>
                        )}

                        {result.status === 'no_match' && (
                          <Badge variant="outline" className="bg-red-500/10 text-red-600 shrink-0">
                            <XCircle className="h-3 w-3 mr-1" />
                            No match
                          </Badge>
                        )}

                        {result.status === 'skipped' && (
                          <Badge variant="outline" className="shrink-0">
                            Skipped
                          </Badge>
                        )}
                      </div>

                      {/* Show matches for pending review */}
                      {result.status === 'pending_review' && result.matches.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-muted-foreground">Select a match:</p>
                          {result.matches.slice(0, 3).map((match, matchIndex) => (
                            <button
                              key={matchIndex}
                              onClick={() => handleSelectMatch(index, matchIndex)}
                              className="w-full text-left p-2 rounded border hover:bg-accent text-sm flex items-center justify-between"
                            >
                              <span className="truncate">
                                {match.title} - {match.artist}
                              </span>
                              <Badge variant="secondary" className="ml-2 shrink-0">
                                {match.matchScore}%
                              </Badge>
                            </button>
                          ))}
                          <button
                            onClick={() => handleSkipSong(index)}
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            Skip this song
                          </button>
                        </div>
                      )}

                      {/* Allow changing selection for matched songs */}
                      {result.status === 'matched' && result.matches.length > 1 && (
                        <div className="mt-2">
                          <Select
                            value={result.selectedMatch?.platformId}
                            onValueChange={(value) => {
                              const matchIndex = result.matches.findIndex(m => m.platformId === value);
                              if (matchIndex >= 0) {
                                handleSelectMatch(index, matchIndex);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Change selection" />
                            </SelectTrigger>
                            <SelectContent>
                              {result.matches.map((match, matchIndex) => (
                                <SelectItem key={matchIndex} value={match.platformId}>
                                  {match.title} - {match.artist} ({match.matchScore}%)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Complete Step */}
          {step === 'complete' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <p className="font-medium">Import Complete!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Added {matchStats.matched} songs to "{playlistName}"
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'upload' && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
          )}

          {step === 'validate' && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('upload')}
                className="min-h-[44px]"
              >
                Back
              </Button>
              <Button
                onClick={() => {
                  setStep('matching');
                  validateMutation.mutate();
                }}
                disabled={validateMutation.isPending || !playlistName.trim()}
                className="min-h-[44px]"
              >
                {validateMutation.isPending ? 'Processing...' : 'Continue'}
              </Button>
            </>
          )}

          {step === 'review' && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('upload')}
                className="min-h-[44px]"
              >
                Start Over
              </Button>
              <Button
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending || matchStats.matched === 0}
                className="min-h-[44px]"
              >
                {confirmMutation.isPending ? 'Importing...' : `Import ${matchStats.matched} Songs`}
              </Button>
            </>
          )}

          {step === 'complete' && (
            <Button
              onClick={() => setOpen(false)}
              className="min-h-[44px]"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
