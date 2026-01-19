import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import type { SongMatchResult } from '@/lib/db/schema/playlist-export.schema';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { FileUploadStep } from './steps/file-upload-step';
import { ValidationStep } from './steps/validation-step';
import { MatchingStep } from './steps/matching-step';
import { ConfirmationStep } from './steps/confirmation-step';
import { SongMatchReviewer } from './song-match-reviewer';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

type ImportStep = 'upload' | 'validation' | 'matching' | 'confirmation';
type ExportFormat = 'm3u' | 'xspf' | 'json' | 'csv';

interface PlaylistImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (playlistId: string) => void;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  playlist?: {
    name: string;
    description?: string;
    songCount: number;
    format: ExportFormat;
  };
}

interface ImportResult {
  importJobId: string;
  playlistName: string;
  createdPlaylistId: string | null;
  matchReport: {
    summary: {
      total: number;
      matched: number;
      noMatch: number;
      pendingReview: number;
    };
    byConfidence: Record<string, number>;
    unmatchedCount: number;
    pendingReviewCount: number;
  };
  unmatchedSongs: Array<{ title: string; artist: string; album?: string }>;
  parseWarnings: string[];
}

// Detect if content looks like CSV (Spotify Exportify format)
function looksLikeCSV(content: string): boolean {
  const firstLine = content.split(/\r?\n/)[0]?.toLowerCase() || '';
  return (
    (firstLine.includes('track') && firstLine.includes('artist')) ||
    firstLine.includes('track uri') ||
    firstLine.includes('track name')
  );
}

// Client-side playlist validation
function validatePlaylistClient(content: string, format?: ExportFormat): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const trimmed = content.trim();

    if (!trimmed) {
      return { valid: false, errors: ['No content provided'], warnings };
    }

    // Auto-detect format if not provided
    let detectedFormat = format;
    if (!detectedFormat) {
      if (trimmed.startsWith('#EXTM3U') || trimmed.startsWith('#')) {
        detectedFormat = 'm3u';
      } else if (trimmed.startsWith('<?xml') || trimmed.startsWith('<playlist')) {
        detectedFormat = 'xspf';
      } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        detectedFormat = 'json';
      } else if (looksLikeCSV(trimmed)) {
        detectedFormat = 'csv';
      }
    }

    if (!detectedFormat) {
      return { valid: false, errors: ['Could not detect playlist format. Expected M3U, XSPF, JSON, or CSV.'], warnings };
    }

    let playlistName = 'Imported Playlist';
    let description: string | undefined;
    let songCount = 0;

    if (detectedFormat === 'json') {
      let data;
      try {
        data = JSON.parse(trimmed);
      } catch (e) {
        return { valid: false, errors: ['Invalid JSON format: ' + (e instanceof Error ? e.message : 'Parse error')], warnings };
      }

      // Handle our custom format
      if (data.format === 'aidj-playlist' && data.playlist) {
        playlistName = data.playlist.name || 'Imported Playlist';
        description = data.playlist.description;
        songCount = data.playlist.songs?.length || 0;
      }
      // Handle Spotify format
      else if (data.tracks || data.items) {
        const tracks = data.tracks?.items || data.items || data.tracks || [];
        playlistName = data.name || 'Imported Playlist';
        description = data.description;
        songCount = Array.isArray(tracks) ? tracks.length : 0;
      }
      // Handle array of songs
      else if (Array.isArray(data)) {
        songCount = data.length;
      }
      // Handle object with songs array
      else if (data.songs && Array.isArray(data.songs)) {
        playlistName = data.name || data.playlistName || 'Imported Playlist';
        description = data.description;
        songCount = data.songs.length;
      }
      else {
        return { valid: false, errors: ['Unrecognized JSON format. Expected playlist with songs array.'], warnings };
      }
    } else if (detectedFormat === 'm3u') {
      const lines = trimmed.split(/\r?\n/).filter(line => line.trim());
      // Count EXTINF lines (song entries)
      songCount = lines.filter(line => line.startsWith('#EXTINF:')).length;
      // If no EXTINF, count non-comment lines as potential songs
      if (songCount === 0) {
        songCount = lines.filter(line => !line.startsWith('#')).length;
      }
      // Extract playlist name
      const nameMatch = lines.find(line => line.startsWith('#PLAYLIST:'));
      if (nameMatch) {
        playlistName = nameMatch.substring(10).trim();
      }
    } else if (detectedFormat === 'xspf') {
      const titleMatch = trimmed.match(/<title>([^<]*)<\/title>/);
      if (titleMatch) {
        playlistName = titleMatch[1];
      }
      const trackMatches = trimmed.match(/<track>/g);
      songCount = trackMatches?.length || 0;
    } else if (detectedFormat === 'csv') {
      // Parse CSV header and count data rows
      const lines = trimmed.split(/\r?\n/).filter(line => line.trim());
      if (lines.length >= 2) {
        // Count data rows (excluding header)
        songCount = lines.length - 1;
        playlistName = 'Spotify Import';
        description = `Imported from Spotify CSV (${songCount} tracks)`;
      }
    }

    if (songCount === 0) {
      errors.push('No songs found in playlist');
    }

    if (playlistName === 'Imported Playlist') {
      warnings.push('Playlist name not found, using default');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      playlist: {
        name: playlistName,
        description,
        songCount,
        format: detectedFormat,
      },
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to parse playlist: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings,
    };
  }
}

export function PlaylistImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: PlaylistImportDialogProps) {
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [format, setFormat] = useState<ExportFormat | undefined>();
  const [playlistName, setPlaylistName] = useState<string>('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showReviewer, setShowReviewer] = useState(false);
  const [reviewStats, setReviewStats] = useState<{ reviewed: number; skipped: number } | null>(null);
  const globalFileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection from the global input
  const handleGlobalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      if (!content || content.trim().length === 0) {
        toast.error('File is empty');
        return;
      }

      // Detect format
      const trimmed = content.trim();
      let detectedFormat: ExportFormat | undefined;
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.m3u') || lowerName.endsWith('.m3u8')) detectedFormat = 'm3u';
      else if (lowerName.endsWith('.xspf')) detectedFormat = 'xspf';
      else if (lowerName.endsWith('.json')) detectedFormat = 'json';
      else if (lowerName.endsWith('.csv')) detectedFormat = 'csv';
      else if (trimmed.startsWith('#EXTM3U') || trimmed.startsWith('#')) detectedFormat = 'm3u';
      else if (trimmed.startsWith('<?xml') || trimmed.startsWith('<playlist')) detectedFormat = 'xspf';
      else if (trimmed.startsWith('{') || trimmed.startsWith('[')) detectedFormat = 'json';
      else if (looksLikeCSV(trimmed)) detectedFormat = 'csv';

      handleFileUpload(content, file.name, detectedFormat);
    } catch (err) {
      console.error('Error reading file:', err);
      toast.error('Failed to read file');
    }

    // Reset input
    e.target.value = '';
  };

  // Trigger the global file input
  const triggerFileSelect = () => {
    globalFileInputRef.current?.click();
  };

  // Client-side validation
  const runValidation = useCallback((content: string, detectedFormat?: ExportFormat) => {
    setIsValidating(true);
    // Small delay to show loading state
    setTimeout(() => {
      const result = validatePlaylistClient(content, detectedFormat);
      setValidationResult(result);
      if (result.valid && result.playlist) {
        setPlaylistName(result.playlist.name);
        setFormat(result.playlist.format);
      }
      setIsValidating(false);
    }, 300);
  }, []);

  // Track if we're waiting for background processing
  const [isProcessingInBackground, setIsProcessingInBackground] = useState(false);

  // Import mutation - now returns immediately with 202, processing happens in background
  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/playlists/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: fileContent,
          format,
          playlistName,
          targetPlatform: 'navidrome',
          autoMatch: true,
          createPlaylist: true,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to import playlist';
        try {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } catch {
          // Response was not JSON
          errorMessage = `Server error (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      try {
        return await response.json();
      } catch {
        throw new Error('Invalid response from server');
      }
    },
    onSuccess: (data) => {
      setImportJobId(data.data.importJobId);

      // Check if processing is happening in background (202 response)
      if (data.data.status === 'processing') {
        setIsProcessingInBackground(true);
        toast.info('Matching songs...', {
          description: `Processing ${data.data.totalSongs} songs in background`,
        });
      } else {
        // Immediate result (shouldn't happen now, but keep for compatibility)
        setImportResult(data.data);
        const pendingReview = data.data?.matchReport?.summary?.pendingReview || 0;
        if (pendingReview > 0) {
          setCurrentStep('matching');
        } else {
          setCurrentStep('confirmation');
        }
      }
    },
    onError: (error: Error) => {
      toast.error('Import failed', {
        description: error.message,
      });
    },
  });

  // Poll import job status while processing in background
  const { data: importJobData } = useQuery({
    queryKey: ['import-job', importJobId],
    queryFn: async () => {
      if (!importJobId) return null;
      const response = await fetch(`/api/playlists/import?importJobId=${importJobId}`);
      if (!response.ok) throw new Error('Failed to fetch import status');
      try {
        return await response.json();
      } catch {
        throw new Error('Invalid response from server');
      }
    },
    enabled: !!importJobId && isProcessingInBackground,
    refetchInterval: 2000,
  });

  // Handle polling results
  useEffect(() => {
    if (!importJobData?.data?.importJob) return;

    const job = importJobData.data.importJob;

    if (job.status === 'completed') {
      setIsProcessingInBackground(false);

      // Build import result from job data
      const matchResults = job.matchResults || [];
      const matched = matchResults.filter((r: SongMatchResult) => r.status === 'matched').length;
      const noMatch = matchResults.filter((r: SongMatchResult) => r.status === 'no_match').length;
      const pendingReview = matchResults.filter((r: SongMatchResult) => r.status === 'pending_review').length;

      setImportResult({
        importJobId: job.id,
        playlistName: job.playlistName,
        createdPlaylistId: job.createdPlaylistId,
        matchReport: {
          summary: {
            total: job.totalSongs,
            matched,
            noMatch,
            pendingReview,
            skipped: 0,
          },
          byConfidence: { exact: 0, high: 0, low: 0, none: 0 },
          unmatchedCount: noMatch,
          pendingReviewCount: pendingReview,
        },
        unmatchedSongs: matchResults
          .filter((r: SongMatchResult) => r.status === 'no_match')
          .map((r: SongMatchResult) => ({
            title: r.originalSong.title,
            artist: r.originalSong.artist,
            album: r.originalSong.album,
          })),
        matchResults,
      });

      if (pendingReview > 0) {
        setCurrentStep('matching');
      } else {
        setCurrentStep('confirmation');
      }

      toast.success('Import complete', {
        description: `${matched} songs matched, ${noMatch} not found`,
      });
    } else if (job.status === 'failed') {
      setIsProcessingInBackground(false);
      toast.error('Import failed', {
        description: 'Background matching encountered an error',
      });
    }
  }, [importJobData]);

  const handleFileUpload = (content: string, name: string, detectedFormat?: ExportFormat) => {
    setFileContent(content);
    setFileName(name);
    if (detectedFormat) {
      setFormat(detectedFormat);
    }
    setCurrentStep('validation');
    runValidation(content, detectedFormat);
  };

  const handleNext = () => {
    if (currentStep === 'upload' && fileContent) {
      setCurrentStep('validation');
      runValidation(fileContent, format);
    } else if (currentStep === 'validation' && validationResult?.valid) {
      setCurrentStep('matching');
      importMutation.mutate();
    } else if (currentStep === 'matching' && importResult) {
      setCurrentStep('confirmation');
    }
  };

  const handleBack = () => {
    const steps: ImportStep[] = ['upload', 'validation', 'matching', 'confirmation'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const handleClose = () => {
    setCurrentStep('upload');
    setFileContent('');
    setFileName('');
    setFormat(undefined);
    setPlaylistName('');
    setValidationResult(null);
    setImportResult(null);
    setImportJobId(null);
    setIsValidating(false);
    setShowReviewer(false);
    setReviewStats(null);
    importMutation.reset();
    onOpenChange(false);
  };

  const handleComplete = () => {
    if (importResult?.createdPlaylistId) {
      onSuccess?.(importResult.createdPlaylistId);
      toast.success('Playlist imported successfully!', {
        description: `${importResult.matchReport.summary.matched} songs added to your library`,
      });
    }
    handleClose();
  };

  const steps: Record<ImportStep, { title: string; description: string }> = {
    upload: {
      title: 'Upload Playlist',
      description: 'Select a playlist file to import',
    },
    validation: {
      title: 'Validating',
      description: 'Checking playlist file format and contents',
    },
    matching: {
      title: 'Matching Songs',
      description: 'Finding songs in your library',
    },
    confirmation: {
      title: 'Import Complete',
      description: 'Review import results',
    },
  };

  const stepOrder: ImportStep[] = ['upload', 'validation', 'matching', 'confirmation'];
  const currentStepIndex = stepOrder.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / stepOrder.length) * 100;

  return (
    <>
      {/* Hidden file input rendered outside the dialog portal for better browser compatibility */}
      {open && createPortal(
        <input
          ref={globalFileInputRef}
          type="file"
          accept=".m3u,.m3u8,.xspf,.json,.csv"
          onChange={handleGlobalFileChange}
          style={{ position: 'fixed', left: '-9999px', opacity: 0 }}
        />,
        document.body
      )}

      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
        <DialogContent
          className="w-[calc(100%-2rem)] sm:w-auto sm:max-w-[500px] md:max-w-[600px] lg:max-w-[700px] min-h-[300px] max-h-[min(85vh,700px)] overflow-y-auto p-4 md:p-6"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="space-y-1 pb-2 md:pb-4">
            <DialogTitle className="text-base md:text-lg">{steps[currentStep].title}</DialogTitle>
            <DialogDescription className="text-xs md:text-sm">{steps[currentStep].description}</DialogDescription>
          </DialogHeader>

          {/* Progress Bar */}
          <div className="space-y-2">
            <Progress value={progress} className="h-1.5 md:h-2" />
            <div className="flex justify-between text-[10px] md:text-xs text-muted-foreground">
              {stepOrder.map((step, index) => (
                <span
                  key={step}
                  className={`transition-colors ${index <= currentStepIndex ? 'text-primary font-medium' : ''}`}
                >
                  <span className="hidden md:inline">{steps[step].title}</span>
                  <span className="md:hidden">{steps[step].title.split(' ')[0]}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div className="py-2 md:py-4">
            {currentStep === 'upload' && (
              <FileUploadStep onFileUpload={handleFileUpload} onTriggerFileSelect={triggerFileSelect} />
            )}

          {currentStep === 'validation' && (
            <ValidationStep
              isValidating={isValidating}
              validationResult={validationResult}
              fileName={fileName}
              playlistName={playlistName}
              onPlaylistNameChange={setPlaylistName}
            />
          )}

          {currentStep === 'matching' && (
            <MatchingStep
              isMatching={importMutation.isPending || isProcessingInBackground || !importResult}
              importJobData={importJobData?.data}
              importResult={importResult}
              onReviewClick={
                importResult?.matchReport?.summary?.pendingReview && importResult.matchReport.summary.pendingReview > 0
                  ? () => setShowReviewer(true)
                  : undefined
              }
            />
          )}

          {currentStep === 'confirmation' && importResult && (
            <ConfirmationStep
              importResult={importResult}
              playlistName={playlistName}
              reviewStats={reviewStats || undefined}
              onReviewClick={
                importResult?.matchReport?.summary?.pendingReview && importResult.matchReport.summary.pendingReview > 0 && !reviewStats
                  ? () => setShowReviewer(true)
                  : undefined
              }
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between pt-3 md:pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            disabled={currentStep === 'upload' || isValidating || importMutation.isPending}
            className="h-8 md:h-9 text-xs md:text-sm"
          >
            <ChevronLeft className="mr-1 h-3 w-3 md:h-4 md:w-4" />
            Back
          </Button>

          <div className="flex gap-2 md:gap-3">
            <Button variant="ghost" size="sm" onClick={handleClose} className="h-8 md:h-9 text-xs md:text-sm">
              Cancel
            </Button>

            {currentStep === 'confirmation' ? (
              <Button size="sm" onClick={handleComplete} className="h-8 md:h-9 text-xs md:text-sm px-4 md:px-6">
                Done
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleNext}
                disabled={
                  (currentStep === 'upload' && !fileContent) ||
                  (currentStep === 'validation' && (!validationResult?.valid || isValidating)) ||
                  (currentStep === 'matching' && importMutation.isPending)
                }
                className="h-8 md:h-9 text-xs md:text-sm px-4 md:px-6"
              >
                {isValidating || importMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 md:h-4 md:w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="ml-1 h-3 w-3 md:h-4 md:w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
      </Dialog>

      {/* Song Match Reviewer */}
      {importJobId && importJobData?.data?.importJob?.matchResults && (
        <SongMatchReviewer
          open={showReviewer}
          onOpenChange={setShowReviewer}
          importJobId={importJobId}
          matchResults={importJobData.data.importJob.matchResults}
          onComplete={(stats) => {
            setShowReviewer(false);
            setReviewStats(stats);
            // Move to confirmation step after review
            setCurrentStep('confirmation');
          }}
        />
      )}
    </>
  );
}
