import { jsxs, jsx } from 'react/jsx-runtime';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { g as getArtists, B as Button } from './ssr.mjs';
import { User, Loader2 } from 'lucide-react';
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from './select-CvrjXar6.mjs';
import { C as Card, c as CardContent } from './card-B5xu2Fa9.mjs';
import { Link } from '@tanstack/react-router';
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
import '@radix-ui/react-select';

function ArtistsList() {
  const [genre, setGenre] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const { data: artists = [], isLoading, error } = useQuery({
    queryKey: ["artists", genre],
    queryFn: () => getArtists(0, 50)
  });
  if (error) {
    return /* @__PURE__ */ jsxs("div", { children: [
      "Error loading artists: ",
      error.message
    ] });
  }
  let filteredArtists = artists;
  if (genre !== "all") {
    filteredArtists = artists.filter((a) => a.name.toLowerCase().includes(genre.toLowerCase()));
  }
  const sortedArtists = [...filteredArtists].sort((a, b) => a.name.localeCompare(b.name));
  const handleClearFilters = () => {
    setGenre("all");
  };
  return /* @__PURE__ */ jsxs("div", { className: "container mx-auto p-6 space-y-6", children: [
    /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(CardContent, { className: "p-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-start mb-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx(User, { className: "h-6 w-6 text-muted-foreground" }),
          /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Artists" })
        ] }),
        /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "text-primary hover:underline text-sm", children: "\u2190 Dashboard" })
      ] }),
      /* @__PURE__ */ jsxs(Button, { variant: "outline", onClick: () => setShowFilters(!showFilters), className: "mb-4", children: [
        showFilters ? "Hide" : "Show",
        " Filters"
      ] }),
      showFilters && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs(Select, { value: genre, onValueChange: setGenre, children: [
          /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Filter by genre" }) }),
          /* @__PURE__ */ jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsx(SelectItem, { value: "all", children: "All Genres" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "rock", children: "Rock" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "pop", children: "Pop" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "jazz", children: "Jazz" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "classical", children: "Classical" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "hip hop", children: "Hip Hop" })
          ] })
        ] }) }),
        /* @__PURE__ */ jsx("div", { className: "flex items-end gap-2", children: /* @__PURE__ */ jsx(Button, { variant: "outline", onClick: handleClearFilters, children: "Clear Filters" }) })
      ] })
    ] }) }),
    isLoading ? /* @__PURE__ */ jsx("div", { className: "flex justify-center py-12", children: /* @__PURE__ */ jsx(Loader2, { className: "h-8 w-8 animate-spin text-muted-foreground" }) }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", children: sortedArtists.map((artist) => /* @__PURE__ */ jsx(Card, { className: "cursor-pointer transition-shadow hover:shadow-md border-border/50", children: /* @__PURE__ */ jsx(CardContent, { className: "p-6 hover:bg-accent hover:text-accent-foreground", children: /* @__PURE__ */ jsxs(
      Link,
      {
        to: "/library/artists/id",
        params: { id: artist.id },
        className: "flex items-center gap-3 h-full",
        children: [
          /* @__PURE__ */ jsx("div", { className: "w-12 h-12 bg-muted rounded-full flex items-center justify-center", children: /* @__PURE__ */ jsx(User, { className: "h-5 w-5 text-muted-foreground" }) }),
          /* @__PURE__ */ jsx("div", { className: "flex-1 min-w-0", children: /* @__PURE__ */ jsx("div", { className: "font-semibold truncate", children: artist.name }) })
        ]
      }
    ) }) }, artist.id)) }),
    sortedArtists.length === 0 && !isLoading && /* @__PURE__ */ jsx(Card, { className: "text-center py-12", children: /* @__PURE__ */ jsxs(CardContent, { children: [
      /* @__PURE__ */ jsx("p", { className: "text-muted-foreground", children: "No artists found." }),
      /* @__PURE__ */ jsx("p", { className: "text-sm mt-2 text-muted-foreground", children: "Try adjusting your filters or check your library configuration." })
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "text-center pt-4 border-t", children: /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "text-primary hover:underline", children: "\u2190 Back to Dashboard" }) })
  ] });
}
const SplitComponent = ArtistsList;

export { SplitComponent as component };
//# sourceMappingURL=artists-B6sUB2vv.mjs.map
