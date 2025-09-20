import { jsxs, jsx } from 'react/jsx-runtime';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { b as useAudioStore, s as search } from './ssr.mjs';
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
import 'lucide-react';
import 'zustand';
import 'crypto';
import '@tanstack/history';
import '@tanstack/router-core/ssr/server';
import '@tanstack/react-router/ssr/server';

function SearchPage() {
  const [query, setQuery] = useState("");
  const {
    playSong
  } = useAudioStore();
  const {
    data: songs = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ["search", query],
    queryFn: () => search(query.trim(), 0, 50),
    enabled: query.trim().length > 0
  });
  const handleInputChange = (e) => {
    console.log("Input change:", e.target.value);
    setQuery(e.target.value);
  };
  const handleSongClick = (songId) => {
    playSong(songId, songs);
  };
  if (error) {
    return /* @__PURE__ */ jsxs("div", { style: {
      padding: "20px"
    }, children: [
      "Error searching: ",
      error.message
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { style: {
    padding: "20px",
    maxWidth: "800px",
    margin: "0 auto"
  }, children: [
    /* @__PURE__ */ jsx("h1", { style: {
      fontSize: "28px",
      fontWeight: "bold",
      marginBottom: "20px"
    }, children: "Search Music Library" }),
    /* @__PURE__ */ jsxs("div", { style: {
      marginBottom: "20px"
    }, children: [
      /* @__PURE__ */ jsx("label", { style: {
        display: "block",
        marginBottom: "5px",
        fontWeight: "bold"
      }, children: "Test Input:" }),
      /* @__PURE__ */ jsx("input", { type: "text", placeholder: "Type here to test...", value: query, onChange: handleInputChange, style: {
        width: "100%",
        maxWidth: "400px",
        padding: "10px",
        border: "2px solid #ccc",
        borderRadius: "4px",
        fontSize: "16px",
        outline: "none"
      } }),
      /* @__PURE__ */ jsxs("div", { style: {
        marginTop: "10px",
        fontSize: "14px",
        color: "#666"
      }, children: [
        'Debug: Query = "',
        query,
        '" (length: ',
        query.length,
        ") | Songs: ",
        songs.length,
        " | Loading: ",
        isLoading ? "Yes" : "No"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: {
      marginBottom: "20px"
    }, children: /* @__PURE__ */ jsx(Link, { to: "/dashboard", style: {
      color: "#3b82f6",
      textDecoration: "none"
    }, children: "\u2190 Back to Dashboard" }) }),
    isLoading ? /* @__PURE__ */ jsx("div", { style: {
      textAlign: "center",
      padding: "40px"
    }, children: /* @__PURE__ */ jsx("div", { children: "Loading..." }) }) : query.trim().length === 0 ? /* @__PURE__ */ jsx("div", { style: {
      textAlign: "center",
      padding: "40px",
      color: "#666"
    }, children: "Enter a search term above to find songs in your library." }) : songs.length === 0 ? /* @__PURE__ */ jsxs("div", { style: {
      textAlign: "center",
      padding: "40px",
      color: "#666"
    }, children: [
      /* @__PURE__ */ jsxs("h3", { children: [
        'No results found for "',
        query,
        '"'
      ] }),
      /* @__PURE__ */ jsxs("p", { style: {
        marginTop: "10px"
      }, children: [
        'Try different keywords. Debug: Query="',
        query,
        '", Length=',
        query.length
      ] })
    ] }) : /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { style: {
        marginBottom: "20px",
        fontWeight: "bold"
      }, children: [
        "Found ",
        songs.length,
        " songs"
      ] }),
      /* @__PURE__ */ jsx("div", { style: {
        marginBottom: "20px"
      }, children: songs.map((song) => /* @__PURE__ */ jsx("div", { style: {
        border: "1px solid #ddd",
        borderRadius: "8px",
        padding: "15px",
        marginBottom: "10px",
        cursor: "pointer",
        backgroundColor: "#f9f9f9"
      }, onClick: () => handleSongClick(song.id), children: /* @__PURE__ */ jsxs("div", { style: {
        display: "flex",
        alignItems: "center"
      }, children: [
        /* @__PURE__ */ jsx("div", { style: {
          width: "40px",
          textAlign: "right",
          marginRight: "15px",
          color: "#666"
        }, children: song.track }),
        /* @__PURE__ */ jsxs("div", { style: {
          flex: 1
        }, children: [
          /* @__PURE__ */ jsx("div", { style: {
            fontWeight: "bold",
            marginBottom: "5px"
          }, children: song.name }),
          /* @__PURE__ */ jsxs("div", { style: {
            fontSize: "14px",
            color: "#666"
          }, children: [
            "Duration: ",
            Math.floor(song.duration / 60),
            ":",
            (song.duration % 60).toString().padStart(2, "0")
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { style: {
          marginLeft: "15px",
          color: "#666"
        }, children: "\u25B6" })
      ] }) }, song.id)) })
    ] })
  ] });
}

export { SearchPage as component };
//# sourceMappingURL=search-Z6a0SiXq.mjs.map
