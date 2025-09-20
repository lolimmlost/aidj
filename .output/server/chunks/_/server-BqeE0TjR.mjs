import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { reactStartCookies } from 'better-auth/react-start';
import { i as env, j as db } from './ssr.mjs';
import '@tanstack/react-query';
import '@tanstack/react-router';
import 'react/jsx-runtime';
import 'react';
import '@tanstack/router-ssr-query-core';
import '@radix-ui/react-slot';
import 'class-variance-authority';
import 'clsx';
import 'tailwind-merge';
import '@tanstack/react-devtools';
import '@tanstack/react-query-devtools';
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

const getAuthConfig = () => betterAuth({
  baseURL: env.VITE_BASE_URL,
  database: drizzleAdapter(db, {
    provider: "pg"
  }),
  // https://www.better-auth.com/docs/integrations/tanstack#usage-tips
  plugins: [reactStartCookies()],
  // https://www.better-auth.com/docs/concepts/session-management#session-caching
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60
      // 5 minutes
    }
  },
  // https://www.better-auth.com/docs/concepts/oauth
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET
    }
  },
  // https://www.better-auth.com/docs/authentication/email-password
  emailAndPassword: {
    enabled: true
  }
});
const auth = getAuthConfig();

export { auth };
//# sourceMappingURL=server-BqeE0TjR.mjs.map
