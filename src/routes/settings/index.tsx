import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { usePreferencesStore } from '@/lib/stores/preferences';
import { ProfileSettings } from './profile';
import { RecommendationSettings } from './recommendations';
import { PlaybackSettings } from './playback';
import { NotificationSettings } from './notifications';
import { LayoutSettings } from './layout';
import { ServicesSettings } from './services';

export const Route = createFileRoute('/settings/')({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' });
    }
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { loadPreferences, isLoading, error } = usePreferencesStore();

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Breadcrumb Navigation */}
      <div className="mb-6">
        <Link
          to="/dashboard"
          className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Customize your AIDJ experience
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <Card className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">Loading settings...</p>
        </div>
      )}

      {/* Settings Tabs */}
      {!isLoading && (
        <Tabs defaultValue="profile" className="w-full">
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
    </div>
  );
}
