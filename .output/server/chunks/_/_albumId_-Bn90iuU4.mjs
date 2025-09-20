import { jsxs, jsx } from 'react/jsx-runtime';
import { useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { h as getSongs, A as AudioPlayer } from './ssr.mjs';
import { Loader2 } from 'lucide-react';
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

function AlbumSongs() {
  const {
    albumId
  } = useParams({
    from: "/library/artists/id/albums/albumId"
  });
  const [currentSongId, setCurrentSongId] = useState(void 0);
  const {
    data: songs = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ["songs", albumId],
    queryFn: () => getSongs(albumId, 0, 50)
    // Fetch first 50 songs for the album
  });
  if (error) {
    return /* @__PURE__ */ jsxs("div", { className: "container mx-auto p-4", children: [
      "Error loading songs: ",
      error.message
    ] });
  }
  const sortedSongs = [...songs].sort((a, b) => a.track - b.track);
  return /* @__PURE__ */ jsxs("div", { className: "container mx-auto p-4", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-2xl font-bold mb-4", children: "Songs" }),
    isLoading ? /* @__PURE__ */ jsx("div", { className: "flex justify-center", children: /* @__PURE__ */ jsx(Loader2, { className: "h-8 w-8 animate-spin" }) }) : /* @__PURE__ */ jsx("div", { className: "space-y-2", children: sortedSongs.map((song) => /* @__PURE__ */ jsxs("div", { className: "flex items-center p-3 border rounded hover:bg-gray-100 cursor-pointer", onClick: () => setCurrentSongId(song.id), children: [
      /* @__PURE__ */ jsx("div", { className: "w-8 text-right mr-4", children: song.track }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsx("div", { className: "font-medium", children: song.name }),
        /* @__PURE__ */ jsxs("div", { className: "text-sm text-gray-600", children: [
          "Duration: ",
          Math.floor(song.duration / 60),
          ":",
          (song.duration % 60).toString().padStart(2, "0")
        ] })
      ] })
    ] }, song.id)) }),
    sortedSongs.length > 0 && /* @__PURE__ */ jsx(AudioPlayer, { songs: sortedSongs, initialSongId: currentSongId })
  ] });
}

export { AlbumSongs as component };
//# sourceMappingURL=_albumId_-Bn90iuU4.mjs.map
