import { Link } from '@tanstack/react-router';
import { Play, Pause, Music2, Disc3, Sparkles, TrendingUp, TrendingDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAudioStore } from '@/lib/stores/audio';
import { cn } from '@/lib/utils';
import { formatPercentChange } from '@/lib/utils/period-comparison';

interface DashboardHeroProps {
  userName?: string;
  availableRecommendations: number;
  playlistSongsReady: number;
}

interface ListeningStatsResponse {
  success: boolean;
  preset: string;
  current: {
    totalPlays: number;
    uniqueTracks: number;
    uniqueArtists: number;
    totalMinutesListened: number;
    completionRate: number;
  };
  deltas: {
    totalPlays: number | null;
    uniqueTracks: number | null;
    uniqueArtists: number | null;
    totalMinutesListened: number | null;
  };
  diversity: {
    entropy: number;
    uniqueArtists: number;
  };
}

/**
 * Dashboard hero section with immersive gradient design
 * Features: Ambient glow, now playing widget, greeting, quick stats
 */
export function DashboardHero({
  userName,
  availableRecommendations,
  playlistSongsReady,
}: DashboardHeroProps) {
  const currentSong = useAudioStore((s) => s.playlist[s.currentSongIndex]);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const setIsPlaying = useAudioStore((s) => s.setIsPlaying);
  const aiDJEnabled = useAudioStore((s) => s.aiDJEnabled);

  const { data: stats } = useQuery<ListeningStatsResponse>({
    queryKey: ['listening-stats', 'week'],
    queryFn: async () => {
      const res = await fetch('/api/listening-history/stats?preset=week');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getTimeEmoji = () => {
    const hour = new Date().getHours();
    if (hour < 6) return '🌙';
    if (hour < 12) return '☀️';
    if (hour < 18) return '🌤️';
    if (hour < 21) return '🌆';
    return '🌙';
  };

  return (
    <section className="hero-section p-6 sm:p-8 lg:p-10">
      {/* Ambient Glow Effects */}
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-glow-secondary" aria-hidden="true" />

      {/* Content */}
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 lg:gap-8">
        {/* Left: Greeting & Context */}
        <div className="flex-1 space-y-4">
          <div className="animate-fade-up">
            <span className="text-2xl sm:text-3xl">{getTimeEmoji()}</span>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mt-2">
              {getGreeting()},{' '}
              <span className="text-gradient-brand">{userName || 'Music Lover'}</span>
            </h1>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-lg">
              {currentSong
                ? 'Pick up where you left off or discover something new'
                : 'Ready to start your listening session?'}
            </p>
          </div>

          {/* Quick Stats - Desktop */}
          <div className="hidden sm:flex items-center gap-3 stagger-children flex-wrap">
            {stats?.current && (
              <>
                <StatPill
                  label="Plays this week"
                  value={stats.current.totalPlays}
                  color="violet"
                  delta={stats.deltas?.totalPlays}
                />
                <StatPill
                  label="Artists"
                  value={stats.current.uniqueArtists}
                  color="amber"
                  delta={stats.deltas?.uniqueArtists}
                />
              </>
            )}
            <StatPill
              label="Recommendations"
              value={availableRecommendations}
              color="violet"
            />
            <StatPill
              label="Ready to play"
              value={playlistSongsReady}
              color="emerald"
            />
            {aiDJEnabled && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-primary">AI DJ Active</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Now Playing Widget or Start CTA */}
        {currentSong ? (
          <NowPlayingWidget
            song={currentSong}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
          />
        ) : (
          <StartListeningCTA />
        )}
      </div>

      {/* Mobile Quick Stats */}
      <div className="flex sm:hidden items-center gap-2 mt-4 overflow-x-auto pb-1">
        {stats?.current && (
          <StatPill
            label="Plays"
            value={stats.current.totalPlays}
            color="violet"
            delta={stats.deltas?.totalPlays}
            compact
          />
        )}
        <StatPill label="Recs" value={availableRecommendations} color="violet" compact />
        <StatPill label="Ready" value={playlistSongsReady} color="emerald" compact />
        {aiDJEnabled && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-primary">AI DJ</span>
          </div>
        )}
      </div>
    </section>
  );
}

interface StatPillProps {
  label: string;
  value: number;
  color: 'violet' | 'emerald' | 'amber';
  compact?: boolean;
  delta?: number | null;
}

function StatPill({ label, value, color, compact = false, delta }: StatPillProps) {
  const colorClasses = {
    violet: 'bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400',
  };

  const formattedDelta = delta != null ? formatPercentChange(delta) : null;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border shrink-0',
        colorClasses[color],
        compact ? 'px-2.5 py-1' : 'px-3 py-1.5'
      )}
    >
      <span className={cn('font-bold', compact ? 'text-sm' : 'text-base')}>{value}</span>
      <span className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-xs')}>
        {label}
      </span>
      {formattedDelta && (
        <span
          className={cn(
            'flex items-center gap-0.5 text-xs font-medium',
            delta != null && delta > 0 && 'text-emerald-600 dark:text-emerald-400',
            delta != null && delta < 0 && 'text-red-500 dark:text-red-400',
            delta === 0 && 'text-muted-foreground'
          )}
        >
          {delta != null && delta > 0 && <TrendingUp className="w-3 h-3" />}
          {delta != null && delta < 0 && <TrendingDown className="w-3 h-3" />}
          {formattedDelta}
        </span>
      )}
    </div>
  );
}

interface NowPlayingWidgetProps {
  song: { name?: string; title?: string; artist?: string; albumArt?: string };
  isPlaying: boolean;
  onTogglePlay: () => void;
}

function NowPlayingWidget({ song, isPlaying, onTogglePlay }: NowPlayingWidgetProps) {
  const title = song.title || song.name || 'Unknown Track';
  const artist = song.artist || 'Unknown Artist';

  return (
    <div className="now-playing-card p-4 sm:p-5 w-full lg:w-auto lg:min-w-[320px] animate-fade-up">
      <div className="relative z-10 flex items-center gap-4">
        {/* Album Art / Vinyl */}
        <div className="relative">
          <div
            className={cn(
              'w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center',
              'vinyl-spin',
              isPlaying && 'playing'
            )}
          >
            <Disc3 className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
          </div>
          {isPlaying && (
            <div className="absolute inset-0 rounded-full bg-primary/10 pulse-ring" />
          )}
        </div>

        {/* Song Info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Now Playing
          </p>
          <h3 className="font-semibold text-base sm:text-lg truncate">{title}</h3>
          <p className="text-sm text-muted-foreground truncate">{artist}</p>

          {/* Audio Wave */}
          {isPlaying && (
            <div className="audio-wave mt-2">
              <div className="audio-wave-bar" />
              <div className="audio-wave-bar" />
              <div className="audio-wave-bar" />
              <div className="audio-wave-bar" />
              <div className="audio-wave-bar" />
            </div>
          )}
        </div>

        {/* Play/Pause Button */}
        <button
          onClick={onTogglePlay}
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center transition-all',
            'bg-primary text-primary-foreground hover:scale-105 active:scale-95',
            'shadow-lg shadow-primary/25'
          )}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5" fill="currentColor" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
          )}
        </button>
      </div>
    </div>
  );
}

function StartListeningCTA() {
  return (
    <Link
      to="/library"
      className="glass-card-premium p-5 sm:p-6 w-full lg:w-auto lg:min-w-[320px] animate-fade-up group"
    >
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group-hover:scale-105 transition-transform">
          <Music2 className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2">
            Start Listening
            <Sparkles className="w-4 h-4 text-primary" />
          </h3>
          <p className="text-sm text-muted-foreground">
            Browse your library or let AI DJ take over
          </p>
        </div>
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <Play className="w-4 h-4 text-primary ml-0.5" />
        </div>
      </div>
    </Link>
  );
}
