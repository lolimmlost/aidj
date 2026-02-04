import { useState } from 'react';
import { Check, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Check if an image URL is from Deezer's CDN
 */
export function isDeezerImage(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('dzcdn.net') || url.includes('deezer.com');
}

interface CoverArtApprovalProps {
  imageUrl: string;
  entityId: string;
  entityType: 'album' | 'artist';
  artist: string;
  album?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps an image element and shows a "Save" button when the image
 * comes from Deezer. Clicking save persists the artwork to the DB
 * so it's used directly next time instead of re-fetching from Deezer.
 */
export function CoverArtApproval({
  imageUrl,
  entityId,
  entityType,
  artist,
  album,
  children,
  className,
}: CoverArtApprovalProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!isDeezerImage(imageUrl) || saved) {
    return <>{children}</>;
  }

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/cover-art/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId,
          entityType,
          artist,
          album,
          imageUrl,
          source: 'deezer',
        }),
      });

      if (res.ok) {
        setSaved(true);
        toast.success('Artwork saved');
      } else {
        toast.error('Failed to save artwork');
      }
    } catch {
      toast.error('Failed to save artwork');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn('group/art relative', className)}>
      {children}
      <button
        onClick={handleSave}
        disabled={saving}
        className="absolute bottom-1 right-1 opacity-0 group-hover/art:opacity-100 transition-opacity bg-black/70 hover:bg-black/90 text-white rounded-full p-1 text-xs backdrop-blur-sm"
        title="Save artwork to library"
      >
        {saving ? (
          <Download className="h-3 w-3 animate-pulse" />
        ) : (
          <Check className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}
