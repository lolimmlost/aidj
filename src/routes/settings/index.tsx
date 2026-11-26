import { createFileRoute, useSearch } from '@tanstack/react-router';
import { loginRedirect } from '~/lib/auth/login-redirect';
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
import { ProfileSettings } from './profile';
import { NotificationSettings } from './notifications';
import { AppearanceSettings } from './appearance';
import { useGlassUi } from '@/lib/hooks/useGlassUi';
import { useIsPhone } from '@/components/glass/GlassSheet';
import { GLASS_SETTINGS_TITLES, GlassSettingsIndex, type GlassSettingsTab } from '@/components/glass/GlassSettings';
import { SettingsLookProvider } from '@/components/settings/settings-ui';

const _NEW_TABS = ['general', 'security', 'services', 'playback', 'ai-dj', 'cover-art'] as const;
type ClassicTab = (typeof _NEW_TABS)[number];
// Glass phones give Profile, Notifications and Appearance their own pages; the classic tabs fold
// them into General.
type NewTab = ClassicTab | 'profile' | 'notifications' | 'appearance';
const CLASSIC_TAB: Record<NewTab, ClassicTab> = {
  general: 'general', security: 'security', services: 'services', playback: 'playback', 'ai-dj': 'ai-dj',
  'cover-art': 'cover-art', profile: 'general', notifications: 'general', appearance: 'general',
};

// Map old tab param values to new tab names
const TAB_MIGRATION: Record<string, NewTab> = {
  profile: 'profile',
  notifications: 'notifications',
  appearance: 'appearance',
  layout: 'general',
  services: 'services',
  playback: 'playback',
  recommendations: 'ai-dj',
  security: 'security',
  // New values pass through
  general: 'general',
  'ai-dj': 'ai-dj',
  'cover-art': 'cover-art',
  'album-art': 'cover-art',
};

function resolveTab(raw: unknown): NewTab | undefined {
  if (typeof raw !== 'string') return undefined;
  return TAB_MIGRATION[raw];
}

export const Route = createFileRoute('/settings/')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: resolveTab(search.tab),
  }),
  beforeLoad: async ({ context, location }) => {
    if (!context.user) {
      throw loginRedirect(location);
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
  const glass = useGlassUi();
  const phone = useIsPhone();

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  if (glass && phone) {
    return <GlassSettingsPage tab={tab} isAdmin={isAdmin} error={error} />;
  }

  const classicTab = tab ? CLASSIC_TAB[tab] : undefined;
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
        <Tabs defaultValue={(!isAdmin && (classicTab === 'services' || classicTab === 'cover-art')) ? 'general' : (classicTab || 'general')} className="w-full">
          <TabsList className={`w-full grid grid-cols-2 gap-1 h-auto p-1 mb-8 ${isAdmin ? 'sm:grid-cols-6' : 'sm:grid-cols-4'}`}>
            <TabsTrigger value="general" className="text-xs sm:text-sm py-2">General</TabsTrigger>
            <TabsTrigger value="security" className="text-xs sm:text-sm py-2">Security</TabsTrigger>
            {isAdmin && <TabsTrigger value="services" className="text-xs sm:text-sm py-2">Services</TabsTrigger>}
            <TabsTrigger value="playback" className="text-xs sm:text-sm py-2">Playback</TabsTrigger>
            <TabsTrigger value="ai-dj" className="text-xs sm:text-sm py-2">AI DJ</TabsTrigger>
            {isAdmin && <TabsTrigger value="cover-art" className="text-xs sm:text-sm py-2">Cover Art</TabsTrigger>}
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

          {isAdmin && (
            <TabsContent value="cover-art">
              <AlbumArtSettings />
            </TabsContent>
          )}
        </Tabs>
      )}
    </PageLayout>
  );
}

/** Glass phones: the grouped index (no tab), or one settings page with "‹ Settings". */
function GlassSettingsPage({ tab, isAdmin, error }: { tab?: NewTab; isAdmin: boolean; error: string | null }) {
  const adminOnly = tab === 'services' || tab === 'cover-art';
  const page: GlassSettingsTab | undefined = tab && (!adminOnly || isAdmin) ? tab : undefined;
  const body = (() => {
    switch (page) {
      case 'profile': return <ProfileSettings />;
      case 'notifications': return <NotificationSettings />;
      case 'appearance': return <AppearanceSettings />;
      case 'general': return <GeneralSettings />;
      case 'security': return <SecuritySettings />;
      case 'playback': return <PlaybackSettings />;
      case 'ai-dj': return <RecommendationSettings />;
      case 'services': return <ServicesSettings />;
      case 'cover-art': return <AlbumArtSettings />;
      default: return <GlassSettingsIndex isAdmin={isAdmin} />;
    }
  })();
  return (
    <PageLayout
      title={page ? GLASS_SETTINGS_TITLES[page] : 'Settings'}
      backLink={page ? '/settings' : '/dashboard'}
      backLabel={page ? 'Settings' : 'Dashboard'}
    >
      {error && (
        <Card className="p-4 bg-destructive/10 border-destructive/30">
          <p className="text-destructive">{error}</p>
        </Card>
      )}
      {/* Preferences are kept on the device, so the page shows them at once while the server copy loads. */}
      <SettingsLookProvider value="glass">{body}</SettingsLookProvider>
    </PageLayout>
  );
}
