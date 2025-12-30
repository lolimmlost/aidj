import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, FileText, Music } from 'lucide-react';

type ExportFormat = 'm3u' | 'xspf' | 'json';

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

interface ValidationStepProps {
  isValidating: boolean;
  validationResult: ValidationResult | null;
  fileName: string;
  playlistName: string;
  onPlaylistNameChange: (name: string) => void;
}

export function ValidationStep({
  isValidating,
  validationResult,
  fileName,
  playlistName,
  onPlaylistNameChange,
}: ValidationStepProps) {
  if (isValidating) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="text-center">
          <p className="font-medium">Validating playlist...</p>
          <p className="text-sm text-muted-foreground mt-1">
            Checking format and parsing contents
          </p>
        </div>
      </div>
    );
  }

  if (!validationResult) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Validation Status */}
      <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
        {validationResult.valid ? (
          <>
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-green-700 dark:text-green-400">
                Playlist validated successfully
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Ready to import {validationResult.playlist?.songCount} songs
              </p>
            </div>
          </>
        ) : (
          <>
            <XCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-destructive">Validation failed</p>
              <p className="text-sm text-muted-foreground mt-1">
                Please check the errors below
              </p>
            </div>
          </>
        )}
      </div>

      {/* File Info */}
      {validationResult.valid && validationResult.playlist && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>File</span>
              </div>
              <p className="text-sm font-medium truncate">{fileName}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Music className="h-4 w-4" />
                <span>Songs</span>
              </div>
              <p className="text-sm font-medium">{validationResult.playlist.songCount}</p>
            </div>
          </div>

          {/* Playlist Name Input */}
          <div className="space-y-2">
            <Label htmlFor="playlist-name">Playlist Name</Label>
            <Input
              id="playlist-name"
              value={playlistName}
              onChange={(e) => onPlaylistNameChange(e.target.value)}
              placeholder="Enter playlist name"
            />
            {validationResult.playlist.description && (
              <p className="text-sm text-muted-foreground">
                {validationResult.playlist.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Errors */}
      {validationResult.errors.length > 0 && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-2">Errors found:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {validationResult.errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Warnings */}
      {validationResult.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-2">Warnings:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {validationResult.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
