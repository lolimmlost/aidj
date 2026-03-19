import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Link2, Loader2 } from 'lucide-react';

type ExportFormat = 'm3u' | 'xspf' | 'json' | 'csv';

interface FileUploadStepProps {
  onFileUpload: (content: string, fileName: string, format?: ExportFormat) => void;
  onUrlSubmit?: (url: string) => void;
  onTriggerFileSelect?: () => void;
  spotifyEnabled?: boolean;
  isLoadingUrl?: boolean;
}

// Regex for Spotify playlist/album URLs
const SPOTIFY_URL_REGEX = /^(https?:\/\/open\.spotify\.com\/(playlist|album)\/[a-zA-Z0-9]{22}|spotify:(playlist|album):[a-zA-Z0-9]{22})/;

export function FileUploadStep({
  onFileUpload,
  onUrlSubmit,
  onTriggerFileSelect: _onTriggerFileSelect,
  spotifyEnabled = false,
  isLoadingUrl = false,
}: FileUploadStepProps) {
  const [pastedContent, setPastedContent] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [_dragActive, setDragActive] = useState(false);
  const [_uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [_isLoading, setIsLoading] = useState(false);

  const isValidSpotifyUrl = SPOTIFY_URL_REGEX.test(spotifyUrl.trim());

  const detectFormat = (content: string, filename?: string): ExportFormat | undefined => {
    const trimmed = content.trim();

    // Check file extension first
    if (filename) {
      const lowerFilename = filename.toLowerCase();
      if (lowerFilename.endsWith('.m3u') || lowerFilename.endsWith('.m3u8')) return 'm3u';
      if (lowerFilename.endsWith('.xspf')) return 'xspf';
      if (lowerFilename.endsWith('.json')) return 'json';
      if (lowerFilename.endsWith('.csv')) return 'csv';
    }

    // Check content
    if (trimmed.startsWith('#EXTM3U') || trimmed.startsWith('#')) return 'm3u';
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<playlist')) return 'xspf';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';

    // Check for CSV (Spotify Exportify format)
    const firstLine = trimmed.split(/\r?\n/)[0]?.toLowerCase() || '';
    if (
      (firstLine.includes('track') && firstLine.includes('artist')) ||
      firstLine.includes('track uri') ||
      firstLine.includes('track name')
    ) {
      return 'csv';
    }

    return undefined;
  };

  const handleFileInput = async (file: File) => {
    setIsLoading(true);
    setUploadedFileName(null);

    try {
      const content = await file.text();

      if (!content || content.trim().length === 0) {
        toast.error('File is empty');
        setIsLoading(false);
        return;
      }

      const format = detectFormat(content, file.name);
      setUploadedFileName(file.name);
      setIsLoading(false);
      onFileUpload(content, file.name, format);
    } catch (err) {
      console.error('Error reading file:', err);
      toast.error('Failed to read file');
      setIsLoading(false);
    }
  };

  const _handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const _handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileInput(e.dataTransfer.files[0]);
    }
  };

  const _handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileInput(file);
    }
    // Reset input value so the same file can be selected again
    e.target.value = '';
  };

  const handlePaste = () => {
    if (pastedContent.trim()) {
      const format = detectFormat(pastedContent);
      onFileUpload(pastedContent, 'pasted-playlist.txt', format);
    }
  };

  const handleSpotifySubmit = () => {
    if (isValidSpotifyUrl && onUrlSubmit) {
      onUrlSubmit(spotifyUrl.trim());
    }
  };

  return (
    <div className="space-y-4">
      {/* Spotify URL Import */}
      {spotifyEnabled && onUrlSubmit && (
        <div>
          <Label className="text-sm md:text-base font-medium mb-2 block">
            Import from Spotify
          </Label>
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="https://open.spotify.com/playlist/..."
                  value={spotifyUrl}
                  onChange={(e) => setSpotifyUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isValidSpotifyUrl) {
                      handleSpotifySubmit();
                    }
                  }}
                  className="pl-9 font-mono text-sm"
                  disabled={isLoadingUrl}
                />
              </div>
              <Button
                onClick={handleSpotifySubmit}
                disabled={!isValidSpotifyUrl || isLoadingUrl}
                size="sm"
                className="shrink-0"
              >
                {isLoadingUrl ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  'Import'
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste a Spotify playlist or album link. Works with public playlists.
            </p>
          </div>
        </div>
      )}

      {/* Divider */}
      {spotifyEnabled && onUrlSubmit && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or paste content</span>
          </div>
        </div>
      )}

      {/* Paste Content */}
      <div>
        {(!spotifyEnabled || !onUrlSubmit) && (
          <Label className="text-sm md:text-base font-medium mb-2 block">Paste Content</Label>
        )}
        <div className="space-y-3">
          <Textarea
            placeholder="Paste your playlist content here (M3U, XSPF, JSON, or CSV)"
            value={pastedContent}
            onChange={(e) => setPastedContent(e.target.value)}
            className="min-h-[120px] md:min-h-[180px] font-mono text-sm resize-y"
          />
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <p className="text-xs md:text-sm text-muted-foreground order-2 md:order-1">
              Supports M3U, M3U8, XSPF, JSON, and CSV formats (Spotify export)
            </p>
            <Button
              onClick={handlePaste}
              disabled={!pastedContent.trim()}
              variant="outline"
              className="w-full md:w-auto order-1 md:order-2"
              size="sm"
            >
              Import from Pasted Content
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
