import { jsxs, jsx } from 'react/jsx-runtime';
import { Link } from '@tanstack/react-router';
import { GalleryVerticalEnd, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { e as Route$3, B as Button } from './ssr.mjs';
import { I as Input } from './input-Cp6Zj0xY.mjs';
import { L as Label } from './label-DJNj9mF1.mjs';
import { a as authClient } from './auth-client-DKMEFgUO.mjs';
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
import 'zustand';
import 'crypto';
import '@tanstack/history';
import '@tanstack/router-core/ssr/server';
import '@tanstack/react-router/ssr/server';
import '@radix-ui/react-label';
import 'better-auth/react';

function LoginForm() {
  const {
    redirectUrl
  } = Route$3.useRouteContext();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading) return;
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");
    if (!email || !password) return;
    setIsLoading(true);
    setErrorMessage("");
    authClient.signIn.email({
      email,
      password,
      callbackURL: redirectUrl
    }, {
      onError: (ctx) => {
        setErrorMessage(ctx.error.message);
        setIsLoading(false);
      }
      // better-auth seems to trigger a hard navigation on login,
      // so we don't have to revalidate & navigate ourselves
      // onSuccess: () => {
      //   queryClient.removeQueries({ queryKey: authQueryOptions().queryKey });
      //   navigate({ to: redirectUrl });
      // },
    });
  };
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-6", children: [
    /* @__PURE__ */ jsx("form", { onSubmit: handleSubmit, children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-2", children: [
        /* @__PURE__ */ jsxs("a", { href: "#", className: "flex flex-col items-center gap-2 font-medium", children: [
          /* @__PURE__ */ jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-md", children: /* @__PURE__ */ jsx(GalleryVerticalEnd, { className: "size-6" }) }),
          /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Acme Inc." })
        ] }),
        /* @__PURE__ */ jsx("h1", { className: "text-xl font-bold", children: "Welcome back to Acme Inc." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-5", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid gap-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "email", children: "Email" }),
          /* @__PURE__ */ jsx(Input, { id: "email", name: "email", type: "email", placeholder: "hello@example.com", readOnly: isLoading, required: true })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid gap-2", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "password", children: "Password" }),
          /* @__PURE__ */ jsx(Input, { id: "password", name: "password", type: "password", placeholder: "Enter password here", readOnly: isLoading, required: true })
        ] }),
        /* @__PURE__ */ jsxs(Button, { type: "submit", className: "mt-2 w-full", size: "lg", disabled: isLoading, children: [
          isLoading && /* @__PURE__ */ jsx(LoaderCircle, { className: "animate-spin" }),
          isLoading ? "Logging in..." : "Login"
        ] })
      ] }),
      errorMessage && /* @__PURE__ */ jsx("span", { className: "text-destructive text-center text-sm", children: errorMessage }),
      /* @__PURE__ */ jsx("div", { className: "after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t", children: /* @__PURE__ */ jsx("span", { className: "bg-background text-muted-foreground relative z-10 px-2", children: "Or" }) }),
      /* @__PURE__ */ jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [
        /* @__PURE__ */ jsxs(Button, { variant: "outline", className: "w-full", type: "button", disabled: isLoading, onClick: () => authClient.signIn.social({
          provider: "github",
          callbackURL: redirectUrl
        }, {
          onRequest: () => {
            setIsLoading(true);
            setErrorMessage("");
          },
          onError: (ctx) => {
            setIsLoading(false);
            setErrorMessage(ctx.error.message);
          }
        }), children: [
          /* @__PURE__ */ jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", children: /* @__PURE__ */ jsx("path", { d: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12", fill: "currentColor" }) }),
          "Login with GitHub"
        ] }),
        /* @__PURE__ */ jsxs(
          Button,
          {
            variant: "outline",
            className: "w-full",
            type: "button",
            disabled: true,
            onClick: () => authClient.signIn.social({
              provider: "google",
              callbackURL: redirectUrl
            }, {
              onRequest: () => {
                setIsLoading(true);
                setErrorMessage("");
              },
              onError: (ctx) => {
                setIsLoading(false);
                setErrorMessage(ctx.error.message);
              }
            }),
            children: [
              /* @__PURE__ */ jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", children: /* @__PURE__ */ jsx("path", { d: "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z", fill: "currentColor" }) }),
              "Login with Google"
            ]
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "text-center text-sm", children: [
      "Don't have an account?",
      " ",
      /* @__PURE__ */ jsx(Link, { to: "/signup", className: "underline underline-offset-4", children: "Sign up" })
    ] })
  ] });
}

export { LoginForm as component };
//# sourceMappingURL=login-CH8FbVqW.mjs.map
