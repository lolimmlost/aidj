import { createFileRoute, redirect, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Cog } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { PageLayout } from '@/components/ui/page-layout';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { GeneralSettings } from './general';
import { RecommendationSettings } from './recommendations';
import { PlaybackSettings } from './playback';
import { ServicesSettings } from './services';
import { AlbumArtSettings } from './album-art';
import { SecuritySettings } from './security';

const _NEW_TABS = ['general', 'security', 'services', 'playback', 'ai-dj', 'album-art'] as const;
type NewTab = (typeof _NEW_TABS)[number];

// Map old tab param values to new tab names
const TAB_MIGRATION: Record<string, NewTab> = {
  profile: 'general',
  notifications: 'general',
  layout: 'general',
  services: 'services',
  playback: 'playback',
  recommendations: 'ai-dj',
  security: 'security',
  // New values pass through
  general: 'general',
  'ai-dj': 'ai-dj',
  'album-art': 'album-art',
};

function resolveTab(raw: unknown): NewTab | undefined {
  if (typeof raw !== 'string') return undefined;
  return TAB_MIGRATION[raw];
}

export const Route = createFileRoute('/settings/')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: resolveTab(search.tab),
  }),
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
    return { user: context.user };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { tab } = useSearch({ from: '/settings/' });
  const { user } = Route.useRouteContext();
  const isAdmin = user?.role === 'admin';
  const { loadPreferences, isLoading, error } = usePreferencesStore();

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  return (
    <PageLayout
      title="Settings"
      description="Customize your AIDJ experience"
      icon={<Cog className="h-5 w-5" />}
      backLink=""
    >
      {/* Error Message */}
      {error && (
        <Card className="p-4 bg-destructive/10 border-destructive/30">
          <p className="text-destructive">{error}</p>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      )}

      {/* Settings Tabs */}
      {!isLoading && (
        <Tabs defaultValue={(!isAdmin && tab === 'services') ? 'general' : (tab || 'general')} className="w-full">
          <TabsList className={`w-full grid grid-cols-2 gap-1 h-auto p-1 mb-8 ${isAdmin ? 'sm:grid-cols-6' : 'sm:grid-cols-5'}`}>
            <TabsTrigger value="general" className="text-xs sm:text-sm py-2">General</TabsTrigger>
            <TabsTrigger value="security" className="text-xs sm:text-sm py-2">Security</TabsTrigger>
            {isAdmin && <TabsTrigger value="services" className="text-xs sm:text-sm py-2">Services</TabsTrigger>}
            <TabsTrigger value="playback" className="text-xs sm:text-sm py-2">Playback</TabsTrigger>
            <TabsTrigger value="ai-dj" className="text-xs sm:text-sm py-2">AI DJ</TabsTrigger>
            <TabsTrigger value="album-art" className="text-xs sm:text-sm py-2">Album Art</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <GeneralSettings />
          </TabsContent>

          <TabsContent value="security">
            <SecuritySettings />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="services">
              <ServicesSettings />
            </TabsContent>
          )}

          <TabsContent value="playback">
            <PlaybackSettings />
          </TabsContent>

          <TabsContent value="ai-dj">
            <RecommendationSettings />
          </TabsContent>

          <TabsContent value="album-art">
            <AlbumArtSettings />
          </TabsContent>
        </Tabs>
      )}
    </PageLayout>
  );
}
