/// <reference types="vite/client" />
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";

import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { authQueryOptions, type AuthQueryResult } from "~/lib/auth/queries";
import appCss from "~/styles.css?url";

import { ThemeProvider } from "~/components/theme-provider";
import { Toaster } from "~/components/ui/sonner";
import { AudioPlayer } from "~/components/ui/audio-player";
import { QueuePanel } from "~/components/ui/queue-panel";
import { MobileNav } from "~/components/ui/mobile-nav";
import { AppLayout } from "~/components/layout";
import { useAudioStore } from "~/lib/stores/audio";
import { useServiceWorker } from "~/lib/hooks/useServiceWorker";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  user: AuthQueryResult;
}>()({
  beforeLoad: async ({ context }) => {
    // we're using react-query for client-side caching to reduce client-to-server calls, see /src/router.tsx
    // better-auth's cookieCache is also enabled server-side to reduce server-to-db calls, see /src/lib/auth/auth.ts
    const user = await context.queryClient.ensureQueryData({
      ...authQueryOptions(),
      revalidateIfStale: true,
    });
    return { user };
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no",
      },
      {
        title: "AIDJ - AI-Assisted Music Library",
      },
      {
        name: "description",
        content: "AIDJ: Your AI-powered music library interface. Browse, stream, and manage your self-hosted music collection with modern UI and local privacy.",
      },
      {
        name: "keywords",
        content: "music, library, streaming, AI, DJ, self-hosted, navidrome, privacy",
      },
      {
        name: "author",
        content: "AIDJ Team",
      },
      // PWA - iOS specific
      {
        name: "apple-mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      {
        name: "apple-mobile-web-app-title",
        content: "AIDJ",
      },
      // PWA - Android/Chrome
      {
        name: "mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "theme-color",
        content: "#7c3aed",
      },
      {
        name: "msapplication-TileColor",
        content: "#7c3aed",
      },
      // Open Graph
      {
        property: "og:title",
        content: "AIDJ - AI-Assisted Music Library",
      },
      {
        property: "og:description",
        content: "Modern music library interface with AI recommendations and local privacy",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "AIDJ - AI-Assisted Music Library",
      },
      {
        name: "twitter:description",
        content: "Your AI-powered music library interface",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // PWA Manifest
      { rel: "manifest", href: "/manifest.json" },
      // iOS icons
      { rel: "apple-touch-icon", href: "/icons/icon-152x152.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/icon-192x192.png" },
      // iOS splash screens (generated for common device sizes)
      { rel: "apple-touch-startup-image", href: "/icons/icon-512x512.png" },
      // Favicon
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/icons/icon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/icons/icon-16x16.png" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { isPlaying, playlist, currentSongIndex } = useAudioStore();
  const hasActiveSong = playlist.length > 0 && currentSongIndex >= 0;
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Register service worker for PWA functionality
  useServiceWorker();

  // Use new AppLayout for main app routes (dashboard, library, playlists, dj, settings, music-identity)
  const useNewLayout = currentPath.startsWith('/dashboard') ||
                       currentPath.startsWith('/library') ||
                       currentPath.startsWith('/playlists') ||
                       currentPath.startsWith('/dj') ||
                       currentPath.startsWith('/downloads') ||
                       currentPath.startsWith('/settings') ||
                       currentPath.startsWith('/music-identity');

  // Routes that should NOT have the new layout (landing, auth pages)
  const isAuthPage = currentPath.startsWith('/login') ||
                     currentPath.startsWith('/signup') ||
                     currentPath === '/';

  return (
    <RootDocument>
      {useNewLayout ? (
        // New three-column layout for main app (includes MobileNav internally)
        <AppLayout>
          <Outlet />
        </AppLayout>
      ) : (
        // Legacy layout for landing/auth pages
        <>
          {!isAuthPage && <MobileNav />}
          <div className={`transition-all duration-300 ${hasActiveSong && !isAuthPage ? 'pb-24 md:pb-20' : ''}`}>
            <Outlet />
          </div>
          {hasActiveSong && !isAuthPage && (
            <>
              <div className={`transition-all duration-300 fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] ${isPlaying ? 'bg-background border-t' : 'opacity-50'}`}>
                <AudioPlayer />
              </div>
              <QueuePanel />
            </>
          )}
        </>
      )}
    </RootDocument>
  );
}

function RootDocument({ children }: { readonly children: React.ReactNode }) {
  return (
    // suppress since we're updating the "dark" class in ThemeProvider
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <Toaster richColors />
        </ThemeProvider>

        {/* Devtools positioned at top-left to avoid covering player bar */}
        <TanStackDevtools
          position="top-left"
          plugins={[
            {
              name: "TanStack Query",
              render: <ReactQueryDevtoolsPanel />,
            },
            {
              name: "TanStack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />

        <Scripts />
      </body>
    </html>
  );
}
