import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { toast } from 'sonner';
import { useState, useEffect, useCallback, useRef } from 'react';
import authClient from '@/lib/auth/auth-client';
import { useAudioStore } from '@/lib/stores/audio';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { useOnboardingStatus } from '@/lib/hooks/useOnboardingStatus';
import { DATA_MATURITY } from '@/lib/constants/onboarding';
import { useQueryClient } from '@tanstack/react-query';
import { hasLegacyFeedback, migrateLegacyFeedback, isMigrationCompleted } from '@/lib/utils/feedback-migration';
// Critical components - loaded immediately
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { DiscoveryQueueSection } from '@/components/dashboard/DiscoveryQueueSection';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { FeatureTeaser } from '@/components/dashboard/FeatureTeaser';
import { ProfileNudge } from '@/components/onboarding/ProfileNudge';
import { Sparkles, Music, ArrowRight } from 'lucide-react';

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
  const queryClient = useQueryClient();
  const { preferences, loadPreferences } = usePreferencesStore();
  const { onboardingCompleted, onboardingSkipped, dataMaturity, isLoading: onboardingLoading } = useOnboardingStatus();
  const [radioLoading, setRadioLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // Determine dashboard tier
  const historyCount = dataMaturity?.listeningHistoryCount ?? 0;
  const tier = onboardingLoading ? 1
    : historyCount >= DATA_MATURITY.READY ? 3
    : historyCount >= DATA_MATURITY.EMERGING ? 2
    : 1;

  const showOnboarding = tier === 1 && !onboardingCompleted && !onboardingSkipped;

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

  // Radio session play counter — trigger profile refresh every 10 plays
  const radioPlayCount = useAudioStore((s) => s.radioSessionPlayCount);
  const lastRefreshTrigger = useRef(0);
  useEffect(() => {
    if (radioPlayCount >= 10 && Math.floor(radioPlayCount / 10) > Math.floor(lastRefreshTrigger.current / 10)) {
      lastRefreshTrigger.current = radioPlayCount;
      fetch('/api/listening-history/compound-scores', {
        method: 'POST',
        credentials: 'include',
      }).then(() => {
        // Refresh onboarding status to trigger tier transition (IG-3)
        queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      }).catch(() => {
        // Non-blocking, ignore errors
      });
    }
  }, [radioPlayCount, queryClient]);

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

  const handleStartRadio = useCallback(async () => {
    setRadioLoading(true);
    try {
      const res = await fetch('/api/radio/shuffle', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch radio songs');
      const json = await res.json();
      const songs = json.data?.songs || [];
      if (songs.length === 0) {
        toast.error('No songs available for radio');
        return;
      }

      const audioStore = useAudioStore.getState();
      audioStore.setIsRadioSession(true);
      audioStore.setPlaylist(songs);
      audioStore.playSong(songs[0].id, songs);
      audioStore.setIsPlaying(true);
    } catch (error) {
      console.error('Failed to start radio:', error);
      toast.error('Failed to start radio');
    } finally {
      setRadioLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-20 overflow-x-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 pt-[calc(env(safe-area-inset-top)+4rem)] md:pt-[env(safe-area-inset-top)] space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Hero Section */}
        <DashboardHero
          userName={session?.user?.name}
          availableRecommendations={0}
          playlistSongsReady={0}
          showRadioButton={tier >= 2 || onboardingCompleted}
          onStartRadio={handleStartRadio}
          radioLoading={radioLoading}
        />

        {/* Tier 1: New User — Show onboarding wizard */}
        {showOnboarding && !showWizard && (
          <OnboardingWizard />
        )}

        {/* Nudge for users who skipped onboarding */}
        {onboardingSkipped && !onboardingCompleted && (
          <ProfileNudge onStartWizard={() => setShowWizard(true)} />
        )}
        {showWizard && onboardingSkipped && (
          <OnboardingWizard />
        )}

        {/* Quick Actions - Tier 2+ */}
        {tier >= 2 && (
          <QuickActions
            lastPlayedSong={lastPlayedSong}
            onContinueListening={handleContinueListening}
          />
        )}

        {/* AI Studio Feature Cards — Tier 2: teasers, Tier 3: full */}
        {tier === 2 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FeatureTeaser
              title="AI Recommendations"
              description="Discover new songs based on your library and taste"
              icon={Sparkles}
              progress={historyCount}
              total={DATA_MATURITY.READY}
              locked={true}
            />
            <FeatureTeaser
              title="Playlist Studio"
              description="Generate custom playlists with AI from any mood or style"
              icon={Music}
              progress={historyCount}
              total={DATA_MATURITY.READY}
              locked={true}
            />
          </div>
        )}

        {tier >= 3 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              to="/dashboard/generate"
              search={{ section: 'recommendations' }}
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
              search={{ section: 'playlist' }}
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
        )}

        {/* Discovery Queue — Tier 3 only */}
        {tier >= 3 && (
          <DiscoveryQueueSection />
        )}
      </div>
    </div>
  );
}
