import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Disc3, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAudioStore } from '@/lib/stores/audio';
import { FEATURED_MIX_ID } from '@/lib/config/featured-mix';
import { mixDisplayTitle, parseMixTracklist } from '@/lib/utils/mix-tracklist';
import { cn } from '@/lib/utils';

interface MixSong {
  id: string;
  title: string;
  album?: string;
  albumId: string;
  artist?: string;
  artistId?: string;
  duration: number;
  track?: number;
  comment?: string;
}

const PREVIEW_TRACKS = 6;

function useMixSong(id: string) {
  return useQuery({
    queryKey: ['featured-mix', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/navidrome/rest/getSong?id=${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return (data['subsonic-response']?.song as MixSong | undefined) ?? null;
    },
    staleTime: 30 * 60 * 1000,
  });
}

/** One published AIDJ mix, highlighted at the top of the dashboard (#351). Renders nothing if the mix isn't found. */
export function FeaturedMixCard({ songId = FEATURED_MIX_ID }: { songId?: string }) {
  const { data: mix, isLoading } = useMixSong(songId);
  const [expanded, setExpanded] = useState(false);
  const isCurrent = useAudioStore((s) => !!mix && s.playlist[s.currentSongIndex]?.id === mix.id);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playSong = useAudioStore((s) => s.playSong);
  const setIsPlaying = useAudioStore((s) => s.setIsPlaying);

  if (!songId) return null;
  if (isLoading) return <Skeleton className="h-44 w-full rounded-2xl" />;
  if (!mix) return null;

  const tracks = parseMixTracklist(mix.comment);
  const shown = expanded ? tracks : tracks.slice(0, PREVIEW_TRACKS);
  const minutes = Math.round(mix.duration / 60);
  const playingThis = isCurrent && isPlaying;

  const handlePlay = () => {
    if (isCurrent) {
      setIsPlaying(!isPlaying);
      return;
    }
    playSong(mix.id, [{
      id: mix.id,
      name: mix.title,
      title: mix.title,
      artist: mix.artist,
      artistId: mix.artistId,
      album: mix.album,
      albumId: mix.albumId,
      url: `/api/navidrome/stream/${mix.id}`,
      duration: mix.duration,
      track: mix.track ?? 0,
    }]);
    setIsPlaying(true);
  };

  return (
    <section
      aria-labelledby="featured-mix-title"
      className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-card to-card p-4 sm:p-6"
    >
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="grid size-20 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary sm:size-28">
          <Disc3 className={cn('size-10 sm:size-14', playingThis && 'motion-safe:animate-[spin_4s_linear_infinite]')} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            Featured mix{mix.album ? ` · ${mix.album}` : ''}
          </p>
          <h2 id="featured-mix-title" className="mt-1 truncate text-xl font-bold sm:text-2xl">
            {mixDisplayTitle(mix.title)}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[mix.artist, `${minutes} min`, tracks.length ? `${tracks.length} tracks` : null].filter(Boolean).join(' · ')}
          </p>
          <Button size="lg" className="mt-3 gap-2 rounded-full" onClick={handlePlay}>
            {playingThis ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
            {playingThis ? 'Pause' : isCurrent ? 'Resume' : 'Play mix'}
          </Button>
        </div>
      </div>

      {tracks.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2" aria-label="Tracklist">
            {shown.map((t) => (
              <li key={`${t.position}-${t.time}`} className="flex min-w-0 gap-3 text-sm">
                <span className="w-11 shrink-0 tabular-nums text-muted-foreground">{t.time}</span>
                <span className="min-w-0 truncate">
                  <span className="font-medium">{t.title}</span>
                  {t.artist && <span className="text-muted-foreground"> · {t.artist}</span>}
                </span>
              </li>
            ))}
          </ol>
          {tracks.length > PREVIEW_TRACKS && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              aria-expanded={expanded}
            >
              {expanded ? 'Show less' : `Show all ${tracks.length}`}
              <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
