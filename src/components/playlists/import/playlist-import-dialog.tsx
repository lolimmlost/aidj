import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
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
type ExportFormat = 'm3u' | 'xspf' | 'json';

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
      }
    }

    if (!detectedFormat) {
      return { valid: false, errors: ['Could not detect playlist format. Expected M3U, XSPF, or JSON.'], warnings };
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
      else if (trimmed.startsWith('#EXTM3U') || trimmed.startsWith('#')) detectedFormat = 'm3u';
      else if (trimmed.startsWith('<?xml') || trimmed.startsWith('<playlist')) detectedFormat = 'xspf';
      else if (trimmed.startsWith('{') || trimmed.startsWith('[')) detectedFormat = 'json';

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

  // Import mutation
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
        const error = await response.json();
        throw new Error(error.message || 'Failed to import playlist');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setImportResult(data.data);
      setImportJobId(data.data.importJobId);
      // If there are songs pending review, stay on matching step so user can review
      const pendingReview = data.data?.matchReport?.summary?.pendingReview || 0;
      if (pendingReview > 0) {
        // Stay on matching step - user needs to review or skip
        setCurrentStep('matching');
      } else {
        setCurrentStep('confirmation');
      }
    },
    onError: (error: Error) => {
      toast.error('Import failed', {
        description: error.message,
      });
      // Stay on matching step so user can retry
    },
  });

  // Poll import job status (not used currently but keeping for future)
  const { data: importJobData } = useQuery({
    queryKey: ['import-job', importJobId],
    queryFn: async () => {
      if (!importJobId) return null;
      const response = await fetch(`/api/playlists/import?importJobId=${importJobId}`);
      if (!response.ok) throw new Error('Failed to fetch import status');
      return response.json();
    },
    enabled: !!importJobId && currentStep === 'matching',
    refetchInterval: 2000,
  });

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
          accept=".m3u,.m3u8,.xspf,.json"
          onChange={handleGlobalFileChange}
          style={{ position: 'fixed', left: '-9999px', opacity: 0 }}
        />,
        document.body
      )}

      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
        <DialogContent
          className="w-[calc(100%-2rem)] sm:w-auto sm:max-w-[440px] min-h-[300px] max-h-[min(85vh,600px)] overflow-y-auto p-4"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="space-y-1 pb-2">
            <DialogTitle className="text-base">{steps[currentStep].title}</DialogTitle>
            <DialogDescription className="text-xs">{steps[currentStep].description}</DialogDescription>
          </DialogHeader>

          {/* Progress Bar */}
          <div className="space-y-1">
            <Progress value={progress} className="h-1.5" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              {stepOrder.map((step, index) => (
                <span
                  key={step}
                  className={index <= currentStepIndex ? 'text-primary font-medium' : ''}
                >
                  {steps[step].title.split(' ')[0]}
                </span>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div className="py-2">
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
              isMatching={importMutation.isPending || !importResult}
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
        <div className="flex justify-between pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            disabled={currentStep === 'upload' || isValidating || importMutation.isPending}
            className="h-8 text-xs"
          >
            <ChevronLeft className="mr-1 h-3 w-3" />
            Back
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose} className="h-8 text-xs">
              Cancel
            </Button>

            {currentStep === 'confirmation' ? (
              <Button size="sm" onClick={handleComplete} className="h-8 text-xs">
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
                className="h-8 text-xs"
              >
                {isValidating || importMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="ml-1 h-3 w-3" />
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
