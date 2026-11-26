import { useMemo } from 'react';
import { useAudioStore } from '@/lib/stores/audio';
import { getCoverArtUrl } from '@/components/ui/album-art';
import { useDynamicColors } from '@/hooks/useDynamicColors';
import { cn } from '@/lib/utils';

/**
 * Glass UI prototype: the soft glow at the top of a page, tinted by the
 * playing song's cover. Colours are mixed with the brand violet / cyan so a
 * black-and-white cover still glows. The parent must be `relative`; content
 * that should sit on top needs `relative` too.
 */
export function GlassBackdrop({ className }: { className?: string }) {
  const playlist = useAudioStore((s) => s.playlist);
  const currentSongIndex = useAudioStore((s) => s.currentSongIndex);
  const currentSong = useMemo(() => playlist[currentSongIndex], [playlist, currentSongIndex]);
  const { colors } = useDynamicColors(currentSong?.albumId ? getCoverArtUrl(currentSong.albumId, 64) : null);

  const glowA = colors?.primary ? `color-mix(in oklch, ${colors.primary} 55%, oklch(0.55 0.24 285))` : 'oklch(0.55 0.24 285)';
  const glowB = colors?.secondary ? `color-mix(in oklch, ${colors.secondary} 55%, oklch(0.7 0.13 200))` : 'oklch(0.7 0.13 200)';

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-[640px] overflow-hidden', className)}>
      <div className="absolute -left-20 -top-28 size-[360px] rounded-full opacity-45 blur-[80px] dark:opacity-50" style={{ background: glowA }} />
      <div className="absolute -right-28 top-24 size-[300px] rounded-full opacity-35 blur-[80px] dark:opacity-25" style={{ background: glowB }} />
    </div>
  );
}
