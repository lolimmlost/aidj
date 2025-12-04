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
        content: "width=device-width, initial-scale=1",
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
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { isPlaying, playlist, currentSongIndex } = useAudioStore();
  const hasActiveSong = playlist.length > 0 && currentSongIndex >= 0;
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Use new AppLayout for main app routes (dashboard, library, playlists, dj, settings)
  const useNewLayout = currentPath.startsWith('/dashboard') ||
                       currentPath.startsWith('/library') ||
                       currentPath.startsWith('/playlists') ||
                       currentPath.startsWith('/dj') ||
                       currentPath.startsWith('/downloads') ||
                       currentPath.startsWith('/settings');

  // Routes that should NOT have the new layout (landing, auth pages)
  const isAuthPage = currentPath.startsWith('/login') ||
                     currentPath.startsWith('/signup') ||
                     currentPath === '/';

  return (
    <RootDocument>
      {useNewLayout ? (
        // New three-column layout for main app
        <AppLayout>
          <Outlet />
        </AppLayout>
      ) : (
        // Legacy layout for landing/auth pages
        <>
          {!isAuthPage && <MobileNav />}
          <div className={`transition-all duration-300 ${hasActiveSong && !isAuthPage ? 'pb-20 md:pb-16' : ''}`}>
            <Outlet />
          </div>
          {hasActiveSong && !isAuthPage && (
            <>
              <div className={`transition-all duration-300 fixed bottom-0 left-0 right-0 z-50 ${isPlaying ? 'bg-background border-t' : 'opacity-50'}`}>
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

        <TanStackDevtools
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
