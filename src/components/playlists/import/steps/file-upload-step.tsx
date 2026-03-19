import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Link2, Loader2, Unplug } from 'lucide-react';
import { SpotifyPlaylistPicker } from '../spotify-playlist-picker';
import type { SpotifyPlaylistSummary } from '@/lib/services/spotify';

type ExportFormat = 'm3u' | 'xspf' | 'json' | 'csv';

interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  username?: string;
}

interface FileUploadStepProps {
  onFileUpload: (content: string, fileName: string, format?: ExportFormat) => void;
  onUrlSubmit?: (url: string) => void;
  onTriggerFileSelect?: () => void;
  spotifyEnabled?: boolean;
  spotifyStatus?: SpotifyStatus;
  onSpotifyConnect?: () => void;
  onSpotifyDisconnect?: () => void;
  onSpotifyPlaylistSelect?: (playlist: SpotifyPlaylistSummary) => void;
  isLoadingUrl?: boolean;
}

// Regex for Spotify playlist/album URLs
const SPOTIFY_URL_REGEX = /^(https?:\/\/open\.spotify\.com\/(playlist|album)\/[a-zA-Z0-9]{22}|spotify:(playlist|album):[a-zA-Z0-9]{22})/;

export function FileUploadStep({
  onFileUpload,
  onUrlSubmit,
  onTriggerFileSelect: _onTriggerFileSelect,
  spotifyEnabled = false,
  spotifyStatus,
  onSpotifyConnect,
  onSpotifyDisconnect,
  onSpotifyPlaylistSelect,
  isLoadingUrl = false,
}: FileUploadStepProps) {
  const [pastedContent, setPastedContent] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [_dragActive, setDragActive] = useState(false);
  const [_uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [_isLoading, setIsLoading] = useState(false);

  const isValidSpotifyUrl = SPOTIFY_URL_REGEX.test(spotifyUrl.trim());
  const isSpotifyConnected = spotifyStatus?.connected ?? false;

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
      {/* Spotify OAuth — Connect & Browse */}
      {spotifyEnabled && spotifyStatus?.configured && onSpotifyPlaylistSelect && (
        <div>
          <Label className="text-sm md:text-base font-medium mb-2 block">
            Import from Spotify
          </Label>

          {!isSpotifyConnected ? (
            <div className="space-y-2">
              <Button
                onClick={onSpotifyConnect}
                variant="outline"
                className="w-full gap-2"
                size="sm"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#1DB954]" aria-hidden>
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
                Connect Spotify Account
              </Button>
              <p className="text-xs text-muted-foreground">
                Connect your Spotify account to browse and import your private playlists.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Connected as <span className="font-medium text-foreground">{spotifyStatus.username}</span>
                </span>
                {onSpotifyDisconnect && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onSpotifyDisconnect}
                    className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
                  >
                    <Unplug className="h-3 w-3" />
                    Disconnect
                  </Button>
                )}
              </div>
              <SpotifyPlaylistPicker onSelect={onSpotifyPlaylistSelect} />
            </div>
          )}
        </div>
      )}

      {/* Spotify URL Import (fallback for public playlists) */}
      {spotifyEnabled && onUrlSubmit && (
        <>
          {spotifyStatus?.configured && onSpotifyPlaylistSelect && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or paste a public link</span>
              </div>
            </div>
          )}
          <div>
            {!spotifyStatus?.configured && (
              <Label className="text-sm md:text-base font-medium mb-2 block">
                Import from Spotify
              </Label>
            )}
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
        </>
      )}

      {/* Divider before paste */}
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
