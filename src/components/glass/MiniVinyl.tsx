import { useState, type CSSProperties } from 'react';
import { AlbumArt, getCoverArtUrl } from '@/components/ui/album-art';
import { useBeat } from '@/components/glass/beat-sync';
import { useLowMotion } from '@/lib/hooks/useLowMotion';

interface Props {
  songId: string;
  albumId?: string;
  artist?: string;
  bpm?: number;
  playing: boolean;
}

/**
 * Glass mini player art: the cover as a tiny record, one turn per bar, ducking on each kick (the full
 * player's sidechain pump, a touch deeper so it reads at 56 px). Low motion, or no cover, falls back
 * to the plain square AlbumArt.
 */
export function MiniVinyl({ songId, albumId, artist, bpm, playing }: Props) {
  const lowMotion = useLowMotion();
  const [failed, setFailed] = useState<string | null>(null);
  const cover = albumId ? getCoverArtUrl(albumId, 112) : null;
  const vinyl = !lowMotion && !!cover && failed !== songId;
  const beat = useBeat(vinyl ? { id: songId, bpm } : null, playing);

  if (!vinyl) return <AlbumArt albumId={albumId} songId={songId} artist={artist} size="md" isPlaying={playing} />;
  return (
    <div ref={beat?.ref} className="np-vinyl relative size-14 shrink-0" data-playing={playing ? '' : undefined} style={{ '--np-duck': 0.92 } as CSSProperties}>
      <div className="np-pump absolute inset-0" data-beat={beat ? '' : undefined} style={beat?.loop(1)}>
        <div className="np-spin absolute inset-0 overflow-hidden rounded-full bg-black shadow-md shadow-black/50" style={beat ? { animationDuration: `${beat.bar}s` } : undefined}>
          <img src={cover} alt="" className="size-full object-cover" draggable={false} onError={() => setFailed(songId)} />
          <span aria-hidden className="np-grooves np-grooves-sm absolute inset-0 rounded-full" />
        </div>
        <span aria-hidden className="np-shine absolute inset-0 rounded-full" />
        {beat && <span aria-hidden className="np-flash np-flash-sm absolute inset-0 rounded-full" data-beat style={beat.loop(1)} />}
        <span aria-hidden className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0d0f16] ring-[1.5px] ring-white/40" />
      </div>
    </div>
  );
}
