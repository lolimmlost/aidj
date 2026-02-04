import { createFileRoute, redirect, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Cog } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { PageLayout } from '@/components/ui/page-layout';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { ProfileSettings } from './profile';
import { RecommendationSettings } from './recommendations';
import { PlaybackSettings } from './playback';
import { NotificationSettings } from './notifications';
import { LayoutSettings } from './layout';
import { ServicesSettings } from './services';

const VALID_TABS = ['profile', 'services', 'recommendations', 'playback', 'notifications', 'layout'] as const;

export const Route = createFileRoute('/settings/')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: VALID_TABS.includes(search.tab as (typeof VALID_TABS)[number])
      ? (search.tab as (typeof VALID_TABS)[number])
      : undefined,
  }),
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { tab } = useSearch({ from: '/settings/' });
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
        <Tabs defaultValue={tab || 'profile'} className="w-full">
          <TabsList className="w-full grid grid-cols-2 gap-1 h-auto p-1 mb-8 sm:grid-cols-3 lg:grid-cols-6">
            <TabsTrigger value="profile" className="text-xs sm:text-sm py-2">Profile</TabsTrigger>
            <TabsTrigger value="services" className="text-xs sm:text-sm py-2">Services</TabsTrigger>
            <TabsTrigger value="recommendations" className="text-xs sm:text-sm py-2">
              <span className="sm:hidden">Recs</span>
              <span className="hidden sm:inline">Recommendations</span>
            </TabsTrigger>
            <TabsTrigger value="playback" className="text-xs sm:text-sm py-2">Playback</TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs sm:text-sm py-2">
              <span className="sm:hidden">Notifs</span>
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="layout" className="text-xs sm:text-sm py-2">Layout</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileSettings />
          </TabsContent>

          <TabsContent value="services">
            <ServicesSettings />
          </TabsContent>

          <TabsContent value="recommendations">
            <RecommendationSettings />
          </TabsContent>

          <TabsContent value="playback">
            <PlaybackSettings />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationSettings />
          </TabsContent>

          <TabsContent value="layout">
            <LayoutSettings />
          </TabsContent>
        </Tabs>
      )}
    </PageLayout>
  );
}
