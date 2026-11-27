import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { loginRedirect } from '~/lib/auth/login-redirect';
import { useEffect } from 'react';
import { Cog } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { PageLayout } from '@/components/ui/page-layout';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { RecommendationSettings } from './recommendations';
import { PlaybackSettings } from './playback';
import { ServicesSettings } from './services';
import { AlbumArtSettings } from './album-art';
import { SecuritySettings } from './security';
import { ProfileSettings } from './profile';
import { AppearanceSettings } from './appearance';
import { useGlassUi } from '@/lib/hooks/useGlassUi';
import { useIsPhone } from '@/components/glass/GlassSheet';
import { GlassBackPill } from '@/components/glass/GlassBackPill';
import { GLASS_SETTINGS_TITLES, GlassSettingsIndex, type GlassSettingsTab } from '@/components/glass/GlassSettings';
import { SettingsLookProvider } from '@/components/settings/settings-ui';

const _CLASSIC_TABS = ['profile', 'security', 'services', 'playback', 'ai-dj', 'cover-art'] as const;
type ClassicTab = (typeof _CLASSIC_TABS)[number];
// The glass design adds an Appearance page; the classic layout has the theme toggle in its header.
type NewTab = ClassicTab | 'appearance';
const CLASSIC_TAB: Record<NewTab, ClassicTab> = {
  profile: 'profile', security: 'security', services: 'services', playback: 'playback', 'ai-dj': 'ai-dj',
  'cover-art': 'cover-art', appearance: 'profile',
};

// Map old tab param values to new tab names
const TAB_MIGRATION: Record<string, NewTab> = {
  profile: 'profile',
  appearance: 'appearance',
  // Retired pages (their settings did nothing): old links land on Profile.
  general: 'profile',
  notifications: 'profile',
  layout: 'profile',
  services: 'services',
  playback: 'playback',
  recommendations: 'ai-dj',
  security: 'security',
  // New values pass through
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
  const navigate = useNavigate();

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  if (glass) {
    return <GlassSettingsPage tab={tab} isAdmin={isAdmin} error={error} wide={!phone} />;
  }

  const wanted: ClassicTab = tab ? CLASSIC_TAB[tab] : 'profile';
  // Controlled by ?tab=, so a link to another tab (or Back) switches it, not just the first load.
  const classicTab: ClassicTab = !isAdmin && (wanted === 'services' || wanted === 'cover-art') ? 'profile' : wanted;
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
        <Tabs
          value={classicTab}
          onValueChange={(v) => navigate({ to: '/settings', search: { tab: v as ClassicTab }, replace: true })}
          className="w-full"
        >
          <TabsList className={`w-full grid grid-cols-2 gap-1 h-auto p-1 mb-8 ${isAdmin ? 'sm:grid-cols-6' : 'sm:grid-cols-4'}`}>
            <TabsTrigger value="profile" className="text-xs sm:text-sm py-2">Profile</TabsTrigger>
            <TabsTrigger value="security" className="text-xs sm:text-sm py-2">Security</TabsTrigger>
            {isAdmin && <TabsTrigger value="services" className="text-xs sm:text-sm py-2">Services</TabsTrigger>}
            <TabsTrigger value="playback" className="text-xs sm:text-sm py-2">Playback</TabsTrigger>
            <TabsTrigger value="ai-dj" className="text-xs sm:text-sm py-2">AI DJ</TabsTrigger>
            {isAdmin && <TabsTrigger value="cover-art" className="text-xs sm:text-sm py-2">Cover Art</TabsTrigger>}
          </TabsList>

          <TabsContent value="profile">
            <ProfileSettings />
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

/**
 * Glass design. Phones: the grouped index (no tab), or one settings page with "‹ Settings".
 * Wider screens (iPad and up): a split view, the index on the left and the open page on the right.
 */
function GlassSettingsPage({ tab, isAdmin, error, wide }: { tab?: NewTab; isAdmin: boolean; error: string | null; wide: boolean }) {
  const navigate = useNavigate();
  const adminOnly = tab === 'services' || tab === 'cover-art';
  const chosen: GlassSettingsTab | undefined = tab && (!adminOnly || isAdmin) ? tab : undefined;
  // The split view always has a page open.
  const page: GlassSettingsTab | undefined = chosen ?? (wide ? 'profile' : undefined);
  const body = (() => {
    switch (page) {
      case 'profile': return <ProfileSettings />;
      case 'appearance': return <AppearanceSettings />;
      case 'security': return <SecuritySettings />;
      case 'playback': return <PlaybackSettings />;
      case 'ai-dj': return <RecommendationSettings />;
      case 'services': return <ServicesSettings />;
      case 'cover-art': return <AlbumArtSettings />;
      default: return <GlassSettingsIndex isAdmin={isAdmin} />;
    }
  })();
  const errorCard = error && (
    <Card className="p-4 bg-destructive/10 border-destructive/30">
      <p className="text-destructive">{error}</p>
    </Card>
  );

  if (wide) {
    return (
      <PageLayout title="Settings" backLink="/dashboard" backLabel="Dashboard">
        {errorCard}
        <SettingsLookProvider value="glass">
          <div className="grid items-start gap-6 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="md:sticky md:top-[calc(env(safe-area-inset-top)+var(--top-bar)+1rem)]">
              <GlassSettingsIndex isAdmin={isAdmin} active={page} />
            </aside>
            <section aria-labelledby="settings-page-title" className="min-w-0">
              <h2 id="settings-page-title" className="mb-4 font-display text-[26px] font-extrabold tracking-[-0.03em]">
                {page ? GLASS_SETTINGS_TITLES[page] : 'Settings'}
              </h2>
              {body}
            </section>
          </div>
        </SettingsLookProvider>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={page ? GLASS_SETTINGS_TITLES[page] : 'Settings'}
      backLink={page ? '/settings' : '/dashboard'}
      backLabel={page ? 'Settings' : 'Dashboard'}
    >
      {errorCard}
      {/* Preferences are kept on the device, so the page shows them at once while the server copy loads. */}
      <SettingsLookProvider value="glass">
        {page ? (
          // A sub-page: as you scroll, the title slides into a ‹ pill (like playlists and Liked Songs)
          <div className="relative">
            <GlassBackPill
              title={GLASS_SETTINGS_TITLES[page]}
              backLabel="Back to Settings"
              onBack={() => navigate({ to: '/settings', search: { tab: undefined } })}
            />
            {body}
          </div>
        ) : (
          body
        )}
      </SettingsLookProvider>
    </PageLayout>
  );
}
