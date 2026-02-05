import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { toast } from 'sonner';
import { useEffect, useCallback, Suspense, lazy } from 'react';
import authClient from '@/lib/auth/auth-client';
import { useAudioStore } from '@/lib/stores/audio';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { Skeleton } from '@/components/ui/skeleton';
import { hasLegacyFeedback, migrateLegacyFeedback, isMigrationCompleted } from '@/lib/utils/feedback-migration';
// Critical components - loaded immediately
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { QuickActions, type StylePreset } from '@/components/dashboard/quick-actions';
import { DiscoveryQueueSection } from '@/components/dashboard/DiscoveryQueueSection';
// Lazy loading utilities for deferred content
import { useDeferredRender, FeatureCardSkeleton } from '@/lib/utils/lazy-components';
import { Sparkles, Music, ArrowRight } from 'lucide-react';

// Lazy-loaded components for non-critical sections
const MoreFeatures = lazy(() => import('@/components/dashboard/MoreFeatures').then(m => ({ default: m.MoreFeatures })));

export const Route = createFileRoute("/dashboard/")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: DashboardIndex,
});

function DashboardIndex() {
  const { data: session } = authClient.useSession();
  const { preferences, loadPreferences } = usePreferencesStore();

  // Load user preferences on mount
  useEffect(() => {
    if (session) {
      loadPreferences();
    }
  }, [session, loadPreferences]);

  // Sync crossfade settings from preferences to audio store
  useEffect(() => {
    if (preferences?.playbackSettings?.crossfadeDuration !== undefined) {
      const audioStore = useAudioStore.getState();
      if (audioStore.crossfadeDuration !== preferences.playbackSettings.crossfadeDuration) {
        audioStore.setCrossfadeDuration(preferences.playbackSettings.crossfadeDuration);
      }
    }
  }, [preferences?.playbackSettings?.crossfadeDuration]);

  // Check for legacy feedback and prompt migration
  useEffect(() => {
    if (!session) return;

    if (!isMigrationCompleted() && hasLegacyFeedback()) {
      toast.info('Migrate your feedback?', {
        description: 'Sync your song feedback across devices',
        duration: 10000,
        action: {
          label: 'Migrate',
          onClick: async () => {
            toast.loading('Migrating feedback...', { id: 'feedback-migration' });
            try {
              const result = await migrateLegacyFeedback();
              if (result.success && result.migratedCount > 0) {
                toast.success(`Migrated ${result.migratedCount} feedback items`, {
                  id: 'feedback-migration',
                  description: 'Your feedback is now synced across devices',
                });
              } else if (result.failedCount > 0) {
                toast.warning(`Migrated ${result.migratedCount}, failed ${result.failedCount}`, {
                  id: 'feedback-migration',
                  description: 'Some items could not be migrated',
                });
              } else {
                toast.success('No feedback to migrate', { id: 'feedback-migration' });
              }
            } catch (error) {
              toast.error('Migration failed', {
                id: 'feedback-migration',
                description: error instanceof Error ? error.message : 'Please try again',
              });
            }
          },
        },
      });
    }
  }, [session]);

  // AI DJ state for hero display
  const playlist = useAudioStore((state) => state.playlist);
  const currentSongIndex = useAudioStore((state) => state.currentSongIndex);

  const lastPlayedSong = playlist[currentSongIndex]
    ? {
        title: playlist[currentSongIndex].title || playlist[currentSongIndex].name || 'Unknown',
        artist: playlist[currentSongIndex].artist || 'Unknown Artist',
      }
    : null;

  const handleContinueListening = useCallback(() => {
    const { isPlaying, setIsPlaying } = useAudioStore.getState();
    if (!isPlaying) {
      setIsPlaying(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-20 overflow-x-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Hero Section */}
        <DashboardHero
          userName={session?.user?.name}
          availableRecommendations={0}
          playlistSongsReady={0}
        />

        {/* Quick Actions - navigates to /dashboard/generate */}
        <QuickActions
          lastPlayedSong={lastPlayedSong}
          onContinueListening={handleContinueListening}
        />

        {/* AI Studio Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/dashboard/generate"
            className="group rounded-xl border bg-card p-5 hover:border-primary/30 hover:bg-accent/50 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-primary/10 p-2.5 text-primary group-hover:bg-primary/20 transition-colors">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  AI Recommendations
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors group-hover:translate-x-0.5" />
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Discover new songs based on your library and taste
                </p>
              </div>
            </div>
          </Link>

          <Link
            to="/dashboard/generate"
            className="group rounded-xl border bg-card p-5 hover:border-primary/30 hover:bg-accent/50 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-violet-500/10 p-2.5 text-violet-500 group-hover:bg-violet-500/20 transition-colors">
                <Music className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  Playlist Studio
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-violet-500 transition-colors group-hover:translate-x-0.5" />
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Generate custom playlists with AI from any mood or style
                </p>
              </div>
            </div>
          </Link>
        </div>

        <DiscoveryQueueSection />

        {/* Additional Features - Deferred loading */}
        <DeferredMoreFeatures />
      </div>
    </div>
  );
}

/**
 * Deferred MoreFeatures - loads after initial render
 * Bottom of page content, lowest priority
 */
function DeferredMoreFeatures() {
  const shouldRender = useDeferredRender(2000);

  if (!shouldRender) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-5 w-32 mx-auto" />
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <Suspense
      fallback={
        <section className="space-y-4">
          <Skeleton className="h-5 w-32 mx-auto" />
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </section>
      }
    >
      <MoreFeatures />
    </Suspense>
  );
}
