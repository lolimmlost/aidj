import { jsxs, jsx } from 'react/jsx-runtime';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, Link } from '@tanstack/react-router';
import { SunIcon, MoonIcon, CheckIcon } from 'lucide-react';
import { R as Route$8, B as Button, a as authQueryOptions, u as useTheme, c as cn } from './ssr.mjs';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
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
import 'zustand';
import 'crypto';
import '@tanstack/history';
import '@tanstack/router-core/ssr/server';
import '@tanstack/react-router/ssr/server';
import 'better-auth/react';

function DropdownMenu({
  ...props
}) {
  return /* @__PURE__ */ jsx(DropdownMenuPrimitive.Root, { "data-slot": "dropdown-menu", ...props });
}
function DropdownMenuTrigger({
  ...props
}) {
  return /* @__PURE__ */ jsx(DropdownMenuPrimitive.Trigger, { "data-slot": "dropdown-menu-trigger", ...props });
}
function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}) {
  return /* @__PURE__ */ jsx(DropdownMenuPrimitive.Portal, { children: /* @__PURE__ */ jsx(
    DropdownMenuPrimitive.Content,
    {
      "data-slot": "dropdown-menu-content",
      sideOffset,
      className: cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
        className
      ),
      ...props
    }
  ) });
}
function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    DropdownMenuPrimitive.CheckboxItem,
    {
      "data-slot": "dropdown-menu-checkbox-item",
      className: cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      ),
      checked,
      ...props,
      children: [
        /* @__PURE__ */ jsx("span", { className: "pointer-events-none absolute left-2 flex size-3.5 items-center justify-center", children: /* @__PURE__ */ jsx(DropdownMenuPrimitive.ItemIndicator, { children: /* @__PURE__ */ jsx(CheckIcon, { className: "size-4" }) }) }),
        children
      ]
    }
  );
}
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return /* @__PURE__ */ jsxs(DropdownMenu, { children: [
    /* @__PURE__ */ jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "icon", children: [
      /* @__PURE__ */ jsx(SunIcon, { className: "h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" }),
      /* @__PURE__ */ jsx(MoonIcon, { className: "absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" }),
      /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Toggle theme" })
    ] }) }),
    /* @__PURE__ */ jsxs(DropdownMenuContent, { align: "end", children: [
      /* @__PURE__ */ jsx(
        DropdownMenuCheckboxItem,
        {
          checked: theme === "light",
          onCheckedChange: (v) => v && setTheme("light"),
          children: "Light"
        }
      ),
      /* @__PURE__ */ jsx(
        DropdownMenuCheckboxItem,
        {
          checked: theme === "dark",
          onCheckedChange: (v) => v && setTheme("dark"),
          children: "Dark"
        }
      ),
      /* @__PURE__ */ jsx(
        DropdownMenuCheckboxItem,
        {
          checked: theme === "system",
          onCheckedChange: (v) => v && setTheme("system"),
          children: "System"
        }
      )
    ] })
  ] });
}
function Home() {
  const {
    user
  } = Route$8.useLoaderData();
  const queryClient = useQueryClient();
  const router = useRouter();
  return /* @__PURE__ */ jsxs("div", { className: "flex min-h-svh flex-col items-center justify-center gap-10 p-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold sm:text-4xl", children: "React TanStarter" }),
      /* @__PURE__ */ jsxs("div", { className: "text-foreground/80 flex items-center gap-2 text-sm max-sm:flex-col", children: [
        "This is an unprotected page:",
        /* @__PURE__ */ jsx("pre", { className: "bg-card text-card-foreground rounded-md border p-1", children: "routes/index.tsx" })
      ] })
    ] }),
    user ? /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-2", children: [
      /* @__PURE__ */ jsxs("p", { children: [
        "Welcome back, ",
        user.name,
        "!"
      ] }),
      /* @__PURE__ */ jsx(Button, { type: "button", asChild: true, className: "mb-2 w-fit", size: "lg", children: /* @__PURE__ */ jsx(Link, { to: "/dashboard", children: "Go to Dashboard" }) }),
      /* @__PURE__ */ jsxs("div", { className: "text-center text-xs sm:text-sm", children: [
        "Session user:",
        /* @__PURE__ */ jsx("pre", { className: "max-w-screen overflow-x-auto px-2 text-start", children: JSON.stringify(user, null, 2) })
      ] }),
      /* @__PURE__ */ jsx(Button, { onClick: async () => {
        await authClient.signOut({
          fetchOptions: {
            onResponse: async () => {
              queryClient.setQueryData(authQueryOptions().queryKey, null);
              await router.invalidate();
            }
          }
        });
      }, type: "button", className: "w-fit", variant: "destructive", size: "lg", children: "Sign out" })
    ] }) : /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-2", children: [
      /* @__PURE__ */ jsx("p", { children: "You are not signed in." }),
      /* @__PURE__ */ jsx(Button, { type: "button", asChild: true, className: "w-fit", size: "lg", children: /* @__PURE__ */ jsx(Link, { to: "/login", children: "Log in" }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-2", children: [
      /* @__PURE__ */ jsxs("p", { className: "text-foreground/80 max-sm:text-xs", children: [
        "A minimal starter template for",
        " ",
        /* @__PURE__ */ jsxs("a", { className: "text-foreground group", href: "https://tanstack.com/start/latest", target: "_blank", rel: "noreferrer noopener", children: [
          "\u{1F3DD}\uFE0F ",
          /* @__PURE__ */ jsx("span", { className: "group-hover:underline", children: "TanStack Start" })
        ] }),
        "."
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxs("a", { className: "text-foreground/80 hover:text-foreground underline max-sm:text-sm", href: "https://github.com/dotnize/react-tanstarter", target: "_blank", rel: "noreferrer noopener", children: [
          /* @__PURE__ */ jsxs("svg", { role: "img", viewBox: "0 0 24 24", xmlns: "http://www.w3.org/2000/svg", className: "mr-1.5 inline size-4", fill: "currentColor", children: [
            /* @__PURE__ */ jsx("title", { children: "GitHub" }),
            /* @__PURE__ */ jsx("path", { d: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" })
          ] }),
          "dotnize/react-tanstarter"
        ] }),
        /* @__PURE__ */ jsx(ThemeToggle, {})
      ] })
    ] })
  ] });
}

export { Home as component };
//# sourceMappingURL=index-Drn_zOcs.mjs.map
