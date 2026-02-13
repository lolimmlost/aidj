import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type ExportFormat = 'm3u' | 'xspf' | 'json' | 'csv';

interface FileUploadStepProps {
  onFileUpload: (content: string, fileName: string, format?: ExportFormat) => void;
  onTriggerFileSelect?: () => void;
}

export function FileUploadStep({ onFileUpload, onTriggerFileSelect: _onTriggerFileSelect }: FileUploadStepProps) {
  const [pastedContent, setPastedContent] = useState('');
  const [_dragActive, setDragActive] = useState(false);
  const [_uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [_isLoading, setIsLoading] = useState(false);

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

  return (
    <div className="space-y-4">
      {/* File Upload Area - Temporarily disabled due to environment compatibility issues */}
      {/* TODO: Re-enable when file input issues are resolved
      <div>
        <Label className="text-sm font-medium mb-2 block">Upload File</Label>
        <div
          className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
            dragActive
              ? 'border-primary bg-primary/5'
              : uploadedFileName
              ? 'border-green-500/50 bg-green-500/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="space-y-2">
            <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center ${
              uploadedFileName ? 'bg-green-500/20' : 'bg-muted'
            }`}>
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : uploadedFileName ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <Upload className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              {uploadedFileName ? (
                <>
                  <p className="text-sm font-medium text-green-600">
                    File loaded: {uploadedFileName}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click Next to continue or select a different file
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    Drag and drop your playlist file here
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    or click to browse
                  </p>
                </>
              )}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                if (onTriggerFileSelect) {
                  onTriggerFileSelect();
                } else {
                  fileInputRef.current?.click();
                }
              }}
              disabled={isLoading}
            >
              <FileText className="mr-2 h-4 w-4" />
              {uploadedFileName ? 'Select Different File' : 'Select File'}
            </Button>
            {!onTriggerFileSelect && (
              <input
                ref={fileInputRef}
                type="file"
                accept=".m3u,.m3u8,.xspf,.json"
                onChange={handleChange}
                className="hidden"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Supports M3U, XSPF, and JSON formats
            </p>
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or</span>
        </div>
      </div>
      */}

      {/* Paste Content */}
      <div>
        <Label className="text-sm md:text-base font-medium mb-2 block">Paste Content</Label>
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
