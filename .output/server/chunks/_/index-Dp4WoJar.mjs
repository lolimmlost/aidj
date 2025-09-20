import { jsxs, jsx } from 'react/jsx-runtime';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { a as authClient } from './auth-client-DKMEFgUO.mjs';
import { b as useAudioStore, B as Button, s as search } from './ssr.mjs';
import { C as Card, a as CardHeader, b as CardTitle, d as CardDescription, c as CardContent } from './card-B5xu2Fa9.mjs';
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from './select-CvrjXar6.mjs';
import { I as Input } from './input-Cp6Zj0xY.mjs';
import 'better-auth/react';
import '@t3-oss/env-core';
import 'zod';
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
import 'drizzle-orm/postgres-js';
import 'postgres';
import 'drizzle-orm/pg-core';
import 'tiny-invariant';
import 'tiny-warning';
import '@tanstack/router-core';
import '@tanstack/router-core/ssr/client';
import 'node:async_hooks';
import 'sonner';
import 'lucide-react';
import 'zustand';
import 'crypto';
import '@tanstack/history';
import '@tanstack/router-core/ssr/server';
import '@tanstack/react-router/ssr/server';
import '@radix-ui/react-select';

function xorEncrypt(str, key) {
  return str.split("").map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join("");
}
function xorDecrypt(encryptedStr, key) {
  return encryptedStr.split("").map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join("");
}
const ENCRYPT_KEY = "mySecretKey12345";
function getFeedback(song) {
  const songKey = btoa(song);
  const stored = localStorage.getItem(songKey);
  if (!stored) return {
    up: false,
    down: false
  };
  try {
    const decryptedStr = xorDecrypt(atob(stored), ENCRYPT_KEY);
    return JSON.parse(decryptedStr);
  } catch {
    return {
      up: false,
      down: false
    };
  }
}
function setFeedback(song, type) {
  const songKey = btoa(song);
  const feedback = {
    up: type === "up",
    down: type === "down"
  };
  const jsonStr = JSON.stringify(feedback);
  const encryptedStr = xorEncrypt(jsonStr, ENCRYPT_KEY);
  localStorage.setItem(songKey, btoa(encryptedStr));
}
function DashboardIndex() {
  const [type, setType] = useState("similar");
  const {
    data: session
  } = authClient.useSession();
  const queryClient = useQueryClient();
  const addToQueue = useAudioStore((state) => state.playSong);
  const addPlaylist = useAudioStore((state) => state.addPlaylist);
  const [style, setStyle] = useState("");
  const trimmedStyle = style.trim();
  const styleHash = btoa(trimmedStyle);
  const {
    data: recommendations,
    isLoading,
    error
  } = useQuery({
    queryKey: ["recommendations", session == null ? void 0 : session.user.id, type],
    queryFn: async () => {
      const prompt = type === "similar" ? "similar artists to your favorites" : "mood-based recommendations for relaxation";
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt
        })
      });
      if (!response.ok) throw new Error("Failed to fetch recommendations");
      const data = await response.json();
      data.timestamp = (/* @__PURE__ */ new Date()).toISOString();
      return data;
    },
    enabled: !!session
  });
  const handleFeedback = (song, type2) => {
    setFeedback(song, type2);
    queryClient.invalidateQueries({
      queryKey: ["recommendations", session == null ? void 0 : session.user.id, type2]
    });
  };
  const handleQueue = async (song) => {
    try {
      console.log("Queuing recommendation:", song);
      const songs = await search(song, 0, 1);
      console.log("Search results for queue:", songs);
      if (songs.length > 0) {
        const realSong = songs[0];
        addToQueue(realSong.id, [realSong]);
        console.log("Queued song:", realSong);
      } else {
        handleAddToLidarr(song);
      }
    } catch (error2) {
      console.error("Search failed for queue:", error2);
      handleAddToLidarr(song);
    }
  };
  const {
    data: playlistData,
    isLoading: playlistLoading,
    error: playlistError,
    refetch: refetchPlaylist
  } = useQuery({
    queryKey: ["playlist", styleHash, trimmedStyle],
    queryFn: async () => {
      const cached = localStorage.getItem(`playlist-${styleHash}`);
      if (cached) {
        return JSON.parse(cached);
      }
      const response = await fetch("/api/playlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          style: trimmedStyle
        })
      });
      if (!response.ok) throw new Error("Failed to fetch playlist");
      const data = await response.json();
      localStorage.setItem(`playlist-${styleHash}`, JSON.stringify(data));
      return data;
    },
    enabled: !!trimmedStyle && !!session
  });
  const handlePlaylistQueue = () => {
    if (!playlistData) return;
    const resolvedSongs = playlistData.data.playlist.filter((item) => item.songId).map((item) => ({
      id: item.songId,
      name: item.song,
      albumId: "",
      duration: 0,
      track: 1,
      url: item.url
    }));
    if (resolvedSongs.length > 0) {
      addPlaylist(resolvedSongs);
    } else {
      alert("No songs available in library for this playlist.");
    }
  };
  const handleAddToLidarr = async (song) => {
    try {
      const response = await fetch("/api/lidarr/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          song
        })
      });
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error2) {
      alert("Failed to add to Lidarr. Please check configuration.");
    }
  };
  const clearPlaylistCache = () => {
    Object.keys(localStorage).filter((key) => key.startsWith("playlist-")).forEach((key) => localStorage.removeItem(key));
    queryClient.invalidateQueries({
      queryKey: ["playlist"]
    });
    setStyle("");
  };
  return /* @__PURE__ */ jsxs("div", { className: "container mx-auto p-6 space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-bold tracking-tight mb-2", children: "Music Dashboard" }),
      /* @__PURE__ */ jsx("p", { className: "text-muted-foreground max-w-md mx-auto", children: "Welcome to your music library. Explore artists, search for songs, and enjoy seamless playback." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-2xl font-semibold", children: "AI Recommendations" }),
        /* @__PURE__ */ jsxs(Select, { value: type, onValueChange: (value) => setType(value), children: [
          /* @__PURE__ */ jsx(SelectTrigger, { className: "w-[180px]", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Type" }) }),
          /* @__PURE__ */ jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsx(SelectItem, { value: "similar", children: "Similar Artists" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "mood", children: "Mood-Based" })
          ] })
        ] })
      ] }),
      isLoading && /* @__PURE__ */ jsx("p", { children: "Loading recommendations..." }),
      error && /* @__PURE__ */ jsxs("p", { className: "text-destructive", children: [
        "Error loading recommendations: ",
        error.message
      ] }),
      recommendations && /* @__PURE__ */ jsxs(Card, { className: "bg-card text-card-foreground border-card", children: [
        /* @__PURE__ */ jsxs(CardHeader, { children: [
          /* @__PURE__ */ jsx(CardTitle, { children: "Based on your history" }),
          /* @__PURE__ */ jsxs(CardDescription, { children: [
            "Generated at ",
            new Date(recommendations.timestamp).toLocaleString(),
            " (timeout: 5s)"
          ] })
        ] }),
        /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: recommendations.data.recommendations.map((rec, index) => {
          const feedback = getFeedback(rec.song);
          const songId = btoa(rec.song);
          return /* @__PURE__ */ jsxs("li", { className: "flex flex-col space-y-2 p-2 border rounded", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
              /* @__PURE__ */ jsx(Link, { to: "/dashboard/recommendations/id", params: {
                id: songId
              }, className: "hover:underline", children: rec.song }),
              /* @__PURE__ */ jsxs("div", { className: "space-x-2", children: [
                /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: () => handleQueue(rec.song), children: "Queue" }),
                /* @__PURE__ */ jsx(Button, { variant: feedback.up ? "default" : "ghost", size: "sm", onClick: () => handleFeedback(rec.song, "up"), children: "\u{1F44D}" }),
                /* @__PURE__ */ jsx(Button, { variant: feedback.down ? "default" : "ghost", size: "sm", onClick: () => handleFeedback(rec.song, "down"), children: "\u{1F44E}" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("p", { className: "text-sm text-muted-foreground", children: [
              rec.explanation.substring(0, 100),
              "..."
            ] })
          ] }, index);
        }) }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-2xl font-semibold", children: "Style-Based Playlist" }),
        /* @__PURE__ */ jsx(Button, { onClick: clearPlaylistCache, variant: "outline", size: "sm", children: "Clear Cache" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsx(Input, { placeholder: "Enter style (e.g., Halloween, rock, holiday)", value: style, onChange: (e) => setStyle(e.target.value), className: "flex-1" }),
        /* @__PURE__ */ jsx(Button, { onClick: () => {
          localStorage.removeItem(`playlist-${styleHash}`);
          queryClient.invalidateQueries({
            queryKey: ["playlist", styleHash, trimmedStyle]
          });
          refetchPlaylist();
        }, disabled: !trimmedStyle, children: "Generate" })
      ] }),
      playlistLoading && /* @__PURE__ */ jsx("p", { children: "Loading playlist..." }),
      playlistError && /* @__PURE__ */ jsxs("p", { className: "text-destructive", children: [
        "Error: ",
        playlistError.message
      ] }),
      playlistData && /* @__PURE__ */ jsxs(Card, { className: "bg-card text-card-foreground border-card", children: [
        /* @__PURE__ */ jsxs(CardHeader, { children: [
          /* @__PURE__ */ jsxs(CardTitle, { children: [
            'Generated Playlist for "',
            style,
            '"'
          ] }),
          /* @__PURE__ */ jsx(CardDescription, { children: "10 suggestions from your library. Add to queue or provide feedback." })
        ] }),
        /* @__PURE__ */ jsxs(CardContent, { children: [
          /* @__PURE__ */ jsx("div", { className: "flex justify-between mb-4", children: /* @__PURE__ */ jsx(Button, { onClick: handlePlaylistQueue, children: "Add Entire Playlist to Queue" }) }),
          /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: playlistData.data.playlist.map((item, index) => {
            const feedback = getFeedback(item.song);
            return /* @__PURE__ */ jsxs("li", { className: "flex flex-col space-y-2 p-2 border rounded", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
                /* @__PURE__ */ jsx("span", { className: "font-medium", children: item.song }),
                /* @__PURE__ */ jsxs("div", { className: "space-x-2", children: [
                  item.songId ? /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: () => addToQueue(item.songId, [{
                    id: item.songId,
                    name: item.song,
                    albumId: "",
                    duration: 0,
                    track: 1,
                    url: item.url
                  }]), children: "Queue" }) : /* @__PURE__ */ jsx(Button, { variant: "destructive", size: "sm", onClick: () => handleAddToLidarr(item.song), children: "Add to Lidarr" }),
                  /* @__PURE__ */ jsx(Button, { variant: feedback.up ? "default" : "ghost", size: "sm", onClick: () => handleFeedback(item.song, "up"), children: "\u{1F44D}" }),
                  /* @__PURE__ */ jsx(Button, { variant: feedback.down ? "default" : "ghost", size: "sm", onClick: () => handleFeedback(item.song, "down"), children: "\u{1F44E}" })
                ] })
              ] }),
              /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: item.explanation }),
              item.missing && /* @__PURE__ */ jsx("p", { className: "text-xs text-destructive", children: "Not in library - consider adding via Lidarr" })
            ] }, index);
          }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", children: [
      /* @__PURE__ */ jsxs(Link, { to: "/", className: "card card-hover p-6 text-center block", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold mb-2", children: "Home" }),
        /* @__PURE__ */ jsx("p", { className: "text-muted-foreground text-sm", children: "Return to the main page" })
      ] }),
      /* @__PURE__ */ jsxs(Link, { to: "/login", className: "card card-hover p-6 text-center block", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold mb-2", children: "Login" }),
        /* @__PURE__ */ jsx("p", { className: "text-muted-foreground text-sm", children: "Sign in to your account" })
      ] }),
      /* @__PURE__ */ jsxs(Link, { to: "/signup", className: "card card-hover p-6 text-center block", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold mb-2", children: "Signup" }),
        /* @__PURE__ */ jsx("p", { className: "text-muted-foreground text-sm", children: "Create a new account" })
      ] }),
      /* @__PURE__ */ jsxs(Link, { to: "/config", className: "card card-hover p-6 text-center block", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold mb-2", children: "Service Configuration" }),
        /* @__PURE__ */ jsx("p", { className: "text-muted-foreground text-sm", children: "Configure your music service" })
      ] }),
      /* @__PURE__ */ jsxs(Link, { to: "/library/search", className: "card card-hover p-6 text-center block", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold mb-2", children: "Search Library" }),
        /* @__PURE__ */ jsx("p", { className: "text-muted-foreground text-sm", children: "Find your favorite songs" })
      ] }),
      /* @__PURE__ */ jsxs(Link, { to: "/library/artists", className: "card card-hover p-6 text-center block", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold mb-2", children: "Browse Artists" }),
        /* @__PURE__ */ jsx("p", { className: "text-muted-foreground text-sm", children: "Explore artists and albums" })
      ] }),
      /* @__PURE__ */ jsxs(Link, { to: "/library/artists/id", params: {
        id: "08jJDtStA34urKpsWC7xHt"
      }, className: "card card-hover p-6 text-center block", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold mb-2", children: "Artist Detail" }),
        /* @__PURE__ */ jsx("p", { className: "text-muted-foreground text-sm", children: "View artist information (Example)" })
      ] }),
      /* @__PURE__ */ jsxs(Link, { to: "/library/artists/id/albums/albumId", params: {
        id: "08jJDtStA34urKpsWC7xHt",
        albumId: "1"
      }, className: "card card-hover p-6 text-center block", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold mb-2", children: "Album Detail" }),
        /* @__PURE__ */ jsx("p", { className: "text-muted-foreground text-sm", children: "View album tracks (Example)" })
      ] })
    ] })
  ] });
}

export { DashboardIndex as component };
//# sourceMappingURL=index-Dp4WoJar.mjs.map
