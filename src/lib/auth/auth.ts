import { createServerOnlyFn } from "@tanstack/react-start";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { env } from "~/env/server";
import { db } from "~/lib/db";

const getAuthConfig = createServerOnlyFn(() =>
  betterAuth({
    baseURL: env.VITE_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
    }),

    // Cookie configuration for Cloudflare tunnel / reverse proxy
    // https://www.better-auth.com/docs/concepts/cookies
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none" as const,
        secure: true,
        httpOnly: true,
        path: "/",
      },
    },

    // https://www.better-auth.com/docs/integrations/tanstack#usage-tips
    plugins: [tanstackStartCookies()],

    // Configure trusted origins
    trustedOrigins: [
      env.VITE_BASE_URL || "",
      // Include localhost in development
      ...(process.env.NODE_ENV === "development"
        ? ["http://localhost:3003", "http://127.0.0.1:3003"]
        : []
      ),
    ].filter(Boolean),

    // https://www.better-auth.com/docs/concepts/session-management#session-caching
    // NOTE: cookieCache is disabled because it doesn't work with tanstackStartCookies
    // See: https://github.com/better-auth/better-auth/issues/5639

    // https://www.better-auth.com/docs/concepts/oauth
    // Only include social providers if credentials are available
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && {
      socialProviders: {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        },
        ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }),
      },
    }),

    // https://www.better-auth.com/docs/authentication/email-password
    emailAndPassword: {
      enabled: true,
    },
  }),
);

export const auth = getAuthConfig();
