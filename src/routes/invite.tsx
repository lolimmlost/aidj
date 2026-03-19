import { createFileRoute } from '@tanstack/react-router';
import { QRCodeSVG } from 'qrcode.react';
import { GalleryVerticalEnd, Download, Copy, Check } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/invite')({
  component: InvitePage,
});

function InvitePage() {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const siteUrl = typeof window !== 'undefined'
    ? window.location.origin
    : '';
  const signupUrl = `${siteUrl}/signup`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(signupUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [signupUrl]);

  const handleDownload = useCallback(() => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;

    const canvas = document.createElement('canvas');
    const size = 1024;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw dark background
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, size, size);

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const padding = 80;
      ctx.drawImage(img, padding, padding, size - padding * 2, size - padding * 2);
      const link = document.createElement('a');
      link.download = 'aidj-invite-qr.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <GalleryVerticalEnd className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">AIDJ</span>
        </div>

        {/* QR Code */}
        <div
          ref={qrRef}
          className="bg-white p-6 rounded-2xl shadow-lg"
        >
          <QRCodeSVG
            value={signupUrl}
            size={220}
            level="M"
            bgColor="#ffffff"
            fgColor="#0a0a0b"
          />
        </div>

        {/* Instructions */}
        <div className="text-center space-y-2">
          <h1 className="text-lg font-semibold">Scan to join AIDJ</h1>
          <p className="text-sm text-muted-foreground">
            Point your camera at the QR code to sign up
          </p>
        </div>

        {/* URL + Actions */}
        <div className="w-full space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm">
            <span className="flex-1 truncate text-muted-foreground font-mono text-xs">
              {signupUrl}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={handleCopy}
            >
              {copied
                ? <Check className="h-3.5 w-3.5 text-green-500" />
                : <Copy className="h-3.5 w-3.5" />
              }
            </Button>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4 mr-2" />
            Download QR Code
          </Button>
        </div>
      </div>
    </div>
  );
}
