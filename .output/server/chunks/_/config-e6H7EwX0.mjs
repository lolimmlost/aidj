import { jsx, jsxs } from 'react/jsx-runtime';
import { Link } from '@tanstack/react-router';
import { B as Button } from './ssr.mjs';
import { I as Input } from './input-Cp6Zj0xY.mjs';
import { L as Label } from './label-DJNj9mF1.mjs';
import { C as Card, a as CardHeader, b as CardTitle, c as CardContent } from './card-B5xu2Fa9.mjs';
import { useState, useEffect } from 'react';
import '@tanstack/react-query';
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
import '@radix-ui/react-label';

function ConfigPage() {
  var _a, _b, _c;
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [testStatuses, setTestStatuses] = useState(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    fetch("/api/config", {
      method: "GET"
    }).then((r) => r.json()).then((data) => {
      if (data == null ? void 0 : data.config) {
        setConfig({
          ollamaUrl: data.config.ollamaUrl,
          navidromeUrl: data.config.navidromeUrl,
          lidarrUrl: data.config.lidarrUrl
        });
      }
    }).catch(() => {
    });
  }, []);
  const update = (key, value) => {
    setConfig((prev) => ({
      ...prev,
      [key]: value
    }));
  };
  const onSubmit = async (e) => {
    var _a2;
    e.preventDefault();
    if (loading) return;
    setStatus(null);
    setLoading(true);
    const payload = {
      ollamaUrl: config.ollamaUrl,
      navidromeUrl: config.navidromeUrl,
      lidarrUrl: config.lidarrUrl
    };
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setStatus("Configuration saved");
      } else {
        setStatus((_a2 = json == null ? void 0 : json.error) != null ? _a2 : "Save failed");
      }
    } catch {
      setStatus("Request failed");
    } finally {
      setLoading(false);
    }
  };
  const runTestConnections = async () => {
    setTesting(true);
    setTestStatuses(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          test: true
        })
      });
      const json = await res.json();
      if (res.ok && (json == null ? void 0 : json.statuses)) {
        setTestStatuses(json.statuses);
      } else {
        setTestStatuses({
          ollamaUrl: "unreachable",
          navidromeUrl: "unreachable",
          lidarrUrl: "unreachable"
        });
      }
    } catch {
      setTestStatuses({
        ollamaUrl: "unreachable",
        navidromeUrl: "unreachable",
        lidarrUrl: "unreachable"
      });
    } finally {
      setTesting(false);
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "container mx-auto p-6 max-w-2xl", children: /* @__PURE__ */ jsxs(Card, { children: [
    /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { className: "text-3xl font-bold tracking-tight", children: "Service Configuration" }) }),
    /* @__PURE__ */ jsxs(CardContent, { className: "space-y-6 pt-6", children: [
      /* @__PURE__ */ jsxs("form", { onSubmit, className: "space-y-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "ollamaUrl", children: "Ollama URL" }),
          /* @__PURE__ */ jsx(Input, { id: "ollamaUrl", name: "ollamaUrl", type: "url", placeholder: "http://localhost:11434", value: (_a = config.ollamaUrl) != null ? _a : "", onChange: (e) => update("ollamaUrl", e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "navidromeUrl", children: "Navidrome URL" }),
          /* @__PURE__ */ jsx(Input, { id: "navidromeUrl", name: "navidromeUrl", type: "url", placeholder: "http://localhost:4533", value: (_b = config.navidromeUrl) != null ? _b : "", onChange: (e) => update("navidromeUrl", e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "lidarrUrl", children: "Lidarr URL" }),
          /* @__PURE__ */ jsx(Input, { id: "lidarrUrl", name: "lidarrUrl", type: "url", placeholder: "http://localhost:8686", value: (_c = config.lidarrUrl) != null ? _c : "", onChange: (e) => update("lidarrUrl", e.target.value) })
        ] }),
        /* @__PURE__ */ jsx(Button, { type: "submit", className: "w-full", size: "lg", disabled: loading, children: loading ? "Saving..." : "Save Configuration" })
      ] }),
      status && /* @__PURE__ */ jsx("div", { className: `text-sm text-center p-3 rounded-md ${status.includes("saved") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`, children: status }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsx(Button, { type: "button", className: "w-full", variant: "outline", onClick: runTestConnections, disabled: testing, children: testing ? "Testing Connections..." : "Test Service Connections" }),
        testStatuses && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-muted/50 rounded-lg", children: [
          /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
            /* @__PURE__ */ jsx("div", { className: "font-medium mb-1", children: "Ollama" }),
            /* @__PURE__ */ jsx("div", { className: `text-sm px-2 py-1 rounded ${testStatuses.ollamaUrl === "connected" ? "bg-green-100 text-green-800" : testStatuses.ollamaUrl === "not configured" ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-800"}`, children: testStatuses.ollamaUrl || "Not configured" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
            /* @__PURE__ */ jsx("div", { className: "font-medium mb-1", children: "Navidrome" }),
            /* @__PURE__ */ jsx("div", { className: `text-sm px-2 py-1 rounded ${testStatuses.navidromeUrl === "connected" ? "bg-green-100 text-green-800" : testStatuses.navidromeUrl === "not configured" ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-800"}`, children: testStatuses.navidromeUrl || "Not configured" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
            /* @__PURE__ */ jsx("div", { className: "font-medium mb-1", children: "Lidarr" }),
            /* @__PURE__ */ jsx("div", { className: `text-sm px-2 py-1 rounded ${testStatuses.lidarrUrl === "connected" ? "bg-green-100 text-green-800" : testStatuses.lidarrUrl === "not configured" ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-800"}`, children: testStatuses.lidarrUrl || "Not configured" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "text-center pt-4 border-t", children: /* @__PURE__ */ jsx(Link, { to: "/dashboard", className: "text-primary hover:underline", children: "\u2190 Back to Dashboard" }) })
    ] })
  ] }) });
}

export { ConfigPage as component };
//# sourceMappingURL=config-e6H7EwX0.mjs.map
