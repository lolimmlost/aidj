import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { DefaultCatchBoundary } from "@/components/default-catch-boundary";
import { DefaultNotFound } from "@/components/default-not-found";
import { routeTree } from "./routeTree.gen";
import { defaultQueryOptions } from "@/lib/query";
import { supportsViewTransitionTypes } from "@/lib/utils/view-transition";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        ...defaultQueryOptions,
        // Structural sharing helps prevent unnecessary re-renders
        structuralSharing: true,
      },
    },
  });

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient, user: null },
    defaultPreload: "intent",
    // react-query will handle data fetching & caching
    // https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#passing-all-loader-events-to-an-external-cache
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: DefaultNotFound,
    scrollRestoration: true,
    defaultStructuralSharing: true,
    // Page transitions (#289). Only where typed view transitions exist, so
    // search-param-only updates (e.g. typing in search) can opt out; older
    // engines just navigate instantly. Styles: "View Transitions" in styles.css.
    defaultViewTransition: supportsViewTransitionTypes()
      ? { types: ({ pathChanged }) => (pathChanged ? ["page"] : false) }
      : false,
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    handleRedirects: true,
    wrapQueryClient: true,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
