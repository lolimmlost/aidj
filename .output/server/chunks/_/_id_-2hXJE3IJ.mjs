import { jsxs, jsx } from 'react/jsx-runtime';
import { useParams, useNavigate, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { f as getAlbums } from './ssr.mjs';
import { Music, Loader2 } from 'lucide-react';
import { C as Card, c as CardContent } from './card-B5xu2Fa9.mjs';
import 'react';
import '@tanstack/router-ssr-query-core';
import '@radix-ui/react-slot';
import 'class-variance-authority';
import 'clsx';
import 'tailwind-merge';
import '@tanstack/react-devtools';
import '@tanstack/react-query-devtools';
import 'better-auth';
import 'better-auth/adapters/drizzle';
import 'better-auth/react-start';
import '@t3-oss/env-core';
import 'zod';
import 'drizzle-orm/postgres-js';
import 'postgres';
import 'drizzle-orm/pg-core';
import 'tiny-invariant';
import 'tiny-warning';
import '@tanstack/router-core';
import '@tanstack/router-core/ssr/client';
import 'node:async_hooks';
import 'sonner';
import 'zustand';
import 'crypto';
import '@tanstack/history';
import '@tanstack/router-core/ssr/server';
import '@tanstack/react-router/ssr/server';

function ArtistAlbums() {
  const {
    id
  } = useParams({
    from: "/library/artists/id"
  });
  const navigate = useNavigate();
  const {
    data: albums = [],
    isLoading: loadingAlbums,
    error
  } = useQuery({
    queryKey: ["albums", id],
    queryFn: () => getAlbums(id, 0, 50)
  });
  if (error) {
    return /* @__PURE__ */ jsxs("div", { className: "container mx-auto p-6", children: [
      "Error loading albums: ",
      error.message
    ] });
  }
  const sortedAlbums = [...albums].sort((a, b) => a.name.localeCompare(b.name));
  return /* @__PURE__ */ jsxs("div", { className: "container mx-auto p-6 space-y-6", children: [
    /* @__PURE__ */ jsx(Card, { className: "fade-in", children: /* @__PURE__ */ jsx(CardContent, { className: "p-6", children: /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start mb-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsx("div", { className: "w-16 h-16 bg-muted rounded-full flex items-center justify-center", children: /* @__PURE__ */ jsx(Music, { className: "h-8 w-8 text-muted-foreground" }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Artist Albums" }),
          /* @__PURE__ */ jsxs("p", { className: "text-muted-foreground mt-1", children: [
            albums.length,
            " ",
            albums.length === 1 ? "album" : "albums"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "text-primary hover:underline text-sm", children: "\u2190 Dashboard" })
    ] }) }) }),
    loadingAlbums ? /* @__PURE__ */ jsx("div", { className: "flex justify-center py-12", children: /* @__PURE__ */ jsx(Loader2, { className: "h-8 w-8 animate-spin text-muted-foreground" }) }) : sortedAlbums.length === 0 ? /* @__PURE__ */ jsx(Card, { className: "text-center py-12", children: /* @__PURE__ */ jsxs(CardContent, { children: [
      /* @__PURE__ */ jsx(Music, { className: "h-12 w-12 text-muted-foreground mx-auto mb-4" }),
      /* @__PURE__ */ jsx("p", { className: "text-muted-foreground", children: "No albums found for this artist." }),
      /* @__PURE__ */ jsx("p", { className: "text-sm mt-2 text-muted-foreground", children: "Check your library configuration." })
    ] }) }) : /* @__PURE__ */ jsx("div", { className: "fade-in", children: /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4", children: sortedAlbums.map((album) => /* @__PURE__ */ jsx(Card, { className: "cursor-pointer transition-shadow hover:shadow-md border-border/50 overflow-hidden", children: /* @__PURE__ */ jsx(CardContent, { className: "p-0", children: /* @__PURE__ */ jsxs("div", { className: "block p-4 hover:bg-accent hover:text-accent-foreground transition-colors", onClick: () => navigate({
      to: "/library/artists/id/albums/albumId",
      params: {
        id,
        albumId: album.id
      }
    }), children: [
      /* @__PURE__ */ jsx("div", { className: "aspect-square w-full rounded-lg mb-3 overflow-hidden bg-muted", children: /* @__PURE__ */ jsx("img", { src: album.artwork || "/placeholder-album.jpg", alt: album.name, className: "w-full h-full object-cover", loading: "lazy" }) }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsx("div", { className: "font-semibold line-clamp-1 text-foreground", children: album.name }),
        album.year ? /* @__PURE__ */ jsx("div", { className: "text-sm text-muted-foreground", children: album.year }) : null
      ] })
    ] }) }) }, album.id)) }) }),
    /* @__PURE__ */ jsx("div", { className: "text-center pt-4 border-t", children: /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "text-primary hover:underline", children: "\u2190 Back to Dashboard" }) })
  ] });
}

export { ArtistAlbums as component };
//# sourceMappingURL=_id_-2hXJE3IJ.mjs.map
