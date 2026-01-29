/// <reference types="vite/client" />
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";

import { authQueryOptions, type AuthQueryResult } from "~/lib/auth/queries";
import appCss from "~/styles.css?url";

import { ThemeProvider } from "~/components/theme-provider";
import { Toaster } from "~/components/ui/sonner";
import { PlayerBar } from "~/components/layout/PlayerBar";
import { QueuePanel } from "~/components/ui/queue-panel";
import { MobileNav } from "~/components/ui/mobile-nav";
import { AppLayout } from "~/components/layout";
import { useAudioStore } from "~/lib/stores/audio";
import { useServiceWorker } from "~/lib/hooks/useServiceWorker";
import { useEruda } from "~/lib/hooks/useEruda";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  user: AuthQueryResult;
}>()({
  beforeLoad: async ({ context }) => {
    // we're using react-query for client-side caching to reduce client-to-server calls, see /src/router.tsx
    // better-auth's cookieCache is also enabled server-side to reduce server-to-db calls, see /src/lib/auth/auth.ts
    const user = await context.queryClient.ensureQueryData({
      ...authQueryOptions(),
      revalidateIfStale: false,
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
        title: "AIDJ",
      },
      {
        name: "description",
        content: "AI-powered music discovery and smart playlists for your self-hosted library.",
      },
      {
        name: "keywords",
        content: "music, AI, DJ, playlists, streaming, navidrome, self-hosted",
      },
      {
        name: "author",
        content: "AIDJ",
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
        content: "#8b5cf6",
      },
      {
        name: "msapplication-TileColor",
        content: "#8b5cf6",
      },
      // Open Graph
      {
        property: "og:title",
        content: "AIDJ",
      },
      {
        property: "og:description",
        content: "AI-powered music discovery and smart playlists",
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
        content: "AIDJ",
      },
      {
        name: "twitter:description",
        content: "AI-powered music discovery and smart playlists",
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

  // Load Eruda debug console if ?debug=true in URL
  useEruda();

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
          {/* CRITICAL: Always render PlayerBar to preserve audio elements across state changes.
             Unmounting destroys <audio> elements and kills playback. Hide visually instead. */}
          {!isAuthPage && (
            <>
              <div className={`transition-all duration-300 fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] ${!hasActiveSong ? 'hidden' : isPlaying ? 'bg-background border-t' : 'opacity-50'}`}>
                <PlayerBar />
              </div>
              {hasActiveSong && <QueuePanel />}
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

        <Scripts />
      </body>
    </html>
  );
}
