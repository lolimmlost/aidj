import { jsx, jsxs } from 'react/jsx-runtime';
import { useParams } from '@tanstack/react-router';
import { C as Card, a as CardHeader, b as CardTitle, d as CardDescription, c as CardContent } from './card-B5xu2Fa9.mjs';
import { b as useAudioStore, B as Button } from './ssr.mjs';
import { useQuery } from '@tanstack/react-query';
import { a as authClient } from './auth-client-DKMEFgUO.mjs';
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
import 'lucide-react';
import 'zustand';
import 'crypto';
import '@tanstack/history';
import '@tanstack/router-core/ssr/server';
import '@tanstack/react-router/ssr/server';
import 'better-auth/react';

function RecommendationDetail() {
  var _a;
  const {
    id
  } = useParams({
    from: "/dashboard/recommendations/[id]"
  });
  const {
    data: session
  } = authClient.useSession();
  const addToQueue = useAudioStore((state) => state.playSong);
  const song = atob(id);
  const {
    data: recommendation,
    isLoading,
    error
  } = useQuery({
    queryKey: ["recommendation-detail", id, session == null ? void 0 : session.user.id],
    queryFn: async () => {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: `Provide a detailed explanation why "${song}" is recommended based on user listening history and preferences. Return as JSON: {"explanation": "detailed reason"}`
        })
      });
      if (!response.ok) throw new Error("Failed to fetch recommendation detail");
      const data = await response.json();
      data.timestamp = (/* @__PURE__ */ new Date()).toISOString();
      return data;
    },
    enabled: !!session
  });
  if (isLoading) return /* @__PURE__ */ jsx("p", { className: "container mx-auto p-6", children: "Loading detail..." });
  if (error) return /* @__PURE__ */ jsxs("p", { className: "container mx-auto p-6 text-destructive", children: [
    "Error: ",
    error.message
  ] });
  const parsed = ((_a = recommendation.data.recommendations) == null ? void 0 : _a.find((r) => r.song === song)) || {
    explanation: recommendation.data.explanation || "No explanation available."
  };
  const explanation = parsed.explanation;
  btoa(song);
  const feedback = getFeedback(song);
  const handleFeedback = (type) => {
    setFeedback(song, type);
  };
  const handleQueue = (s) => {
    addToQueue(s, [{
      id: s,
      name: s,
      albumId: "",
      duration: 0,
      track: 1,
      url: "",
      artist: ""
    }]);
  };
  return /* @__PURE__ */ jsx("div", { className: "container mx-auto p-6", children: /* @__PURE__ */ jsxs(Card, { className: "bg-card text-card-foreground border-card", children: [
    /* @__PURE__ */ jsxs(CardHeader, { children: [
      /* @__PURE__ */ jsx(CardTitle, { children: song }),
      /* @__PURE__ */ jsxs(CardDescription, { children: [
        "Generated at ",
        new Date(recommendation.timestamp).toLocaleString(),
        " (timeout: 5s)"
      ] })
    ] }),
    /* @__PURE__ */ jsxs(CardContent, { className: "space-y-4", children: [
      /* @__PURE__ */ jsx("p", { className: "text-muted-foreground whitespace-pre-wrap", children: explanation }),
      /* @__PURE__ */ jsxs("div", { className: "space-x-2", children: [
        /* @__PURE__ */ jsx(Button, { variant: feedback.up ? "default" : "ghost", onClick: () => handleFeedback("up"), children: "\u{1F44D}" }),
        /* @__PURE__ */ jsx(Button, { variant: feedback.down ? "default" : "ghost", onClick: () => handleFeedback("down"), children: "\u{1F44E}" })
      ] }),
      /* @__PURE__ */ jsx(Button, { variant: "ghost", onClick: () => handleQueue(song), children: "Add to Queue" })
    ] })
  ] }) });
}
function getFeedback(song) {
  const songKey = btoa(song);
  const stored = localStorage.getItem(songKey);
  if (!stored) return {
    up: false,
    down: false
  };
  try {
    return JSON.parse(atob(stored));
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
  localStorage.setItem(songKey, btoa(JSON.stringify(feedback)));
}

export { RecommendationDetail as component };
//# sourceMappingURL=_id_-o3HuTrGr.mjs.map
