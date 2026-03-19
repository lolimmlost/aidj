import { createFileRoute } from '@tanstack/react-router';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Copy, Check, Music } from 'lucide-react';
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

    // Gradient background matching the page
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#0a0a0b');
    grad.addColorStop(1, '#1a1025');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // White rounded rect for QR
    const qrSize = 700;
    const qrX = (size - qrSize) / 2;
    const qrY = (size - qrSize) / 2 - 30;
    const r = 32;
    ctx.beginPath();
    ctx.moveTo(qrX + r, qrY);
    ctx.lineTo(qrX + qrSize - r, qrY);
    ctx.quadraticCurveTo(qrX + qrSize, qrY, qrX + qrSize, qrY + r);
    ctx.lineTo(qrX + qrSize, qrY + qrSize - r);
    ctx.quadraticCurveTo(qrX + qrSize, qrY + qrSize, qrX + qrSize - r, qrY + qrSize);
    ctx.lineTo(qrX + r, qrY + qrSize);
    ctx.quadraticCurveTo(qrX, qrY + qrSize, qrX, qrY + qrSize - r);
    ctx.lineTo(qrX, qrY + r);
    ctx.quadraticCurveTo(qrX, qrY, qrX + r, qrY);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const pad = 60;
      ctx.drawImage(img, qrX + pad, qrY + pad, qrSize - pad * 2, qrSize - pad * 2);

      // "AIDJ" text below QR
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px Inter, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AIDJ', size / 2, qrY + qrSize + 70);

      // Subtitle
      ctx.fillStyle = '#8b8b8b';
      ctx.font = '24px Inter, -apple-system, sans-serif';
      ctx.fillText('Scan to join', size / 2, qrY + qrSize + 110);

      const link = document.createElement('a');
      link.download = 'aidj-invite-qr.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-purple-950/20 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm flex flex-col items-center gap-10 relative z-10">
        {/* Branding */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Music className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">AIDJ</h1>
            <p className="text-sm text-muted-foreground mt-1">Your AI-powered music companion</p>
          </div>
        </div>

        {/* QR Card */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent rounded-3xl blur-sm group-hover:from-primary/30 transition-all duration-500" />
          <div
            ref={qrRef}
            className="relative bg-white p-8 rounded-2xl shadow-2xl shadow-primary/5"
          >
            <QRCodeSVG
              value={signupUrl}
              size={220}
              level="M"
              bgColor="#ffffff"
              fgColor="#0a0a0b"
            />
          </div>
        </div>

        {/* CTA */}
        <div className="text-center space-y-1.5">
          <p className="text-lg font-medium">Scan to join</p>
          <p className="text-xs text-muted-foreground">
            Open your camera app and point it at the code
          </p>
        </div>

        {/* URL + Actions */}
        <div className="w-full space-y-3">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border/50">
            <span className="flex-1 truncate text-muted-foreground font-mono text-xs">
              {signupUrl}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0 hover:bg-primary/10"
              onClick={handleCopy}
            >
              {copied
                ? <Check className="h-3.5 w-3.5 text-green-500" />
                : <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              }
            </Button>
          </div>

          <Button
            variant="outline"
            className="w-full border-border/50 hover:border-primary/30 hover:bg-primary/5"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4 mr-2" />
            Save QR Image
          </Button>
        </div>
      </div>
    </div>
  );
}
