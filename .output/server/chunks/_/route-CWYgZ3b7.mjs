import { jsxs, jsx } from 'react/jsx-runtime';
import { Link, Outlet } from '@tanstack/react-router';
import { B as Button } from './ssr.mjs';
import '@tanstack/react-query';
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

function DashboardLayout() {
  return /* @__PURE__ */ jsxs("div", { className: "flex min-h-svh flex-col items-center justify-center gap-10 p-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold sm:text-4xl", children: "Dashboard Layout" }),
      /* @__PURE__ */ jsxs("div", { className: "text-foreground/80 flex items-center gap-2 text-sm max-sm:flex-col", children: [
        "This is a protected layout:",
        /* @__PURE__ */ jsx("pre", { className: "bg-card text-card-foreground rounded-md border p-1", children: "routes/dashboard/route.tsx" })
      ] }),
      /* @__PURE__ */ jsx(Button, { type: "button", asChild: true, className: "w-fit", size: "lg", children: /* @__PURE__ */ jsx(Link, { to: "/", children: "Back to index" }) })
    ] }),
    /* @__PURE__ */ jsx(Outlet, {})
  ] });
}

export { DashboardLayout as component };
//# sourceMappingURL=route-CWYgZ3b7.mjs.map
